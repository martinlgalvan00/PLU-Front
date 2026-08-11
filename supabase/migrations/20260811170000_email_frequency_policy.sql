-- Política anti-fatiga de emails.
--
-- Una afiliación recibía avisos a 30, 7, 1 y 0 días, más otro al quedar
-- vencida: hasta cinco correos por ciclo. Conservamos tres hitos con intención
-- clara (30 días, 7 días y el día del vencimiento) y cancelamos, sin borrar la
-- evidencia, los avisos antiguos que todavía no habían salido.

alter table public.membership_renewal_notifications
  drop constraint if exists membership_renewal_notifications_status_check;

alter table public.membership_renewal_notifications
  add constraint membership_renewal_notifications_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

update public.membership_renewal_notifications
set status = 'cancelled',
    error = 'Cancelado por política de frecuencia: se conservan los hitos 30, 7 y 0 días.',
    updated_at = now()
where status in ('pending', 'failed')
  and notification_key in ('expires_in_1', 'expired');

create or replace function public.claim_membership_renewal_notifications(
  p_offsets int[] default array[30, 7, 0],
  p_limit int default 100
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.expire_memberships(current_date);

  insert into public.membership_renewal_notifications (
    membership_id,
    notification_key,
    recipient_email,
    organization_id
  )
  select
    m.id,
    'expires_in_' || o.days::text,
    a.email,
    m.organization_id
  from public.memberships m
  join public.athletes a on a.id = m.athlete_id
  cross join (
    select distinct days
    from unnest(coalesce(p_offsets, array[30, 7, 0])) as requested(days)
    where days = any(array[30, 7, 0])
  ) o
  where m.status = 'activa'
    and m.expiration_date - current_date = o.days
  on conflict (membership_id, notification_key) do nothing;

  return query
  with candidates as (
    select n.id
    from public.membership_renewal_notifications n
    where n.status in ('pending', 'failed')
      and n.notification_key in ('expires_in_30', 'expires_in_7', 'expires_in_0')
      and n.attempts_count < 5
      and n.next_retry_at <= now()
    order by n.created_at
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  ), claimed as (
    update public.membership_renewal_notifications n
    set status = 'processing',
        attempts_count = attempts_count + 1,
        updated_at = now()
    from candidates c
    where n.id = c.id
    returning n.*
  )
  select jsonb_build_object(
    'id', c.id,
    'notificationKey', c.notification_key,
    'recipientEmail', c.recipient_email,
    'attemptsCount', c.attempts_count,
    'membershipId', m.id,
    'memberCode', m.member_code,
    'expirationDate', m.expiration_date,
    'athleteId', a.id,
    'athleteName', a.full_name
  )
  from claimed c
  join public.memberships m on m.id = c.membership_id
  join public.athletes a on a.id = m.athlete_id;
end;
$$;

revoke all on function public.claim_membership_renewal_notifications(int[], int)
  from public, anon, authenticated;
grant execute on function public.claim_membership_renewal_notifications(int[], int)
  to service_role;
