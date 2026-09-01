-- Recorrido transaccional de una promoción de precio fijo.
-- Reproduce el caso real 92.500 -> 85.000 sin dejar datos de prueba.

begin;

do $fixed_price_flow$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_transfer_athlete uuid := gen_random_uuid();
  v_cash_athlete uuid := gen_random_uuid();
  v_membership_code text := 'FIX-MEM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_registration_code text := 'FIX-REG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_membership_code_id uuid;
  v_registration_code_id uuid;
  v_transfer_order uuid := gen_random_uuid();
  v_cash_order uuid := gen_random_uuid();
  v_saved jsonb;
  v_redeem jsonb;
  v_preview jsonb;
  v_order public.athlete_payment_orders;
  v_amount int;
  v_discount int;
begin
  insert into public.athletes(id, organization_id, full_name, document_id, email, status)
  values
    (v_transfer_athlete, v_org, 'Fixed price transfer smoke',
     'FIX-TRANSFER-' || v_transfer_athlete,
     'fixed-transfer-' || v_transfer_athlete || '@example.invalid', 'registrado'),
    (v_cash_athlete, v_org, 'Fixed price cash smoke',
     'FIX-CASH-' || v_cash_athlete,
     'fixed-cash-' || v_cash_athlete || '@example.invalid', 'registrado');

  -- Alta por la misma RPC que usa Tarifas.
  v_saved := public.staff_upsert_discount_code(
    jsonb_build_object(
      'organizationId', v_org,
      'code', v_membership_code,
      'kind', 'fixed_price',
      'fixedPrice', 85000,
      'fixedPriceManual', 85000,
      'appliesTo', 'membership',
      'manualChannels', jsonb_build_array('bank_transfer'),
      'mercadoPagoEnabled', true,
      'active', true
    ),
    'fixed-price-smoke'
  );
  v_membership_code_id := (v_saved ->> 'id')::uuid;
  if (v_saved ->> 'fixed_price')::int <> 85000
     or (v_saved ->> 'fixed_price_manual')::int <> 85000 then
    raise exception 'Alta: el precio fijo no se persistió en 85.000 exactos.';
  end if;

  -- El canje clasifica el código pero todavía no consume su cupo.
  v_redeem := public.athlete_redeem_promotion_code(
    v_org, v_transfer_athlete, v_membership_code,
    jsonb_build_object('surface', 'fixed-price-smoke')
  );
  if v_redeem ->> 'status' <> 'accepted'
     or v_redeem ->> 'action' <> 'apply_to_checkout'
     or (v_redeem #>> '{benefit,fixedPrice}')::int <> 85000
     or (v_redeem #>> '{benefit,fixedPriceManual}')::int <> 85000 then
    raise exception 'Canje: beneficio fijo inesperado: %.', v_redeem;
  end if;

  v_preview := public.athlete_preview_discount_code(
    v_org, v_transfer_athlete, v_membership_code,
    'membership', 92500, 'manual_link'
  );
  if not coalesce((v_preview ->> 'valid')::boolean, false)
     or (v_preview ->> 'fixedPrice')::int <> 85000
     or (v_preview ->> 'discountAmount')::int <> 7500
     or (v_preview ->> 'finalAmount')::int <> 85000 then
    raise exception 'Preview transferencia: se esperaba 92.500 -> 85.000: %.', v_preview;
  end if;

  v_preview := public.athlete_preview_discount_code(
    v_org, v_transfer_athlete, v_membership_code,
    'membership', 92500, 'mercado_pago'
  );
  if not coalesce((v_preview ->> 'valid')::boolean, false)
     or (v_preview ->> 'discountAmount')::int <> 7500
     or (v_preview ->> 'finalAmount')::int <> 85000 then
    raise exception 'Preview Mercado Pago: se esperaba 92.500 -> 85.000: %.', v_preview;
  end if;

  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency, method, status, reference
  ) values (
    v_transfer_order, v_org, v_transfer_athlete, 'membership', 92500,
    'ARS', 'manual_link', 'pendiente', 'FIX-TRANSFER-' || v_transfer_order
  );
  perform public.apply_discount_code_to_order(
    v_org, v_transfer_athlete, v_transfer_order, 'membership', v_membership_code
  );
  select amount, discount_amount into v_amount, v_discount
  from public.athlete_payment_orders where id = v_transfer_order;
  if v_amount <> 85000 or v_discount <> 7500 then
    raise exception 'Orden transferencia: monto %, descuento %.', v_amount, v_discount;
  end if;

  -- El checkout asienta el canal después de aplicar el código. Repetirlo
  -- cubre también la reanudación idempotente de la orden pendiente.
  v_order := plu_private.settle_manual_checkout_pricing(
    v_transfer_order, 'manual_link', 'bank_transfer', 92500, 92500, 'ARS'
  );
  if v_order.amount <> 85000 or v_order.discount_amount <> 7500 then
    raise exception 'Asentamiento transferencia pisó el precio fijo: %.', to_jsonb(v_order);
  end if;
  v_order := plu_private.settle_manual_checkout_pricing(
    v_transfer_order, 'manual_link', 'bank_transfer', 92500, 92500, 'ARS'
  );
  if v_order.amount <> 85000 or v_order.discount_amount <> 7500 then
    raise exception 'Reanudación transferencia no fue idempotente: %.', to_jsonb(v_order);
  end if;
  select discount_amount into v_discount
  from public.discount_code_redemptions where payment_order_id = v_transfer_order;
  if v_discount <> 7500 then
    raise exception 'Canje transferencia: se esperaba descuento 7.500, llegó %.', v_discount;
  end if;

  -- Inscripción en efectivo con fixedPriceManual omitido: debe heredar 85.000.
  v_saved := public.staff_upsert_discount_code(
    jsonb_build_object(
      'organizationId', v_org,
      'code', v_registration_code,
      'kind', 'fixed_price',
      'fixedPrice', 85000,
      'appliesTo', 'registration',
      'manualChannels', jsonb_build_array('cash_pitbull'),
      'mercadoPagoEnabled', true,
      'active', true
    ),
    'fixed-price-smoke'
  );
  v_registration_code_id := (v_saved ->> 'id')::uuid;
  if (v_saved ->> 'fixed_price')::int <> 85000
     or v_saved ->> 'fixed_price_manual' is not null then
    raise exception 'Alta inscripción: fallback manual inesperado: %.', v_saved;
  end if;
  v_preview := public.athlete_preview_discount_code(
    v_org, v_cash_athlete, v_registration_code,
    'registration', 92500, 'manual_link'
  );
  if not coalesce((v_preview ->> 'valid')::boolean, false)
     or (v_preview ->> 'fixedPrice')::int <> 85000
     or (v_preview ->> 'finalAmount')::int <> 85000 then
    raise exception 'Preview efectivo con fallback inesperado: %.', v_preview;
  end if;

  insert into public.athlete_payment_orders(
    id, organization_id, athlete_id, concept, amount, currency, method, status, reference
  ) values (
    v_cash_order, v_org, v_cash_athlete, 'registration', 92500,
    'ARS', 'manual_link', 'pendiente', 'FIX-CASH-' || v_cash_order
  );
  perform public.apply_discount_code_to_order(
    v_org, v_cash_athlete, v_cash_order, 'registration', v_registration_code
  );
  v_order := plu_private.settle_manual_checkout_pricing(
    v_cash_order, 'manual_link', 'cash_pitbull', 92500, 92500, 'ARS'
  );
  if v_order.amount <> 85000 or v_order.discount_amount <> 7500 then
    raise exception 'Orden efectivo: se esperaba 85.000/7.500: %.', to_jsonb(v_order);
  end if;

  -- Bordes: sin ahorro y alcance incorrecto deben rechazarse.
  v_preview := public.athlete_preview_discount_code(
    v_org, v_transfer_athlete, v_registration_code,
    'registration', 85000, 'manual_link'
  );
  if (v_preview ->> 'valid')::boolean is distinct from false
     or v_preview ->> 'reason' <> 'no_savings' then
    raise exception 'Borde sin ahorro inesperado: %.', v_preview;
  end if;
  v_preview := public.athlete_preview_discount_code(
    v_org, v_transfer_athlete, v_registration_code,
    'membership', 92500, 'manual_link'
  );
  if (v_preview ->> 'valid')::boolean is distinct from false
     or v_preview ->> 'reason' <> 'not_applicable' then
    raise exception 'Borde de alcance inesperado: %.', v_preview;
  end if;

  if exists (
    select 1 from public.athlete_payment_orders
    where id in (v_transfer_order, v_cash_order) and amount in (84999, 85001)
  ) then
    raise exception 'Una orden terminó a un peso del precio fijo.';
  end if;
  if v_membership_code_id is null or v_registration_code_id is null then
    raise exception 'No se crearon los dos códigos de prueba.';
  end if;
end
$fixed_price_flow$;

rollback;
