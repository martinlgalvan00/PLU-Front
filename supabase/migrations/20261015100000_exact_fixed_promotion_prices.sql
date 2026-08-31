-- Precio fijo promocional exacto + reparación de ONLY-PITBULL — PLU ARG
--
-- La auditoría del incidente mostró que el código se guardó con
-- fixed_price=84999 y fixed_price_manual=84999. No hubo redondeo en el canje:
-- sobre la base manual de $92.500, resolve_discount_amount calculó $7.501 y la
-- orden terminó correctamente —pero contra el dato equivocado— en $84.999.
--
-- El contrato de fixed_price es un importe final exacto. Esta migración:
--   1. prueba la fórmula autoritativa con el caso real 92.500 -> 85.000;
--   2. corrige el código puntual que originó el incidente;
--   3. corrige sólo sus órdenes manuales abiertas y todavía no declaradas;
--   4. conserva cerradas las órdenes rechazadas/canceladas como historia.

do $fixed_price_contract$
begin
  if plu_private.resolve_discount_amount(92500, 'fixed_price', null, 85000) <> 7500 then
    raise exception 'fixed_price dejó de resolver 92.500 -> 85.000 exactos.'
      using errcode = 'PLU01';
  end if;
end
$fixed_price_contract$;

do $repair_only_pitbull$
declare
  v_code public.discount_codes;
  v_order public.athlete_payment_orders;
begin
  select * into v_code
  from public.discount_codes
  where id = 'fded464a-06a7-4d1d-8214-1a44561b38c7'::uuid
    and organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    and code = 'ONLY-PITBULL'
    and kind = 'fixed_price'
    and applies_to = 'registration'
    and fixed_price = 84999
    and fixed_price_manual = 84999
  for update;

  -- En otros entornos el incidente puede no existir, o ya estar reparado.
  if not found then
    return;
  end if;

  update public.discount_codes
  set fixed_price = 85000,
      fixed_price_manual = 85000,
      updated_at = now()
  where id = v_code.id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.fixed_price_repaired',
    'discount_code',
    v_code.id::text,
    'system',
    'migration:20261015100000',
    jsonb_build_object(
      'before', jsonb_build_object('fixedPrice', 84999, 'fixedPriceManual', 84999),
      'after', jsonb_build_object('fixedPrice', 85000, 'fixedPriceManual', 85000),
      'reason', 'exact_fixed_price_contract'
    ),
    v_code.organization_id
  );

  -- Una orden ya acreditada es un asiento inmutable. Sólo se repara la orden
  -- manual que todavía no tiene comprobante, declaración ni intento de pasarela.
  for v_order in
    select *
    from public.athlete_payment_orders
    where discount_code_id = v_code.id
      and currency = 'ARS'
      and method = 'manual_link'
      and status in ('creado', 'pendiente')
      and amount = 84999
      and discount_amount > 0
      and payment_proof_path is null
      and manual_payment_declared_at is null
      and provider_preference_id is null
    for update
  loop
    update public.discount_code_redemptions
    set discount_amount = greatest(discount_amount - 1, 0)
    where payment_order_id = v_order.id;

    update public.athlete_payment_orders
    set amount = 85000,
        discount_amount = greatest(discount_amount - 1, 0),
        updated_at = now()
    where id = v_order.id;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'payment_order.fixed_price_repaired',
      'payment_order',
      v_order.id::text,
      'system',
      'migration:20261015100000',
      jsonb_build_object(
        'beforeAmount', 84999,
        'afterAmount', 85000,
        'beforeDiscountAmount', v_order.discount_amount,
        'afterDiscountAmount', greatest(v_order.discount_amount - 1, 0),
        'discountCodeId', v_code.id
      ),
      v_order.organization_id
    );
  end loop;
end
$repair_only_pitbull$;

do $verification$
begin
  if exists (
    select 1
    from public.discount_codes
    where id = 'fded464a-06a7-4d1d-8214-1a44561b38c7'::uuid
      and (fixed_price <> 85000 or fixed_price_manual <> 85000)
  ) then
    raise exception 'ONLY-PITBULL no quedó en $85.000 exactos.' using errcode = 'PLU01';
  end if;
end
$verification$;
