-- Guardas de `staff_delete_athlete_payment_order` (20261228110000). No deja datos.
--
-- Borrar una fila de Cobros NO puede ser una forma de hacer desaparecer plata:
-- cada motivo que lo bloquea levanta su propio errcode (PLU31..PLU35), que el
-- panel muestra por separado. Acá se afirma la RPC, que es donde viven.

begin;

do $delete_flow$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_athlete uuid := gen_random_uuid();
  v_open_id uuid := gen_random_uuid();
  v_cancelled_id uuid := gen_random_uuid();
  v_paid_id uuid := gen_random_uuid();
  v_ledger_id uuid := gen_random_uuid();
  v_result jsonb;
  v_remaining int;
  v_audit int;
begin
  insert into public.athletes(id, organization_id, full_name, document_id, email, status)
  values (
    v_athlete, v_org, 'Delete smoke', 'DX-' || v_athlete,
    'delete-' || v_athlete || '@example.invalid', 'registrado'
  );

  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency,
    method, manual_payment_channel, status, reference
  ) values (
    v_open_id, v_org, v_athlete, 'registration', 85000, 'ARS',
    'manual_link', 'bank_transfer', 'pendiente', 'DX-' || v_open_id
  );

  -- ── Entradas inválidas ───────────────────────────────────────────────────
  begin
    perform public.staff_delete_athlete_payment_order(v_open_id, '', 'motivo');
    raise exception 'Se borró sin actor.';
  exception when sqlstate 'PLU01' then null;
  end;
  begin
    perform public.staff_delete_athlete_payment_order(v_open_id, 'smoke', ' ');
    raise exception 'Se borró sin motivo.';
  exception when sqlstate 'PLU01' then null;
  end;
  begin
    perform public.staff_delete_athlete_payment_order(gen_random_uuid(), 'smoke', 'motivo');
    raise exception 'Se borró una orden inexistente.';
  exception when sqlstate 'PLU02' then null;
  end;

  -- ── PLU33: el pago ya fue declarado ──────────────────────────────────────
  update public.athlete_payment_orders
  set manual_payment_declared_at = now() where id = v_open_id;
  begin
    perform public.staff_delete_athlete_payment_order(v_open_id, 'smoke', 'motivo');
    raise exception 'Se borró una orden con pago declarado.';
  exception when sqlstate 'PLU33' then null;
  end;
  update public.athlete_payment_orders
  set manual_payment_declared_at = null where id = v_open_id;

  -- ── PLU32: hay un comprobante adjunto ────────────────────────────────────
  update public.athlete_payment_orders
  set payment_proof_path = 'proofs/' || v_open_id || '.jpg',
      payment_proof_uploaded_at = now()
  where id = v_open_id;
  begin
    perform public.staff_delete_athlete_payment_order(v_open_id, 'smoke', 'motivo');
    raise exception 'Se borró una orden con comprobante.';
  exception when sqlstate 'PLU32' then null;
  end;
  update public.athlete_payment_orders
  set payment_proof_path = null, payment_proof_uploaded_at = null
  where id = v_open_id;

  -- ── PLU34: intento de pasarela en vuelo ──────────────────────────────────
  insert into public.embedded_payment_attempts(
    organization_id, order_kind, order_id, token_fingerprint, idempotency_key, status
  ) values (
    v_org, 'athlete', v_open_id, 'fp-' || v_open_id, 'idem-' || v_open_id, 'processing'
  );
  begin
    perform public.staff_delete_athlete_payment_order(v_open_id, 'smoke', 'motivo');
    raise exception 'Se borró una orden con un intento en vuelo.';
  exception when sqlstate 'PLU34' then null;
  end;
  delete from public.embedded_payment_attempts where order_id = v_open_id;

  -- ── PLU31: orden cobrada ─────────────────────────────────────────────────
  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency,
    method, manual_payment_channel, status, reference, approved_at
  ) values (
    v_paid_id, v_org, v_athlete, 'registration', 85000, 'ARS',
    'manual_link', 'bank_transfer', 'aprobado', 'DXP-' || v_paid_id, now()
  );
  begin
    perform public.staff_delete_athlete_payment_order(v_paid_id, 'smoke', 'motivo');
    raise exception 'Se borró una orden cobrada.';
  exception when sqlstate 'PLU31' then null;
  end;

  -- ── PLU35: historial en el libro de pagos ────────────────────────────────
  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency,
    method, status, reference
  ) values (
    v_ledger_id, v_org, v_athlete, 'registration', 85000, 'ARS',
    'mercado_pago', 'rechazado', 'DXL-' || v_ledger_id
  );
  insert into public.athlete_payments(order_id, external_payment_id, status, amount)
  values (v_ledger_id, 'ext-' || v_ledger_id, 'rechazado', 85000);
  begin
    perform public.staff_delete_athlete_payment_order(v_ledger_id, 'smoke', 'motivo');
    raise exception 'Se borró una orden con movimientos en el libro.';
  exception when sqlstate 'PLU35' then null;
  end;

  -- Ninguna guarda pudo haber tocado las órdenes.
  select count(*) into v_remaining from public.athlete_payment_orders
  where id in (v_open_id, v_paid_id, v_ledger_id);
  if v_remaining <> 3 then
    raise exception 'Una guarda dejó huérfana o borró una orden: quedan %.', v_remaining;
  end if;

  -- ── Camino feliz 1: orden cancelada sin movimientos ──────────────────────
  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency,
    method, manual_payment_channel, status, reference, cancelled_at, cancellation_code
  ) values (
    v_cancelled_id, v_org, v_athlete, 'registration', 85000, 'ARS',
    'manual_link', 'bank_transfer', 'cancelado', 'DXC-' || v_cancelled_id,
    now(), 'expired_without_payment'
  );
  v_result := public.staff_delete_athlete_payment_order(v_cancelled_id, 'smoke', 'prueba');
  if (v_result ->> 'deleted')::boolean is not true
     or (v_result ->> 'wasOpen')::boolean is not false then
    raise exception 'La baja de una cancelada no reportó lo esperado: %.', v_result;
  end if;

  -- ── Camino feliz 2: orden abierta sin movimientos (se cancela y se borra) ─
  v_result := public.staff_delete_athlete_payment_order(v_open_id, 'smoke', 'duplicada');
  if (v_result ->> 'deleted')::boolean is not true
     or (v_result ->> 'wasOpen')::boolean is not true then
    raise exception 'La baja de una abierta no reportó lo esperado: %.', v_result;
  end if;

  select count(*) into v_remaining from public.athlete_payment_orders
  where id in (v_open_id, v_cancelled_id);
  if v_remaining <> 0 then
    raise exception 'Las órdenes borradas siguen en la tabla: %.', v_remaining;
  end if;

  select count(*) into v_audit from public.domain_audit_logs
  where action = 'payment_order.deleted'
    and entity_id in (v_open_id::text, v_cancelled_id::text)
    and actor_id = 'smoke';
  if v_audit <> 2 then
    raise exception 'Faltan asientos de auditoría de la baja: %.', v_audit;
  end if;
end
$delete_flow$;

rollback;
