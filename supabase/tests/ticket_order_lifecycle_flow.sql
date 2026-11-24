-- Flujo del ciclo de vida de órdenes de entradas y lista de invitados
-- (20261210100000). Corre dentro de una transacción y hace rollback: no deja
-- nada en la base.
--
--   docker cp supabase/tests/ticket_order_lifecycle_flow.sql supabase_db_PLU-Front:/tmp/t.sql
--   MSYS_NO_PATHCONV=1 docker exec supabase_db_PLU-Front psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/t.sql

begin;

do $flow$
declare
  v_event public.events;
  v_type public.ticket_types;
  v_result jsonb;
  v_order_id uuid;
  v_status text;
  v_ticket_status text;
  v_count int;
  v_failed boolean;
begin
  insert into public.events (slug, title, venue, location, starts_at, ends_at, published, status, currency, rules)
  values ('test-lifecycle', 'Evento de prueba', 'Sede', 'CABA', now() + interval '10 days',
          now() + interval '11 days', true, 'inscripcion_abierta', 'ARS',
          '{"ticketsEnabled": true}'::jsonb)
  returning * into v_event;

  insert into public.ticket_types (event_id, name, price, quota, active)
  values (v_event.id, 'General', 15000, 2, true)
  returning * into v_type;

  -- 1. Venta manual por transferencia, con comprobante, y aprobación.
  v_result := public.create_ticket_order_v3(
    'test-lifecycle',
    jsonb_build_array(jsonb_build_object('fullName', 'Ana Prueba', 'dni', '30111222', 'ticketTypeId', v_type.id)),
    jsonb_build_object('name', 'Ana Prueba', 'email', 'ana@example.com', 'provider', 'manual', 'manualPaymentChannel', 'bank_transfer'),
    'lifecycle-idem-key-0001', repeat('a', 64), 'staff:test'
  );
  v_order_id := (v_result -> 'order' ->> 'id')::uuid;
  update public.ticket_orders set payment_proof_path = 'x/proof.png' where id = v_order_id;
  perform public.staff_approve_ticket_order(v_order_id, 'staff:test');

  -- 2. Cancelar una aprobada exige motivo.
  v_failed := false;
  begin
    perform public.staff_cancel_ticket_order(v_order_id, null, 'staff:test');
  exception when others then v_failed := true;
  end;
  if not v_failed then raise exception 'FALLO: cancelar aprobada sin motivo debía fallar'; end if;

  v_result := public.staff_cancel_ticket_order(v_order_id, 'Transferencia revertida', 'staff:test');
  select status into v_status from public.ticket_orders where id = v_order_id;
  select status into v_ticket_status from public.tickets where order_id = v_order_id limit 1;
  if v_status <> 'cancelado' or v_ticket_status <> 'cancelada' or v_result ->> 'previousStatus' <> 'aprobado' then
    raise exception 'FALLO: cancelar (%, %, %)', v_status, v_ticket_status, v_result ->> 'previousStatus';
  end if;

  -- Idempotente.
  v_result := public.staff_cancel_ticket_order(v_order_id, 'otra vez', 'staff:test');
  if (v_result ->> 'duplicate')::boolean is not true then
    raise exception 'FALLO: cancelar dos veces debía ser duplicado';
  end if;

  -- 3. Volver a aceptar: QR reactivado y campos de cancelación limpios.
  v_result := public.staff_reinstate_ticket_order(v_order_id, 'staff:test');
  select status into v_status from public.ticket_orders where id = v_order_id;
  select status into v_ticket_status from public.tickets where order_id = v_order_id limit 1;
  if v_status <> 'aprobado' or v_ticket_status <> 'pagada' then
    raise exception 'FALLO: reactivar (%, %)', v_status, v_ticket_status;
  end if;
  if exists (select 1 from public.ticket_orders where id = v_order_id and cancelled_at is not null) then
    raise exception 'FALLO: reactivar debía limpiar la cancelación';
  end if;

  -- 4. Rechazada -> volver a aceptar.
  v_result := public.create_ticket_order_v3(
    'test-lifecycle',
    jsonb_build_array(jsonb_build_object('fullName', 'Beto Prueba', 'dni', '30111333', 'ticketTypeId', v_type.id)),
    jsonb_build_object('name', 'Beto', 'email', 'beto@example.com', 'provider', 'manual', 'manualPaymentChannel', 'bank_transfer'),
    'lifecycle-idem-key-0002', repeat('b', 64), 'staff:test'
  );
  v_order_id := (v_result -> 'order' ->> 'id')::uuid;
  update public.ticket_orders set payment_proof_path = 'x/proof2.png' where id = v_order_id;
  perform public.reject_ticket_payment_order(v_order_id, 'Monto incorrecto', 'staff:test');

  -- Mientras está rechazada, el cupo (2) lo toma un invitado.
  v_result := public.staff_issue_guest_tickets(
    'test-lifecycle', v_type.id,
    jsonb_build_array(
      jsonb_build_object('fullName', 'Prensa Uno', 'dni', '40111222', 'email', 'prensa@example.com'),
      jsonb_build_object('fullName', 'Prensa Uno Dup', 'dni', '40.111.222'),
      jsonb_build_object('fullName', 'Ana Otra Vez', 'dni', '30111222')
    ),
    'Prensa', 'staff:test'
  );
  if jsonb_array_length(v_result -> 'issued') <> 1 or jsonb_array_length(v_result -> 'skipped') <> 2 then
    raise exception 'FALLO: invitados (issued %, skipped %)', v_result -> 'issued', v_result -> 'skipped';
  end if;
  if (v_result -> 'issued' -> 0 -> 'order' ->> 'manual_payment_channel') <> 'courtesy'
     or (v_result -> 'issued' -> 0 -> 'order' ->> 'amount')::int <> 0
     or (v_result -> 'issued' -> 0 -> 'tickets' -> 0 ->> 'status') <> 'pagada' then
    raise exception 'FALLO: invitación mal emitida %', v_result -> 'issued' -> 0;
  end if;

  -- Cupo agotado (Ana + invitado = 2): volver a aceptar a Beto debe fallar sin cambiar nada.
  v_failed := false;
  begin
    perform public.staff_reinstate_ticket_order(v_order_id, 'staff:test');
  exception when sqlstate 'PLU04' then v_failed := true;
  end;
  if not v_failed then raise exception 'FALLO: reactivar sin cupo debía fallar con PLU04'; end if;
  select status into v_status from public.ticket_orders where id = v_order_id;
  if v_status <> 'rechazado' then raise exception 'FALLO: la orden cambió de estado sin cupo'; end if;

  -- Se cancela la invitación y ahora sí entra.
  perform public.staff_cancel_ticket_order(
    (v_result -> 'issued' -> 0 -> 'order' ->> 'id')::uuid, 'Ya no viene', 'staff:test');
  perform public.staff_reinstate_ticket_order(v_order_id, 'staff:test');
  select status into v_status from public.ticket_orders where id = v_order_id;
  if v_status <> 'aprobado' then raise exception 'FALLO: reactivar rechazada (%)', v_status; end if;

  -- 5. Pendiente sin comprobante: se puede cancelar sin motivo; no se puede reactivar.
  update public.ticket_types set quota = 10 where id = v_type.id;
  v_result := public.create_ticket_order_v3(
    'test-lifecycle',
    jsonb_build_array(jsonb_build_object('fullName', 'Caro Prueba', 'dni', '30111444', 'ticketTypeId', v_type.id)),
    jsonb_build_object('name', 'Caro', 'email', 'caro@example.com', 'provider', 'manual', 'manualPaymentChannel', 'bank_transfer'),
    'lifecycle-idem-key-0003', repeat('c', 64), 'staff:test'
  );
  v_order_id := (v_result -> 'order' ->> 'id')::uuid;
  perform public.staff_cancel_ticket_order(v_order_id, null, 'staff:test');
  v_failed := false;
  begin
    perform public.staff_reinstate_ticket_order(v_order_id, 'staff:test');
  exception when sqlstate 'PLU03' then v_failed := true;
  end;
  if not v_failed then raise exception 'FALLO: reactivar sin comprobante debía fallar'; end if;

  -- 6. Lo que venció el cron va por Acreditar (staff_settle_cancelled_ticket_order),
  --    no por volver a aceptar: un caso, un camino.
  v_result := public.create_ticket_order_v3(
    'test-lifecycle',
    jsonb_build_array(jsonb_build_object('fullName', 'Eva Prueba', 'dni', '30111666', 'ticketTypeId', v_type.id)),
    jsonb_build_object('name', 'Eva', 'email', 'eva@example.com', 'provider', 'manual', 'manualPaymentChannel', 'bank_transfer'),
    'lifecycle-idem-key-0005', repeat('e', 64), 'staff:test'
  );
  v_order_id := (v_result -> 'order' ->> 'id')::uuid;
  -- Simula el vencimiento del cron: cancelada, sin `cancelled_at`.
  update public.ticket_orders set status = 'cancelado', payment_proof_path = 'x/eva.png'
  where id = v_order_id;
  update public.tickets set status = 'cancelada' where order_id = v_order_id;
  v_failed := false;
  begin
    perform public.staff_reinstate_ticket_order(v_order_id, 'staff:test');
  exception when sqlstate 'PLU03' then v_failed := true;
  end;
  if not v_failed then raise exception 'FALLO: volver a aceptar una vencida del cron debía derivar a Acreditar'; end if;

  -- 6b. Avisos: los cambios de entradas salen en el tópico del equipo, sin datos.
  if not exists (
    select 1 from realtime.messages
    where inserted_at >= now()::timestamp
      and topic = 'event-checkin:test-lifecycle' and event = 'tickets-changed'
      and payload - 'id' = jsonb_build_object('eventSlug', 'test-lifecycle')
  ) then
    raise exception 'FALLO: no se emitió tickets-changed (o llevó datos)';
  end if;
  if not exists (
    select 1 from realtime.messages
    where inserted_at >= now()::timestamp and topic = 'ticket-orders' and event = 'orders-changed'
  ) then
    raise exception 'FALLO: no se emitió orders-changed';
  end if;

  -- 7. Mercado Pago no se cancela a mano.
  v_result := public.create_ticket_order_v3(
    'test-lifecycle',
    jsonb_build_array(jsonb_build_object('fullName', 'Dani Prueba', 'dni', '30111555', 'ticketTypeId', v_type.id)),
    jsonb_build_object('name', 'Dani', 'email', 'dani@example.com', 'provider', 'mercado_pago'),
    'lifecycle-idem-key-0004', repeat('d', 64), null
  );
  v_failed := false;
  begin
    perform public.staff_cancel_ticket_order((v_result -> 'order' ->> 'id')::uuid, 'x', 'staff:test');
  exception when sqlstate 'PLU01' then v_failed := true;
  end;
  if not v_failed then raise exception 'FALLO: cancelar MP debía fallar'; end if;

  -- 8. Auditoría.
  select count(*) into v_count from public.domain_audit_logs
  where action in ('ticket_order.cancelled', 'ticket_order.reinstated', 'ticket_order.guest_issued')
    and actor_id = 'staff:test';
  if v_count < 6 then raise exception 'FALLO: auditoría incompleta (%)', v_count; end if;

  raise notice 'OK ticket_order_lifecycle_flow';
end
$flow$;

rollback;
