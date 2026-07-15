-- Fase 4: completa el circuito de Mercado Pago para entradas y agrega una
-- cola durable de avisos de renovacion. Ninguna orden de Mercado Pago puede
-- aprobarse desde el browser: solo los RPC service_role que consumen el
-- recurso canonico del proveedor mutan el estado automatico.

alter table public.ticket_orders
  add column if not exists idempotency_key text,
  add column if not exists provider_preference_id text,
  add column if not exists provider_init_point text,
  add column if not exists payer_email text,
  add column if not exists provider_payload jsonb,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz;

create unique index if not exists ticket_orders_idempotency_key_uidx
  on public.ticket_orders (idempotency_key) where idempotency_key is not null;
create unique index if not exists ticket_orders_preference_uidx
  on public.ticket_orders (provider_preference_id) where provider_preference_id is not null;

-- Sustituye el alta anual hardcodeada por una operacion guiada por catalogo.
-- Un plan mensual puede activarse desde membership_plans sin volver a tocar
-- codigo; el precio sigue siendo una decision de negocio y no se inventa aca.
drop function if exists public.create_membership_order(uuid, text);
create or replace function public.create_membership_order(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text default 'plu-annual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_existing public.memberships;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_start date;
  v_end date;
  v_year text;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;
  select * into v_plan from public.membership_plans
  where code = p_plan_code and active = true;
  if not found then
    raise exception 'Plan de afiliacion no encontrado.' using errcode = 'PLU02';
  end if;
  if v_plan.collection_mode = 'recurring' and p_payment_method <> 'mercado_pago' then
    raise exception 'Los planes recurrentes requieren Mercado Pago.' using errcode = 'PLU10';
  end if;

  select * into v_existing from public.memberships
  where athlete_id = p_athlete_id
  order by expiration_date desc nulls last
  limit 1;
  if v_existing.status = 'activa' and v_plan.billing_frequency = 'monthly' then
    raise exception 'La afiliacion ya esta activa; la suscripcion administra las renovaciones.' using errcode = 'PLU09';
  end if;

  v_start := greatest(current_date, coalesce(v_existing.expiration_date, current_date));
  if v_plan.billing_frequency = 'monthly' then
    v_end := (v_start + make_interval(months => v_plan.interval_count))::date;
  else
    v_end := (v_start + make_interval(years => v_plan.interval_count))::date;
  end if;
  v_year := extract(year from v_start)::int::text;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference
  ) values (
    p_athlete_id, 'membership', v_plan.price, v_plan.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    (case p_payment_method when 'mercado_pago' then 'MP-' else 'MANUAL-' end)
      || encode(extensions.gen_random_bytes(8), 'hex')
  ) returning * into v_order;

  insert into public.memberships (
    athlete_id, year, status, start_date, expiration_date, member_code,
    payment_order_id, plan_id
  ) values (
    p_athlete_id, v_year, 'pendiente_pago', v_start, v_end,
    public.next_member_code(v_year), v_order.id, v_plan.id
  )
  on conflict (athlete_id, year) do update set
    status = case when public.memberships.status = 'activa' then public.memberships.status else 'pendiente_pago' end,
    payment_order_id = excluded.payment_order_id,
    plan_id = excluded.plan_id,
    start_date = excluded.start_date,
    expiration_date = case when public.memberships.status = 'activa'
      then public.memberships.expiration_date else excluded.expiration_date end,
    updated_at = now()
  returning * into v_membership;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'plan', to_jsonb(v_plan)
  );
end;
$$;

revoke all on function public.create_membership_order(uuid, text, text) from public;
grant execute on function public.create_membership_order(uuid, text, text) to anon, authenticated;

create table if not exists public.ticket_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders (id) on delete restrict,
  external_payment_id text not null unique,
  status text not null
    check (status in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado')),
  amount int not null check (amount >= 0),
  currency text not null default 'ARS',
  payer_email text,
  status_detail text,
  raw_payload jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_payments_order_idx on public.ticket_payments (order_id);
alter table public.ticket_payments enable row level security;
create policy "ticket_payments_staff_read" on public.ticket_payments
  for select to authenticated using (public.can_view_admin_data());
grant select on public.ticket_payments to authenticated;

create or replace function public.apply_ticket_mercado_pago_payment(
  p_order_id uuid,
  p_external_payment_id text,
  p_status text,
  p_amount int,
  p_currency text,
  p_payer_email text default null,
  p_status_detail text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_payment public.ticket_payments;
  v_tickets jsonb;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.provider <> 'mercado_pago' then
    raise exception 'La orden no pertenece a Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_order.amount or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Monto o moneda no coinciden con la orden.' using errcode = 'PLU11';
  end if;

  insert into public.ticket_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at
  ) values (
    p_order_id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end
  )
  on conflict (external_payment_id) do update set
    status = excluded.status,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.ticket_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  update public.ticket_orders
  set status = p_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when p_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when p_status = 'rechazado' then now() else rejected_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if p_status = 'aprobado' then
    update public.tickets set status = 'pagada', updated_at = now()
    where order_id = p_order_id and status = 'pendiente_pago';
  elsif p_status in ('cancelado', 'reembolsado') then
    update public.tickets set status = 'cancelada', updated_at = now()
    where order_id = p_order_id and status <> 'cancelada';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
    into v_tickets from public.tickets t where t.order_id = p_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'tickets', v_tickets
  );
end;
$$;

revoke all on function public.apply_ticket_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_ticket_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  to service_role;

-- Reemplaza definitivamente el stand-in publico de fases anteriores.
create or replace function public.approve_ticket_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_tickets jsonb;
begin
  if not public.can_approve_ticket_payment() then
    raise exception 'No tenes permisos para aprobar esta orden.' using errcode = '42501';
  end if;
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.provider <> 'manual' then
    raise exception 'Los pagos de Mercado Pago solo se aprueban por webhook.' using errcode = 'PLU10';
  end if;

  update public.ticket_orders
  set status = 'aprobado', approved_at = coalesce(approved_at, now()), updated_at = now()
  where id = p_order_id returning * into v_order;
  update public.tickets set status = 'pagada', updated_at = now()
  where order_id = p_order_id and status = 'pendiente_pago';
  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
    into v_tickets from public.tickets t where t.order_id = p_order_id;
  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets);
end;
$$;

revoke all on function public.approve_ticket_order(uuid) from public, anon;
grant execute on function public.approve_ticket_order(uuid) to authenticated;

create table if not exists public.transactional_email_logs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  template_key text not null,
  template_id int,
  recipient_email text not null,
  entity_type text,
  entity_id text,
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  payload jsonb,
  provider_response jsonb,
  error text,
  attempts_count int not null default 1,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactional_email_logs enable row level security;
create policy "transactional_email_logs_staff_read" on public.transactional_email_logs
  for select to authenticated using (public.can_view_admin_data());
grant select on public.transactional_email_logs to authenticated;

create table if not exists public.membership_renewal_notifications (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  notification_key text not null,
  recipient_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts_count int not null default 0,
  next_retry_at timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (membership_id, notification_key)
);

alter table public.membership_renewal_notifications enable row level security;
create policy "membership_renewal_notifications_staff_read"
  on public.membership_renewal_notifications for select to authenticated
  using (public.can_view_admin_data());
grant select on public.membership_renewal_notifications to authenticated;

create or replace function public.claim_membership_renewal_notifications(
  p_offsets int[] default array[30, 7, 1, 0],
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
    membership_id, notification_key, recipient_email
  )
  select m.id, 'expires_in_' || o.days::text, a.email
  from public.memberships m
  join public.athletes a on a.id = m.athlete_id
  cross join unnest(p_offsets) as o(days)
  where m.status = 'activa'
    and m.expiration_date - current_date = o.days
  on conflict (membership_id, notification_key) do nothing;

  insert into public.membership_renewal_notifications (
    membership_id, notification_key, recipient_email
  )
  select m.id, 'expired', a.email
  from public.memberships m
  join public.athletes a on a.id = m.athlete_id
  where m.status = 'vencida'
  on conflict (membership_id, notification_key) do nothing;

  return query
  with candidates as (
    select n.id
    from public.membership_renewal_notifications n
    where n.status in ('pending', 'failed')
      and n.attempts_count < 5
      and n.next_retry_at <= now()
    order by n.created_at
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  ), claimed as (
    update public.membership_renewal_notifications n
    set status = 'processing', attempts_count = attempts_count + 1, updated_at = now()
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

create or replace function public.complete_membership_renewal_notification(
  p_notification_id uuid,
  p_sent boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.membership_renewal_notifications
  set status = case when p_sent then 'sent' else 'failed' end,
      sent_at = case when p_sent then now() else sent_at end,
      error = case when p_sent then null else left(coalesce(p_error, 'Error desconocido'), 2000) end,
      next_retry_at = case when p_sent then next_retry_at
        else now() + make_interval(mins => least(1440, (15 * power(2, greatest(attempts_count - 1, 0)))::int)) end,
      updated_at = now()
  where id = p_notification_id;
end;
$$;

revoke all on function public.complete_membership_renewal_notification(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_membership_renewal_notification(uuid, boolean, text)
  to service_role;
