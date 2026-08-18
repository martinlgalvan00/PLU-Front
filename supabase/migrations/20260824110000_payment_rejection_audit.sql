-- Auditoría de rechazo de pagos — quién rechazó y por qué, en la propia orden
--
-- Hasta acá el rechazo dejaba la orden en 'rechazado' y la trazabilidad vivía
-- dispersa: el rechazo manual guardaba actor y motivo en domain_audit_logs, y
-- el rechazo de Mercado Pago dejaba el status_detail en athlete_payments. La
-- orden en sí —lo que ve Finanzas en la bandeja— no decía NI quién la rechazó
-- NI por qué. Ante un reclamo había que cruzar logs a mano.
--
-- Acá la orden guarda la decisión donde se lee:
--   rejected_by      — 'mercado_pago' cuando lo rechazó el proveedor por
--                      webhook; 'staff:<id>:<email>' cuando fue decisión de
--                      Finanzas (mismo actor_label que usa la API).
--   rejection_reason — el status_detail del proveedor, o el motivo que escribió
--                      el operador al rechazar.
--   rejected_at      — ya existía; la RPC de tickets ahora también lo setea
--                      (quedaba en null y la fecha real era solo updated_at).
--
-- El histórico no se backfill-ea: esas órdenes siguen resolviéndose por
-- domain_audit_logs, que sigue grabándose igual.

alter table public.athlete_payment_orders
  add column if not exists rejected_by text,
  add column if not exists rejection_reason text;

alter table public.ticket_orders
  add column if not exists rejected_by text,
  add column if not exists rejection_reason text;

-- ---------------------------------------------------------------------------
-- Rechazo del proveedor (webhook): atar el status_detail a la orden
-- ---------------------------------------------------------------------------

create or replace function public.apply_mercado_pago_payment(
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
  v_order public.athlete_payment_orders;
  v_payment public.athlete_payments;
  v_existing_payment public.athlete_payments;
  v_entitlement_payment_id uuid;
  v_order_status text;
  v_previous_status text;
  v_membership public.memberships;
  v_registration public.event_registrations;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_order
  from public.athlete_payment_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'mercado_pago' then
    raise exception 'La orden no pertenece a Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_order.amount or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Monto o moneda no coinciden con la orden.' using errcode = 'PLU11';
  end if;

  v_previous_status := v_order.status;

  select * into v_existing_payment
  from public.athlete_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> p_order_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;

  insert into public.athlete_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at, organization_id
  ) values (
    p_order_id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end,
    v_order.organization_id
  )
  on conflict (external_payment_id) do update set
    status = case
      when public.athlete_payments.status in ('aprobado', 'reembolsado')
        and excluded.status not in ('aprobado', 'reembolsado')
      then public.athlete_payments.status
      else excluded.status
    end,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.athlete_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  select case
    when bool_or(status = 'aprobado') then 'aprobado'
    when bool_or(status = 'pendiente') then 'pendiente'
    when bool_or(status = 'reembolsado') then 'reembolsado'
    when bool_or(status = 'rechazado') then 'rechazado'
    else 'cancelado'
  end into v_order_status
  from public.athlete_payments
  where order_id = p_order_id;

  update public.athlete_payment_orders
  set status = v_order_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when v_order_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when v_order_status = 'rechazado' then now() else rejected_at end,
      rejected_by = case
        when v_order_status = 'rechazado' then 'mercado_pago'
        else rejected_by
      end,
      rejection_reason = case
        when v_order_status = 'rechazado' then coalesce(p_status_detail, rejection_reason)
        else rejection_reason
      end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order_status = 'aprobado' then
    select id into v_entitlement_payment_id
    from public.athlete_payments
    where order_id = p_order_id and status = 'aprobado'
    order by confirmed_at desc nulls last, updated_at desc
    limit 1;

    if v_order.concept in ('membership', 'combo') then
      update public.memberships
      set status = 'activa', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null then
        insert into public.membership_cycles (
          membership_id, order_id, payment_id, starts_at, ends_at, status, organization_id
        ) values (
          v_membership.id, p_order_id, v_entitlement_payment_id,
          coalesce(v_membership.start_date, current_date),
          coalesce(v_membership.expiration_date, (current_date + interval '1 year')::date),
          'active', v_order.organization_id
        )
        on conflict (membership_id, order_id) do update set
          payment_id = excluded.payment_id,
          status = 'active',
          updated_at = now();

        update public.athletes
        set status = 'afiliado_activo', updated_at = now()
        where id = v_order.athlete_id;
      end if;
    end if;

    if v_order.concept in ('registration', 'combo') then
      update public.event_registrations
      set status = 'confirmada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
    end if;
  elsif v_order_status in ('reembolsado', 'cancelado') then
    if v_order.concept in ('membership', 'combo') then
      update public.membership_cycles
      set status = case when v_order_status = 'reembolsado' then 'refunded' else 'cancelled' end,
          updated_at = now()
      where order_id = p_order_id;

      update public.memberships
      set status = case when v_order_status = 'reembolsado' then 'reembolsada' else 'cancelada' end,
          updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null and not exists (
        select 1 from public.memberships m
        where m.athlete_id = v_order.athlete_id
          and m.id <> v_membership.id
          and m.status = 'activa'
          and coalesce(m.expiration_date, current_date) >= current_date
      ) then
        update public.athletes
        set status = 'registrado', updated_at = now()
        where id = v_order.athlete_id and status = 'afiliado_activo';
      end if;
    end if;

    if v_order.concept in ('registration', 'combo') then
      update public.event_registrations
      set status = 'cancelada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
    end if;
  end if;

  -- Auditoria: un registro por intento aplicado y uno por derecho afectado.
  -- La clave del reclamo es siempre el external_payment_id, asi que viaja en
  -- la metadata de todos.
  perform plu_private.record_domain_audit(
    'payment.applied',
    'athlete_payment_order',
    p_order_id::text,
    'webhook',
    p_external_payment_id,
    jsonb_build_object(
      'paymentStatus', p_status,
      'orderStatus', v_order_status,
      'previousStatus', v_previous_status,
      'externalPaymentId', p_external_payment_id,
      'amount', p_amount,
      'currency', upper(p_currency),
      'concept', v_order.concept,
      'statusDetail', p_status_detail
    ),
    v_order.organization_id
  );

  if v_membership.id is not null then
    perform plu_private.record_domain_audit(
      case when v_order_status = 'aprobado' then 'membership.activated' else 'membership.revoked' end,
      'membership', v_membership.id::text, 'webhook', p_external_payment_id,
      jsonb_build_object(
        'orderId', p_order_id,
        'memberCode', v_membership.member_code,
        'expirationDate', v_membership.expiration_date,
        'status', v_membership.status,
        'channel', 'mercado_pago'
      ),
      v_order.organization_id
    );
  end if;

  if v_registration.id is not null then
    perform plu_private.record_domain_audit(
      case when v_order_status = 'aprobado' then 'registration.confirmed' else 'registration.cancelled' end,
      'event_registration', v_registration.id::text, 'webhook', p_external_payment_id,
      jsonb_build_object(
        'orderId', p_order_id,
        'eventId', v_registration.event_id,
        'status', v_registration.status,
        'channel', 'mercado_pago'
      ),
      v_order.organization_id
    );
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

revoke all on function public.apply_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  to service_role;

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
  v_existing_payment public.ticket_payments;
  v_order_status text;
  v_tickets jsonb;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'mercado_pago' then
    raise exception 'La orden no pertenece a Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_order.amount or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Monto o moneda no coinciden con la orden.' using errcode = 'PLU11';
  end if;

  select * into v_existing_payment
  from public.ticket_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> p_order_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
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
    status = case
      when public.ticket_payments.status in ('aprobado', 'reembolsado')
        and excluded.status not in ('aprobado', 'reembolsado')
      then public.ticket_payments.status
      else excluded.status
    end,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.ticket_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  select case
    when bool_or(status = 'aprobado') then 'aprobado'
    when bool_or(status = 'pendiente') then 'pendiente'
    when bool_or(status = 'reembolsado') then 'reembolsado'
    when bool_or(status = 'rechazado') then 'rechazado'
    else 'cancelado'
  end into v_order_status
  from public.ticket_payments
  where order_id = p_order_id;

  update public.ticket_orders
  set status = v_order_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when v_order_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when v_order_status = 'rechazado' then now() else rejected_at end,
      rejected_by = case
        when v_order_status = 'rechazado' then 'mercado_pago'
        else rejected_by
      end,
      rejection_reason = case
        when v_order_status = 'rechazado' then coalesce(p_status_detail, rejection_reason)
        else rejection_reason
      end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order_status = 'aprobado' then
    update public.tickets set status = 'pagada', updated_at = now()
    where order_id = p_order_id and status <> 'pagada';
  elsif v_order_status in ('cancelado', 'reembolsado') then
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

-- ---------------------------------------------------------------------------
-- Rechazo manual (Finanzas): persistir actor y motivo en la orden
-- ---------------------------------------------------------------------------

create or replace function public.reject_athlete_payment_order(
  p_order_id uuid,
  p_reason text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_cash boolean;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se rechazan por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'rechazado' then
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true);
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite rechazo.' using errcode = 'PLU10';
  end if;

  v_cash := coalesce(v_order.manual_payment_channel, 'bank_transfer') = 'cash_pitbull';
  if v_order.payment_proof_path is null and not v_cash then
    raise exception 'No hay comprobante para rechazar.' using errcode = 'PLU10';
  end if;

  update public.athlete_payment_orders
  set status = 'rechazado',
      rejected_at = now(),
      rejected_by = coalesce(p_actor, 'staff:desconocido'),
      rejection_reason = p_reason,
      updated_at = now()
  where id = p_order_id returning * into v_order;

  -- El cupo vuelve a estar disponible: la inscripción deja de contar para
  -- `get_event_registration_capacity`, que suma pendiente_pago/pagada/confirmada.
  update public.event_registrations
  set status = 'cancelada', updated_at = now()
  where payment_order_id = p_order_id and status = 'pendiente_pago';

  perform plu_private.record_domain_audit(
    'payment.rejected_manually', 'athlete_payment_order', p_order_id::text,
    'staff', p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'reason', p_reason,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'hasPaymentProof', v_order.payment_proof_path is not null
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

revoke all on function public.reject_athlete_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_athlete_payment_order(uuid, text, text)
  to service_role;

create or replace function public.reject_ticket_payment_order(
  p_order_id uuid,
  p_reason text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_tickets jsonb;
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago solo se rechaza por webhook.' using errcode = 'PLU01';
  end if;
  if v_order.status = 'rechazado' then
    select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status <> 'pendiente' or v_order.payment_proof_path is null then
    raise exception 'La orden necesita un comprobante pendiente de revision.' using errcode = 'PLU03';
  end if;

  update public.ticket_orders
  set status = 'rechazado',
      reservation_expires_at = null,
      rejected_at = now(),
      rejected_by = coalesce(p_actor, 'staff:desconocido'),
      rejection_reason = p_reason,
      updated_at = now()
  where id = p_order_id returning * into v_order;
  -- Libera el cupo que estaban reteniendo: mismo efecto que el vencimiento
  -- de reserva, pero por decisión del staff en vez de timeout.
  update public.tickets set status = 'cancelada', updated_at = now()
  where order_id = p_order_id and status = 'pendiente_pago';

  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values(
    'ticket_order.rejected', 'ticket_order', p_order_id::text, 'staff', p_actor,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

revoke all on function public.reject_ticket_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_ticket_payment_order(uuid, text, text)
  to service_role;
