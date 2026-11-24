-- La categoría de peso entra en la misma transacción que el checkout.
-- Las RPC anteriores siguen existiendo: e2e, scripts y reintentos las llaman.
-- Estas versiones las envuelven y, si el update de la clase falla, PostgreSQL
-- revierte también la inscripción y la orden creadas adentro.

create or replace function public.create_competition_registration_checkout_v2(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_currency text,
  p_declared_weight_class text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_registration_id uuid;
  v_class text := nullif(btrim(p_declared_weight_class), '');
begin
  if v_class is null then
    raise exception 'Seleccioná la categoría de peso en la que vas a competir.'
      using errcode = '22023';
  end if;

  v_result := public.create_competition_registration_checkout(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key,
    p_discount_code,
    p_default_price,
    p_manual_price,
    p_manual_payment_channel,
    p_currency
  );

  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudo guardar la categoría de peso.'
      using errcode = 'P0001';
  end if;

  update public.event_registrations
  set declared_weight_class = v_class
  where id = v_registration_id;

  if not found then
    raise exception 'No se pudo guardar la categoría de peso.'
      using errcode = 'P0001';
  end if;

  return jsonb_set(
    v_result,
    '{registration,declared_weight_class}',
    to_jsonb(v_class),
    true
  );
end;
$$;

revoke all on function public.create_competition_registration_checkout_v2(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout_v2(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text
) to service_role;

create or replace function public.create_membership_registration_combo_checkout_v2(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_discount_code text,
  p_currency text,
  p_declared_weight_class text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_registration_id uuid;
  v_class text := nullif(btrim(p_declared_weight_class), '');
begin
  if v_class is null then
    raise exception 'Seleccioná la categoría de peso en la que vas a competir.'
      using errcode = '22023';
  end if;

  v_result := public.create_membership_registration_combo_checkout(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key,
    p_default_price,
    p_manual_price,
    p_manual_payment_channel,
    p_discount_code,
    p_currency
  );

  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudo guardar la categoría de peso.'
      using errcode = 'P0001';
  end if;

  update public.event_registrations
  set declared_weight_class = v_class
  where id = v_registration_id;

  if not found then
    raise exception 'No se pudo guardar la categoría de peso.'
      using errcode = 'P0001';
  end if;

  return jsonb_set(
    v_result,
    '{registration,declared_weight_class}',
    to_jsonb(v_class),
    true
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout_v2(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout_v2(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text
) to service_role;
