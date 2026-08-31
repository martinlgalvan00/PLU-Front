-- Recorrido transaccional del incidente "el código dice 92.500 y la orden cobra
-- 85.000" (Pitbull Classic 2026, 31/08/2026). No deja datos de prueba.
--
-- Reproduce la orden abierta que quedó con un código viejo —después archivado— y
-- verifica que la recotización de 20261019130000 la deja con el código y el
-- precio del pedido nuevo, sin dobles redenciones y sin reusar la preferencia de
-- Mercado Pago emitida por el importe anterior.

begin;

do $requote_flow$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_athlete uuid := gen_random_uuid();
  v_old_code text := 'RQ-OLD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_new_code text := 'RQ-NEW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_third_code text := 'RQ-THIRD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_old_id uuid;
  v_new_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_saved jsonb;
  v_applied jsonb;
  v_order public.athlete_payment_orders;
  v_redemptions int;
  v_amount int;
begin
  insert into public.athletes(id, organization_id, full_name, document_id, email, status)
  values (
    v_athlete, v_org, 'Requote smoke',
    'RQ-' || v_athlete,
    'requote-' || v_athlete || '@example.invalid',
    'registrado'
  );

  -- El código viejo: precio fijo 85.000, cobrable a mano y por la pasarela.
  v_saved := public.staff_upsert_discount_code(
    jsonb_build_object(
      'organizationId', v_org,
      'code', v_old_code,
      'kind', 'fixed_price',
      'fixedPrice', 85000,
      'fixedPriceManual', 85000,
      'appliesTo', 'registration',
      'manualChannels', jsonb_build_array('bank_transfer', 'cash_pitbull'),
      'mercadoPagoEnabled', true,
      'active', true
    ),
    'requote-smoke'
  );
  v_old_id := (v_saved ->> 'id')::uuid;

  -- El código nuevo: precio fijo 92.500, SÓLO Mercado Pago (sin canales
  -- manuales declarados) y sin precio manual propio — la forma exacta de
  -- ONLY-PITBULL-MP2026.
  v_saved := public.staff_upsert_discount_code(
    jsonb_build_object(
      'organizationId', v_org,
      'code', v_new_code,
      'kind', 'fixed_price',
      'fixedPrice', 92500,
      'appliesTo', 'registration',
      'manualChannels', jsonb_build_array(),
      'mercadoPagoEnabled', true,
      'active', true
    ),
    'requote-smoke'
  );
  v_new_id := (v_saved ->> 'id')::uuid;
  if (v_saved ->> 'fixed_price')::int <> 92500
     or v_saved ->> 'fixed_price_manual' is not null then
    raise exception 'Alta del código nuevo inesperada: %.', v_saved;
  end if;

  -- Orden abierta de inscripción por Mercado Pago, cotizada con el viejo, con
  -- preferencia ya emitida (es lo que tenía la orden real del incidente).
  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency, method, status, reference
  ) values (
    v_order_id, v_org, v_athlete, 'registration', 100000,
    'ARS', 'mercado_pago', 'pendiente', 'RQ-' || v_order_id
  );
  perform public.apply_discount_code_to_order(
    v_org, v_athlete, v_order_id, 'registration', v_old_code
  );
  update public.athlete_payment_orders
  set provider_preference_id = 'pref-' || v_order_id
  where id = v_order_id;

  select * into v_order from public.athlete_payment_orders where id = v_order_id;
  if v_order.amount <> 85000 or v_order.discount_amount <> 15000
     or v_order.discount_code <> v_old_code then
    raise exception 'Orden inicial: se esperaba 85.000 con el código viejo: %.', to_jsonb(v_order);
  end if;

  -- El código viejo se retira del catálogo, como pasó en producción.
  update public.discount_codes set archived_at = now() where id = v_old_id;

  -- El bug, tal cual: aplicar el código nuevo sobre la orden abierta no hace
  -- nada y no falla. Se afirma para que la recotización no se pueda quitar sin
  -- que esto se ponga rojo.
  v_applied := public.apply_discount_code_to_order(
    v_org, v_athlete, v_order_id, 'registration', v_new_code
  );
  if v_applied ->> 'reason' is distinct from 'already_applied' then
    raise exception 'Se esperaba el rechazo silencioso already_applied, llegó %.', v_applied;
  end if;
  select amount into v_amount from public.athlete_payment_orders where id = v_order_id;
  if v_amount <> 85000 then
    raise exception 'La aplicación pelada dejó de ser inocua: monto %.', v_amount;
  end if;

  -- El arreglo: la orden se recotiza con el código de ESTE pedido.
  v_order := plu_private.requote_open_order(
    v_org, v_athlete, v_order_id, 'registration', v_new_code
  );
  if v_order.amount <> 92500 then
    raise exception 'Recotización: se esperaba 92.500, llegó %.', v_order.amount;
  end if;
  if v_order.discount_code <> v_new_code or v_order.discount_code_id <> v_new_id then
    raise exception 'Recotización: la orden quedó con el código %.', v_order.discount_code;
  end if;
  if v_order.discount_amount <> 7500 then
    raise exception 'Recotización: descuento % (se esperaba 7.500).', v_order.discount_amount;
  end if;
  if v_order.provider_preference_id is not null then
    raise exception 'La preferencia emitida por 85.000 sobrevivió a la recotización.';
  end if;

  select count(*) into v_redemptions
  from public.discount_code_redemptions where payment_order_id = v_order_id;
  if v_redemptions <> 1 then
    raise exception 'Redenciones para la orden: % (se esperaba exactamente 1).', v_redemptions;
  end if;
  if not exists (
    select 1 from public.discount_code_redemptions
    where payment_order_id = v_order_id and discount_code_id = v_new_id and discount_amount = 7500
  ) then
    raise exception 'La redención no quedó a nombre del código nuevo.';
  end if;
  -- El cupo del viejo se devolvió: no quedó ninguna redención suya colgada.
  if exists (
    select 1 from public.discount_code_redemptions where discount_code_id = v_old_id
  ) then
    raise exception 'La redención del código viejo no se liberó.';
  end if;

  -- El asentamiento del canal, que corre después en el checkout real, no vuelve
  -- a pisar el precio: era el paso que producía los 85.000.
  v_order := plu_private.settle_manual_checkout_pricing(
    v_order_id, 'mercado_pago', null, 100000, 92500, null
  );
  if v_order.amount <> 92500 or v_order.discount_amount <> 7500 then
    raise exception 'Asentamiento Mercado Pago pisó el precio del código nuevo: %.', to_jsonb(v_order);
  end if;

  -- Reintento con el mismo código: idempotente, sin segunda redención.
  v_order := plu_private.requote_open_order(
    v_org, v_athlete, v_order_id, 'registration', v_new_code
  );
  select count(*) into v_redemptions
  from public.discount_code_redemptions where payment_order_id = v_order_id;
  if v_order.amount <> 92500 or v_redemptions <> 1 then
    raise exception 'Reintento no idempotente: monto %, redenciones %.', v_order.amount, v_redemptions;
  end if;

  -- Quitar el código: la orden suelta la redención y vuelve a su base. No se
  -- afirma "sin código" a secas porque sin código tipeado corre la promo pública
  -- automática, que es una decisión de negocio y puede existir o no; lo que
  -- tiene que valer siempre es que la base quedó entera y que el código del
  -- pedido anterior ya no cotiza.
  v_order := plu_private.requote_open_order(
    v_org, v_athlete, v_order_id, 'registration', null
  );
  if v_order.discount_code_id is not distinct from v_new_id then
    raise exception 'Sin código, la orden siguió cotizada con el anterior: %.', to_jsonb(v_order);
  end if;
  if v_order.amount + coalesce(v_order.discount_amount, 0) <> 100000 then
    raise exception 'Sin código la base no volvió a 100.000: %.', to_jsonb(v_order);
  end if;

  -- Con comprobante subido la orden ya no se recotiza: se corta con PLU30 en
  -- vez de cobrar un importe distinto del anunciado.
  v_saved := public.staff_upsert_discount_code(
    jsonb_build_object(
      'organizationId', v_org,
      'code', v_third_code,
      'kind', 'fixed_price',
      'fixedPrice', 90000,
      'appliesTo', 'registration',
      'manualChannels', jsonb_build_array('bank_transfer'),
      'mercadoPagoEnabled', true,
      'active', true
    ),
    'requote-smoke'
  );
  perform plu_private.requote_open_order(
    v_org, v_athlete, v_order_id, 'registration', v_third_code
  );
  update public.athlete_payment_orders
  set payment_proof_path = 'proofs/' || v_order_id || '.jpg',
      status = 'validacion_manual'
  where id = v_order_id;
  begin
    perform plu_private.requote_open_order(
      v_org, v_athlete, v_order_id, 'registration', v_new_code
    );
    raise exception 'Una orden con comprobante se recotizó igual.';
  exception
    when sqlstate 'PLU30' then
      null;
  end;
  select * into v_order from public.athlete_payment_orders where id = v_order_id;
  if v_order.discount_code <> v_third_code then
    raise exception 'La orden en revisión perdió su código: %.', to_jsonb(v_order);
  end if;
end
$requote_flow$;

rollback;
