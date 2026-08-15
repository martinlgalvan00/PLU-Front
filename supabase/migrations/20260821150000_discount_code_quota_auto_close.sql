-- Cierre automático de cupos de cupones — PLU ARG
--
-- El canje sucede durante la creación transaccional de la orden. Bloquear la
-- fila del cupón ya evita que dos atletas ocupen el último cupo, pero dejar
-- `active=true` después del último canje confundía al panel. Esta versión
-- apaga el código dentro de la misma transacción que registra la redención.

create or replace function public.apply_discount_code_to_order(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_order_id uuid,
  p_applies_to text,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_order public.athlete_payment_orders;
  v_discount int;
  v_quota_exhausted boolean := false;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;

  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.discount_code_id is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_applied');
  end if;

  -- El lock serializa el conteo y la inserción del último cupo.
  select * into v_code from public.discount_codes
  where organization_id = p_organization_id and code = upper(trim(p_code))
  for update;
  if not found
     or v_code.applies_to not in (p_applies_to, 'both')
     or (v_code.expires_at is not null and v_code.expires_at < now()) then
    raise exception 'El código de descuento no es válido.' using errcode = 'PLU20';
  end if;

  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    raise exception 'El código de descuento alcanzó el máximo de usos.' using errcode = 'PLU21';
  end if;

  if not v_code.active then
    raise exception 'El código de descuento no es válido.' using errcode = 'PLU20';
  end if;

  v_discount := floor(v_order.amount * v_code.percent_off / 100.0)::int;
  if v_discount <= 0 or v_discount >= v_order.amount then
    raise exception 'El código de descuento no se puede aplicar a este importe.' using errcode = 'PLU01';
  end if;

  begin
    insert into public.discount_code_redemptions(
      organization_id, discount_code_id, athlete_id, payment_order_id, discount_amount
    ) values (p_organization_id, v_code.id, p_athlete_id, v_order.id, v_discount);
  exception when unique_violation then
    raise exception 'Ya usaste este código de descuento.' using errcode = 'PLU22';
  end;

  update public.athlete_payment_orders
  set amount = amount - v_discount,
      discount_code_id = v_code.id,
      discount_code = v_code.code,
      discount_amount = v_discount,
      updated_at = now()
  where id = v_order.id;

  -- Cuando entra el último canje, el código deja de ofrecerse también para
  -- las previsualizaciones y para el panel administrativo.
  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    update public.discount_codes
    set active = false, updated_at = now()
    where id = v_code.id;
    v_quota_exhausted := true;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.redeemed', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object(
      'discountCodeId', v_code.id,
      'code', v_code.code,
      'discountAmount', v_discount,
      'quotaExhausted', v_quota_exhausted
    ),
    p_organization_id
  );

  return jsonb_build_object('applied', true, 'discountAmount', v_discount, 'code', v_code.code);
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.apply_discount_code_to_order(uuid,uuid,uuid,text,text)') is null then
    raise exception 'La función de canje de cupones no fue creada.' using errcode = 'PLU01';
  end if;
end
$verification$;
