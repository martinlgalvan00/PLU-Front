-- Smoke transaccional del sistema de pagos. Requiere las migraciones hasta
-- 20260715000500 y no deja datos: cualquier falla aborta y el final hace rollback.

begin;

do $test$
declare
  v_athlete_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_second_order_id uuid := gen_random_uuid();
  v_membership_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_ticket_order_id uuid := gen_random_uuid();
  v_ticket_id uuid := gen_random_uuid();
  v_event_retry_id uuid := gen_random_uuid();
  v_event_stale_id uuid := gen_random_uuid();
  v_status text;
  v_count int;
  v_claim jsonb;
  v_next_retry_at timestamptz;
  v_locked_at timestamptz;
begin
  insert into public.athletes (
    id, full_name, document_id, email, status
  ) values (
    v_athlete_id, 'Payment Smoke Test', 'SMOKE-' || v_athlete_id,
    'payment-smoke-' || v_athlete_id || '@example.invalid', 'registrado'
  );

  insert into public.athlete_payment_orders (
    id, athlete_id, concept, amount, currency, method, status, reference
  ) values (
    v_order_id, v_athlete_id, 'membership', 38000, 'ARS',
    'mercado_pago', 'pendiente', 'SMOKE-ORDER-' || v_order_id
  );

  insert into public.memberships (
    id, athlete_id, year, status, start_date, expiration_date,
    member_code, payment_order_id
  ) values (
    v_membership_id, v_athlete_id, 'smoke-' || v_order_id,
    'pendiente_pago', current_date, current_date + 365,
    'SMOKE-' || v_membership_id, v_order_id
  );

  -- Un rechazo inicial queda rechazado.
  perform public.apply_mercado_pago_payment(
    v_order_id, 'smoke-rejected-' || v_order_id, 'rechazado',
    38000, 'ARS', 'smoke@example.invalid', 'cc_rejected_other_reason', '{}'::jsonb
  );
  select status into v_status from public.athlete_payment_orders where id = v_order_id;
  if v_status <> 'rechazado' then
    raise exception 'Smoke: se esperaba orden rechazada y se obtuvo %.', v_status;
  end if;

  -- Otro intento aprobado gana y activa el derecho.
  perform public.apply_mercado_pago_payment(
    v_order_id, 'smoke-approved-' || v_order_id, 'aprobado',
    38000, 'ARS', 'smoke@example.invalid', 'accredited', '{}'::jsonb
  );
  select status into v_status from public.athlete_payment_orders where id = v_order_id;
  if v_status <> 'aprobado' then
    raise exception 'Smoke: se esperaba orden aprobada y se obtuvo %.', v_status;
  end if;
  select status into v_status from public.memberships where id = v_membership_id;
  if v_status <> 'activa' then
    raise exception 'Smoke: la membresia no fue activada; estado %.', v_status;
  end if;

  -- Un webhook tardio del intento rechazado no degrada la orden aprobada.
  perform public.apply_mercado_pago_payment(
    v_order_id, 'smoke-rejected-' || v_order_id, 'rechazado',
    38000, 'ARS', 'smoke@example.invalid', 'cc_rejected_other_reason', '{}'::jsonb
  );
  select status into v_status from public.athlete_payment_orders where id = v_order_id;
  if v_status <> 'aprobado' then
    raise exception 'Smoke: un rechazo tardio degrado la orden a %.', v_status;
  end if;

  -- Repetir la aprobacion es idempotente: no duplica el ledger ni el ciclo.
  perform public.apply_mercado_pago_payment(
    v_order_id, 'smoke-approved-' || v_order_id, 'aprobado',
    38000, 'ARS', 'smoke@example.invalid', 'accredited', '{}'::jsonb
  );
  select count(*) into v_count from public.athlete_payments
  where external_payment_id = 'smoke-approved-' || v_order_id;
  if v_count <> 1 then
    raise exception 'Smoke: el retry duplico el pago (% filas).', v_count;
  end if;
  select count(*) into v_count from public.membership_cycles
  where membership_id = v_membership_id and order_id = v_order_id;
  if v_count <> 1 then
    raise exception 'Smoke: el retry duplico el ciclo (% filas).', v_count;
  end if;

  -- El reembolso del unico intento aprobado revoca el derecho.
  perform public.apply_mercado_pago_payment(
    v_order_id, 'smoke-approved-' || v_order_id, 'reembolsado',
    38000, 'ARS', 'smoke@example.invalid', 'refunded', '{}'::jsonb
  );
  select status into v_status from public.athlete_payment_orders where id = v_order_id;
  if v_status <> 'reembolsado' then
    raise exception 'Smoke: se esperaba orden reembolsada y se obtuvo %.', v_status;
  end if;
  select status into v_status from public.memberships where id = v_membership_id;
  if v_status <> 'reembolsada' then
    raise exception 'Smoke: se esperaba membresia reembolsada y se obtuvo %.', v_status;
  end if;

  -- Monto incorrecto y reutilizacion cross-order deben fallar cerrados.
  begin
    perform public.apply_mercado_pago_payment(
      v_order_id, 'smoke-bad-amount-' || v_order_id, 'aprobado',
      1, 'ARS', null, null, '{}'::jsonb
    );
    raise exception 'Smoke: se acepto un monto incorrecto.';
  exception when sqlstate 'PLU11' then
    null;
  end;

  insert into public.athlete_payment_orders (
    id, athlete_id, concept, amount, currency, method, status, reference
  ) values (
    v_second_order_id, v_athlete_id, 'membership', 38000, 'ARS',
    'mercado_pago', 'pendiente', 'SMOKE-ORDER-' || v_second_order_id
  );
  begin
    perform public.apply_mercado_pago_payment(
      v_second_order_id, 'smoke-approved-' || v_order_id, 'aprobado',
      38000, 'ARS', null, null, '{}'::jsonb
    );
    raise exception 'Smoke: se reutilizo un payment id en otra orden.';
  exception when sqlstate 'PLU13' then
    null;
  end;

  -- El mismo arbitraje se verifica para entradas.
  insert into public.events (
    id, slug, title, venue, location, starts_at, ends_at, published
  ) values (
    v_event_id, 'payment-smoke-' || v_event_id, 'Payment Smoke Event',
    'Test', 'Test', now() + interval '1 day', now() + interval '2 days', false
  );
  insert into public.ticket_orders (
    id, event_id, buyer_name, buyer_email, amount, currency, provider, status, reference
  ) values (
    v_ticket_order_id, v_event_id, 'Smoke', 'smoke@example.invalid',
    1000, 'ARS', 'mercado_pago', 'pendiente', 'SMOKE-TICKET-' || v_ticket_order_id
  );
  insert into public.tickets (
    id, ticket_code, order_id, event_id, attendee_name, attendee_dni,
    day_pass, unit_price, status
  ) values (
    v_ticket_id, 'SMOKE-' || v_ticket_id, v_ticket_order_id, v_event_id,
    'Smoke', 'SMOKE', 'day1', 1000, 'pendiente_pago'
  );

  perform public.apply_ticket_mercado_pago_payment(
    v_ticket_order_id, 'smoke-ticket-approved-' || v_ticket_order_id,
    'aprobado', 1000, 'ARS', null, null, '{}'::jsonb
  );
  perform public.apply_ticket_mercado_pago_payment(
    v_ticket_order_id, 'smoke-ticket-rejected-' || v_ticket_order_id,
    'rechazado', 1000, 'ARS', null, null, '{}'::jsonb
  );
  select status into v_status from public.ticket_orders where id = v_ticket_order_id;
  if v_status <> 'aprobado' then
    raise exception 'Smoke: rechazo tardio degrado ticket order a %.', v_status;
  end if;
  select status into v_status from public.tickets where id = v_ticket_id;
  if v_status <> 'pagada' then
    raise exception 'Smoke: la entrada no quedo pagada; estado %.', v_status;
  end if;

  -- Backoff, lock vencido y override operativo de eventos durables.
  insert into public.payment_integration_events (
    id, notification_id, resource_id, event_type, signature_valid,
    status, attempts_count, max_attempts, next_retry_at
  ) values (
    v_event_retry_id, 'smoke-retry-' || v_event_retry_id, 'smoke-resource',
    'payment', true, 'failed', 0, 2, now()
  );

  v_claim := public.claim_payment_integration_event(v_event_retry_id, false);
  if v_claim ->> 'status' <> 'processing' or (v_claim ->> 'attempts_count')::int <> 1 then
    raise exception 'Smoke: el evento no fue reclamado atomicamente.';
  end if;
  perform public.complete_payment_integration_event(
    v_event_retry_id, false, null, 'provider unavailable'
  );
  select next_retry_at, locked_at into v_next_retry_at, v_locked_at
  from public.payment_integration_events where id = v_event_retry_id;
  if v_next_retry_at <= now() or v_locked_at is not null then
    raise exception 'Smoke: la falla no libero el lock o no programo backoff.';
  end if;

  update public.payment_integration_events
  set attempts_count = max_attempts, status = 'failed', next_retry_at = now()
  where id = v_event_retry_id;
  if public.claim_payment_integration_event(v_event_retry_id, false) is not null then
    raise exception 'Smoke: se reclamo un evento agotado sin force.';
  end if;
  if public.claim_payment_integration_event(v_event_retry_id, true) is null then
    raise exception 'Smoke: el retry manual no pudo reclamar un evento agotado.';
  end if;

  insert into public.payment_integration_events (
    id, notification_id, resource_id, event_type, signature_valid,
    status, attempts_count, max_attempts, next_retry_at, locked_at
  ) values (
    v_event_stale_id, 'smoke-stale-' || v_event_stale_id, 'smoke-resource-stale',
    'payment', true, 'processing', 1, 8, now(), now() - interval '11 minutes'
  );
  perform * from public.claim_due_payment_integration_events(100);
  select status, locked_at into v_status, v_locked_at
  from public.payment_integration_events where id = v_event_stale_id;
  if v_status <> 'processing' or v_locked_at is null or v_locked_at < now() - interval '1 minute' then
    raise exception 'Smoke: el worker no recupero el lock vencido.';
  end if;

  if public.get_payment_system_health() ->> 'schemaVersion' <> '20260715000500' then
    raise exception 'Smoke: version de health check inesperada.';
  end if;
end;
$test$;

rollback;
