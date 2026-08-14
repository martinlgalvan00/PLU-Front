-- Cambio de canal manual sobre una orden que ya existe.
--
-- `20260819190000_atomic_checkout_pricing.sql` fija importe y canal con un
-- UPDATE posterior al INSERT, pero sólo cuando la RPC subyacente informa
-- `duplicate = false`. Transferencia y efectivo en Pitbull comparten
-- `method = 'manual_link'`, así que al pasar de una a otra la RPC reusa la
-- orden abierta (`duplicate = true`) y ese UPDATE se salteaba: la orden
-- conservaba el canal —y el precio del combo— del canal anterior. El trigger
-- de INSERT tampoco alcanza, porque no hay fila nueva.
--
-- Consecuencia operativa: `approve_athlete_payment_order` decide con el canal
-- si exige comprobante. Una orden de efectivo que quedó marcada como
-- transferencia no se puede aprobar nunca, porque el archivo que pide no
-- existe. En el combo, además, se cobraba ARS 120.000 por un efectivo de
-- ARS 150.000 (o al revés).
--
-- La re-tarifación se congela en cuanto hay evidencia de cobro —comprobante
-- adjunto o preferencia de Mercado Pago abierta—: ahí el importe ya está del
-- lado del socio o del proveedor y reescribirlo desincroniza la acreditación.

create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_order_amount numeric
)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden de checkout no encontrada.' using errcode = 'PLU02';
  end if;

  -- La orden ya cobró, venció, o la RPC se negó a moverla de medio: en los tres
  -- casos la cotización que trae esta llamada no le corresponde.
  if v_order.status not in ('pendiente', 'creado', 'validacion_manual')
     or v_order.method is distinct from p_payment_method then
    return v_order;
  end if;

  -- Evidencia de cobro en curso: el socio ya transfirió contra este importe, o
  -- Mercado Pago ya tiene una preference con él. `createPaymentPreference`
  -- reusa la preference existente, así que bajar el monto acá haría que el pago
  -- llegue con otro importe y `applyCanonicalPayment` lo rechace.
  if v_order.payment_proof_path is not null or v_order.provider_preference_id is not null then
    return v_order;
  end if;

  update public.athlete_payment_orders
  set amount = coalesce(p_order_amount, amount),
      manual_payment_channel = p_manual_payment_channel,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric)
  from public, anon, authenticated;

create or replace function public.create_membership_order_checkout(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text,
  p_discount_code text,
  p_order_amount numeric,
  p_manual_payment_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  perform plu_private.configure_atomic_checkout_pricing(
    'membership', p_payment_method, p_manual_payment_channel, p_order_amount
  );
  v_result := public.create_membership_order_v4(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key, p_discount_code
  );

  -- Sin condicionar por `duplicate`: la orden reusada es justamente la que se
  -- quedaba con el canal anterior. v4 puede aplicar cupones luego del INSERT;
  -- la tarifa del checkout tiene prioridad y se restaura antes del commit.
  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_order_amount
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

create or replace function public.create_competition_registration_checkout(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text,
  p_order_amount numeric,
  p_manual_payment_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  perform plu_private.configure_atomic_checkout_pricing(
    'registration', p_payment_method, p_manual_payment_channel, p_order_amount
  );
  v_result := public.create_competition_registration_v3(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_order_amount
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

-- El combo no tenía ningún ajuste posterior al INSERT: dependía sólo del
-- trigger, así que la orden reanudada por
-- `resume_pending_event_registration_checkout` (que sí cambia el medio) nunca
-- veía el importe ni el canal nuevos.
create or replace function public.create_membership_registration_combo_checkout(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_order_amount numeric,
  p_manual_payment_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  perform plu_private.configure_atomic_checkout_pricing(
    'combo', p_payment_method, p_manual_payment_channel, p_order_amount
  );
  v_result := public.create_membership_registration_combo_order(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_order_amount
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_order_checkout(uuid, text, text, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_checkout(uuid, text, text, text, text, numeric, text)
  to service_role;

revoke all on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, text
) to service_role;

revoke all on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text
) to service_role;

do $verification$
begin
  if to_regprocedure('plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric)') is null then
    raise exception 'El ajuste de canal manual no fue creado.' using errcode = 'PLU01';
  end if;
end
$verification$;
