-- El vencimiento de entradas no se come un comprobante, y una orden ya
-- cancelada con comprobante se puede reabrir para que Finanzas la acredite.
-- Abre transacción y hace rollback: no deja fixtures.

begin;

do $ticket_expiry$
declare
  v_event uuid := gen_random_uuid();
  v_type uuid := gen_random_uuid();
  v_bare uuid := gen_random_uuid();
  v_held uuid := gen_random_uuid();
  v_rejected uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_settle uuid := gen_random_uuid();
  v_status text;
  v_reservation text;
  v_expires int;
  v_result jsonb;
begin
  insert into public.events (
    id, slug, title, venue, location, starts_at, ends_at, published
  ) values (
    v_event, 'ticket-expiry-' || v_event, 'Ticket expiry smoke',
    'Test', 'Test', now() + interval '1 day', now() + interval '2 days', false
  );
  insert into public.ticket_types (id, event_id, name, price)
  values (v_type, v_event, 'Smoke', 15000);

  insert into public.ticket_orders (
    id, event_id, buyer_name, buyer_email, amount, currency, provider,
    manual_payment_channel, status, reference, reservation_expires_at
  ) values
    (v_bare, v_event, 'Sin comprobante', 'bare@example.invalid', 15000, 'ARS',
     'manual', 'bank_transfer', 'pendiente', 'SMOKE-BARE-' || v_bare, now() - interval '1 minute'),
    (v_held, v_event, 'Con comprobante', 'held@example.invalid', 15000, 'ARS',
     'manual', 'bank_transfer', 'pendiente', 'SMOKE-HELD-' || v_held, now() - interval '1 minute');

  update public.ticket_orders
  set payment_proof_path = v_held::text || '/comprobante.jpg',
      payment_proof_uploaded_at = now() - interval '1 hour'
  where id = v_held;

  insert into public.tickets (
    ticket_code, order_id, event_id, attendee_name, attendee_dni,
    ticket_type_id, unit_price, status, is_primary_credential,
    valid_from, valid_until
  ) values
    ('SMOKE-BARE-' || v_bare, v_bare, v_event, 'Sin Comprobante', '40111222',
     v_type, 15000, 'pendiente_pago', true, now(), now() + interval '2 days'),
    ('SMOKE-HELD-' || v_held, v_held, v_event, 'Con Comprobante', '40111333',
     v_type, 15000, 'pendiente_pago', true, now(), now() + interval '2 days');

  v_expires := public.expire_ticket_reservations(now());
  if v_expires < 1 then
    raise exception 'El vencimiento no canceló la orden sin comprobante.';
  end if;

  select status into v_status from public.ticket_orders where id = v_bare;
  if v_status <> 'cancelado' then
    raise exception 'La orden sin comprobante quedó %, se esperaba cancelado.', v_status;
  end if;
  select status into v_status from public.tickets where order_id = v_bare;
  if v_status <> 'cancelada' then
    raise exception 'La entrada sin comprobante quedó %, se esperaba cancelada.', v_status;
  end if;

  select status into v_status from public.ticket_orders where id = v_held;
  if v_status <> 'pendiente' then
    raise exception 'El cron se comió la orden con comprobante: %.', v_status;
  end if;
  select status into v_status from public.tickets where order_id = v_held;
  if v_status <> 'pendiente_pago' then
    raise exception 'El cron canceló la entrada con comprobante: %.', v_status;
  end if;

  insert into public.ticket_orders (
    id, event_id, buyer_name, buyer_email, amount, currency, provider,
    manual_payment_channel, status, reference, payment_proof_path,
    payment_proof_uploaded_at, rejected_at
  ) values (
    v_rejected, v_event, 'Rechazada', 'rejected@example.invalid', 15000, 'ARS',
    'manual', 'bank_transfer', 'cancelado', 'SMOKE-REJ-' || v_rejected,
    v_rejected::text || '/comprobante.jpg', now(), now()
  );
  insert into public.tickets (
    ticket_code, order_id, event_id, attendee_name, attendee_dni,
    ticket_type_id, unit_price, status, is_primary_credential,
    valid_from, valid_until
  ) values (
    'SMOKE-REJ-' || v_rejected, v_rejected, v_event, 'Rechazada', '40111444',
    v_type, 15000, 'cancelada', true, now(), now() + interval '2 days'
  );
  begin
    perform public.staff_reopen_cancelled_ticket_order(
      v_rejected, 'smoke', 'comprobante ya revisado y rechazado'
    );
    raise exception 'Se reabrió una orden que Finanzas ya rechazó.';
  exception when sqlstate 'PLU03' then null;
  end;

  insert into public.ticket_orders (
    id, event_id, buyer_name, buyer_email, amount, currency, provider,
    manual_payment_channel, status, reference, payment_proof_path,
    payment_proof_uploaded_at, reservation_expires_at
  ) values (
    v_target, v_event, 'Martina smoke', 'martina@example.invalid', 15000, 'ARS',
    'manual', 'bank_transfer', 'cancelado', 'SMOKE-REOPEN-' || v_target,
    v_target::text || '/comprobante.jpg', now() - interval '1 day', now() - interval '1 minute'
  );
  insert into public.tickets (
    ticket_code, order_id, event_id, attendee_name, attendee_dni,
    ticket_type_id, unit_price, status, is_primary_credential,
    valid_from, valid_until
  ) values (
    'SMOKE-REOPEN-' || v_target, v_target, v_event, 'Martina Smoke', '40111555',
    v_type, 15000, 'cancelada', true, now(), now() + interval '2 days'
  );

  begin
    perform public.staff_reopen_cancelled_ticket_order(v_target, 'smoke', 'corto');
    raise exception 'Se reabrió con un motivo de menos de 8 caracteres.';
  exception when sqlstate 'PLU01' then null;
  end;

  insert into public.event_capacity_rules (event_id, scope, key, limit_count)
  values (v_event, 'event', '', 0);
  begin
    perform public.staff_reopen_cancelled_ticket_order(
      v_target, 'smoke', 'el comprobante ya estaba cargado'
    );
    raise exception 'Se reabrió por encima del cupo del evento.';
  exception when sqlstate 'PLU04' then null;
  end;
  delete from public.event_capacity_rules where event_id = v_event;

  v_result := public.staff_reopen_cancelled_ticket_order(
    v_target, 'smoke', 'el comprobante ya estaba cargado'
  );
  if coalesce(v_result ->> 'duplicate', 'false') <> 'false' then
    raise exception 'La primera reapertura se marcó como duplicada.';
  end if;
  select status, reservation_expires_at::text into v_status, v_reservation
  from public.ticket_orders where id = v_target;
  if v_status <> 'pendiente' then
    raise exception 'La orden reabierta quedó %.', v_status;
  end if;
  if v_reservation is not null then
    raise exception 'La reapertura dejó un plazo de reserva.';
  end if;
  select status into v_status from public.tickets where order_id = v_target;
  if v_status <> 'pendiente_pago' then
    raise exception 'La entrada reabierta quedó %.', v_status;
  end if;
  if not exists (
    select 1 from public.domain_audit_logs
    where action = 'ticket_order.reopened' and entity_id = v_target::text
  ) then
    raise exception 'La reapertura no dejó asiento en la bitácora.';
  end if;

  v_result := public.staff_reopen_cancelled_ticket_order(
    v_target, 'smoke', 'el comprobante ya estaba cargado'
  );
  if coalesce(v_result ->> 'duplicate', 'false') <> 'true' then
    raise exception 'Reabrir dos veces no fue idempotente.';
  end if;

  perform public.staff_approve_ticket_order(v_target, 'smoke', null);
  select status into v_status from public.ticket_orders where id = v_target;
  if v_status <> 'aprobado' then
    raise exception 'Aprobar después de reabrir dejó la orden en %.', v_status;
  end if;
  select status into v_status from public.tickets where order_id = v_target;
  if v_status <> 'pagada' then
    raise exception 'Aprobar después de reabrir dejó la entrada en %.', v_status;
  end if;

  begin
    perform public.staff_settle_cancelled_ticket_order(
      v_held, 'smoke', 'el comprobante ya estaba cargado'
    );
    raise exception 'Se acreditó en un paso una orden que ya estaba pendiente.';
  exception when sqlstate 'PLU03' then null;
  end;

  insert into public.ticket_orders (
    id, event_id, buyer_name, buyer_email, amount, currency, provider,
    manual_payment_channel, status, reference, payment_proof_path,
    payment_proof_uploaded_at
  ) values (
    v_settle, v_event, 'Settle smoke', 'settle@example.invalid', 15000, 'ARS',
    'manual', 'bank_transfer', 'cancelado', 'SMOKE-SETTLE-' || v_settle,
    v_settle::text || '/comprobante.jpg', now() - interval '1 day'
  );
  insert into public.tickets (
    ticket_code, order_id, event_id, attendee_name, attendee_dni,
    ticket_type_id, unit_price, status, is_primary_credential,
    valid_from, valid_until
  ) values (
    'SMOKE-SETTLE-' || v_settle, v_settle, v_event, 'Settle Smoke', '40111666',
    v_type, 15000, 'cancelada', true, now(), now() + interval '2 days'
  );

  v_result := public.staff_settle_cancelled_ticket_order(
    v_settle, 'smoke', 'el comprobante ya estaba cargado'
  );
  if coalesce(v_result ->> 'duplicate', 'false') <> 'false' then
    raise exception 'Acreditar una cancelada se marcó como duplicado.';
  end if;
  select status into v_status from public.ticket_orders where id = v_settle;
  if v_status <> 'aprobado' then
    raise exception 'Acreditar en un paso dejó la orden en %.', v_status;
  end if;
  select status into v_status from public.tickets where order_id = v_settle;
  if v_status <> 'pagada' then
    raise exception 'Acreditar en un paso dejó la entrada en %.', v_status;
  end if;
  if not exists (
    select 1 from public.domain_audit_logs
    where action = 'ticket_order.reopened' and entity_id = v_settle::text
  ) or not exists (
    select 1 from public.domain_audit_logs
    where action = 'ticket_order.approved' and entity_id = v_settle::text
  ) then
    raise exception 'Acreditar en un paso no dejó las dos bitácoras.';
  end if;
end
$ticket_expiry$;

rollback;
