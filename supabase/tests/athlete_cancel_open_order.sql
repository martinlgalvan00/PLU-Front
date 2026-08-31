-- Guardas de `athlete_cancel_payment_order` (20261020100000). No deja datos.
--
-- La cancelación a pedido del atleta existe para destrabar una orden abierta
-- que si no vive hasta vencer, arrastrando el cupón consumido con ella. Lo que
-- se verifica acá es que NO sea una forma de borrar plata que ya entró: cada
-- estado que la bloquea tiene que levantar su propio errcode, porque la
-- pantalla los muestra por separado —"ya está pagada" y "tiene comprobante en
-- revisión" son salidas distintas para quien está del otro lado.
--
-- El recorrido por la UI (botón, cartel, inscripción liberada) lo cubre
-- `e2e/checkout-coupon-manual-only.spec.js` contra el navegador; acá se afirma
-- la RPC, que es donde viven las guardas.

begin;

do $cancel_flow$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_athlete uuid := gen_random_uuid();
  v_intruder uuid := gen_random_uuid();
  v_code text := 'CX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_order_id uuid := gen_random_uuid();
  v_paid_id uuid := gen_random_uuid();
  v_result jsonb;
  v_order public.athlete_payment_orders;
  v_redemptions int;
begin
  insert into public.athletes(id, organization_id, full_name, document_id, email, status)
  values
    (v_athlete, v_org, 'Cancel smoke', 'CX-' || v_athlete,
     'cancel-' || v_athlete || '@example.invalid', 'registrado'),
    (v_intruder, v_org, 'Cancel intruder', 'CXI-' || v_intruder,
     'intruder-' || v_intruder || '@example.invalid', 'registrado');

  -- Cupón con la forma del que motivó todo esto: precio pactado, cobrable sólo
  -- a mano. Sin `eventId` para que el alcance por inscripción no entre en juego:
  -- lo que se mide es la cancelación, no la resolución del código.
  perform public.staff_upsert_discount_code(
    jsonb_build_object(
      'organizationId', v_org,
      'code', v_code,
      'kind', 'fixed_price',
      'fixedPrice', 85000,
      'fixedPriceManual', 85000,
      'appliesTo', 'registration',
      'manualChannels', jsonb_build_array('bank_transfer', 'cash_pitbull'),
      'mercadoPagoEnabled', false,
      'active', true
    ),
    'cancel-smoke'
  );

  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency,
    method, manual_payment_channel, status, reference
  ) values (
    v_order_id, v_org, v_athlete, 'registration', 92500, 'ARS',
    'manual_link', 'bank_transfer', 'pendiente', 'CX-' || v_order_id
  );
  perform public.apply_discount_code_to_order(
    v_org, v_athlete, v_order_id, 'registration', v_code
  );

  select * into v_order from public.athlete_payment_orders where id = v_order_id;
  if v_order.amount <> 85000 or v_order.discount_code <> v_code then
    raise exception 'Orden inicial: se esperaba 85.000 con el cupón: %.', to_jsonb(v_order);
  end if;

  -- ── Guarda 0: la orden de otra cuenta no existe ──────────────────────────
  -- Indistinguible de una inexistente a propósito: un id ajeno no puede
  -- confirmarse por la diferencia entre dos mensajes.
  begin
    perform public.athlete_cancel_payment_order(v_intruder, v_order_id);
    raise exception 'Una cuenta ajena canceló la orden.';
  exception when sqlstate 'PLU02' then null;
  end;

  -- ── Guarda PLU34: intento de pasarela en vuelo ───────────────────────────
  insert into public.embedded_payment_attempts(
    organization_id, order_kind, order_id, token_fingerprint, idempotency_key, status
  ) values (
    v_org, 'athlete', v_order_id, 'fp-' || v_order_id, 'idem-' || v_order_id, 'processing'
  );
  begin
    perform public.athlete_cancel_payment_order(v_athlete, v_order_id);
    raise exception 'Se canceló con un intento de pago en vuelo.';
  exception when sqlstate 'PLU34' then null;
  end;
  delete from public.embedded_payment_attempts where order_id = v_order_id;

  -- ── Guarda PLU33: el atleta ya declaró el pago ───────────────────────────
  update public.athlete_payment_orders
  set manual_payment_declared_at = now() where id = v_order_id;
  begin
    perform public.athlete_cancel_payment_order(v_athlete, v_order_id);
    raise exception 'Se canceló una orden con pago declarado.';
  exception when sqlstate 'PLU33' then null;
  end;
  update public.athlete_payment_orders
  set manual_payment_declared_at = null where id = v_order_id;

  -- ── Guarda PLU32: hay comprobante esperando a Finanzas ───────────────────
  update public.athlete_payment_orders
  set payment_proof_path = 'proofs/' || v_order_id || '.jpg',
      payment_proof_uploaded_at = now(),
      status = 'validacion_manual'
  where id = v_order_id;
  begin
    perform public.athlete_cancel_payment_order(v_athlete, v_order_id);
    raise exception 'Se canceló una orden con comprobante adjunto.';
  exception when sqlstate 'PLU32' then null;
  end;
  update public.athlete_payment_orders
  set payment_proof_path = null, payment_proof_uploaded_at = null, status = 'pendiente'
  where id = v_order_id;

  -- Ninguna guarda pudo haber tocado la orden: rechazar es no hacer nada.
  select * into v_order from public.athlete_payment_orders where id = v_order_id;
  if v_order.status <> 'pendiente' or v_order.discount_code <> v_code then
    raise exception 'Una guarda dejó la orden alterada: %.', to_jsonb(v_order);
  end if;

  -- ── Guarda PLU31: la orden ya está pagada ────────────────────────────────
  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency,
    method, manual_payment_channel, status, reference, approved_at
  ) values (
    v_paid_id, v_org, v_athlete, 'registration', 92500, 'ARS',
    'manual_link', 'bank_transfer', 'aprobado', 'CXP-' || v_paid_id, now()
  );
  begin
    perform public.athlete_cancel_payment_order(v_athlete, v_paid_id);
    raise exception 'Se canceló una orden ya pagada.';
  exception when sqlstate 'PLU31' then null;
  end;

  -- ── Camino feliz: cierra y devuelve el cupón ─────────────────────────────
  v_result := public.athlete_cancel_payment_order(v_athlete, v_order_id);
  if (v_result ->> 'cancelled')::boolean is not true then
    raise exception 'La cancelación legítima no reportó éxito: %.', v_result;
  end if;
  if v_result ->> 'releasedCode' is distinct from v_code then
    raise exception 'No se informó el cupón devuelto: %.', v_result;
  end if;

  select * into v_order from public.athlete_payment_orders where id = v_order_id;
  if v_order.status <> 'cancelado'
     or v_order.cancellation_code <> 'cancelled_by_athlete'
     or v_order.cancelled_by <> 'athlete:' || v_athlete::text then
    raise exception 'La orden no quedó cerrada con su motivo: %.', to_jsonb(v_order);
  end if;

  -- Lo que destraba el callejón: sin soltar la redención, el mismo código
  -- rebota con PLU22 en el intento siguiente.
  if v_order.discount_code is not null or coalesce(v_order.discount_amount, 0) <> 0 then
    raise exception 'La orden cancelada se quedó con el cupón: %.', to_jsonb(v_order);
  end if;
  select count(*) into v_redemptions
  from public.discount_code_redemptions where payment_order_id = v_order_id;
  if v_redemptions <> 0 then
    raise exception 'Quedó % redención(es) contra una orden cancelada.', v_redemptions;
  end if;

  -- ── Idempotencia: cancelar de nuevo no es un error ───────────────────────
  -- Un doble clic o un reintento de red no puede mostrarse como una falla.
  v_result := public.athlete_cancel_payment_order(v_athlete, v_order_id);
  if (v_result ->> 'alreadyCancelled')::boolean is not true
     or (v_result ->> 'cancelled')::boolean is not false then
    raise exception 'La segunda cancelación no fue idempotente: %.', v_result;
  end if;
end
$cancel_flow$;

rollback;
