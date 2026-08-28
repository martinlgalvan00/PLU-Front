-- Corrige el hallazgo de `supabase db lint --fail-on warning`:
--   never read variable "v_order" en staff_set_registration_status
--
-- plpgsql_check marca la fila compuesta como escrita (`returning * into v_order`)
-- pero no cuenta como lectura el acceso a campos (`.status`) ni pasarla a
-- `to_jsonb()`. En vez de silenciar el linter, se guardan el estado y el JSON
-- en escalares que sí se consumen explícitamente.

create or replace function public.staff_set_registration_status(
  p_registration_id uuid,
  p_status text,
  p_actor text,
  p_reason text,
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_previous text;
  v_organization_id uuid;
  v_order_status text := null;
  v_order jsonb := null;
begin
  if p_status not in ('confirmada', 'observada', 'cancelada') then
    raise exception 'Estado de inscripcion no permitido desde el panel.' using errcode = 'PLU01';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'El cambio manual exige un motivo.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(trim(p_actor)) = 0 then
    raise exception 'El cambio manual exige un responsable.' using errcode = 'PLU01';
  end if;
  if p_channel is not null and p_channel not in (
    'bank_transfer', 'wise_transfer', 'cash', 'courtesy', 'error_correction', 'sponsor', 'other'
  ) then
    raise exception 'Canal de otorgamiento manual no reconocido.' using errcode = 'PLU01';
  end if;

  select * into v_registration from public.event_registrations
  where id = p_registration_id for update;
  if not found then
    raise exception 'Inscripcion no encontrada.' using errcode = 'PLU02';
  end if;

  v_previous := v_registration.status;
  if v_previous = p_status then
    return jsonb_build_object('registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  update public.event_registrations
  set status = p_status,
      manual_override_status = p_status,
      manual_override_channel = p_channel,
      manual_override_reason = trim(p_reason),
      manual_override_by = p_actor,
      manual_override_at = now(),
      updated_at = now()
  where id = p_registration_id
  returning * into v_registration;

  if p_status = 'confirmada' and v_registration.payment_order_id is not null then
    update public.athlete_payment_orders
    set cancellation_code = case
          when status = 'aprobado' then cancellation_code
          else 'resolved_off_platform'
        end,
        cancellation_reason = case
          when status = 'aprobado' then cancellation_reason
          else trim(p_reason)
        end,
        cancelled_by = case when status = 'aprobado' then cancelled_by else p_actor end,
        cancelled_at = case
          when status = 'aprobado' then cancelled_at
          else coalesce(cancelled_at, now())
        end,
        updated_at = case when status = 'aprobado' then updated_at else now() end
    where id = v_registration.payment_order_id
    returning status into v_order_status;

    select to_jsonb(o) into v_order
    from public.athlete_payment_orders o
    where id = v_registration.payment_order_id;
  end if;

  select organization_id into v_organization_id
  from public.events where id = v_registration.event_id;

  perform plu_private.record_domain_audit(
    'registration.status_changed_manually',
    'event_registration',
    p_registration_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'previousStatus', v_previous,
      'status', p_status,
      'reason', trim(p_reason),
      'channel', p_channel,
      'eventId', v_registration.event_id,
      'athleteId', v_registration.athlete_id,
      'orderId', v_registration.payment_order_id,
      'orderStatusAfter', v_order_status
    ),
    v_organization_id
  );

  return jsonb_build_object(
    'registration', to_jsonb(v_registration),
    'order', v_order,
    'duplicate', false
  );
end;
$$;

revoke all on function public.staff_set_registration_status(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_registration_status(uuid, text, text, text, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_set_registration_status(uuid, text, text, text, text)') is null then
    raise exception 'Falta staff_set_registration_status(uuid, text, text, text, text).'
      using errcode = 'PLU01';
  end if;
end
$verification$;
