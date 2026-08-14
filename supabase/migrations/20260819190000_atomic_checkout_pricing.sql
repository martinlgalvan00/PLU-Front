-- El importe y el canal de pago se fijan dentro de la misma transaccion que
-- crea la orden. Antes, la API creaba la orden con el catalogo y hacia un
-- UPDATE posterior: una transferencia podia llegar a verse (o reutilizarse)
-- brevemente con ARS 85.000.
--
-- La API sigue siendo la unica que decide iniciar un checkout, pero la base
-- valida la politica temporal antes de aceptar el importe que recibe. El
-- trigger aplica esos valores al INSERT y las RPC "_checkout" conservan la
-- idempotencia y los guards ya existentes en las RPC versionadas.

create or replace function plu_private.configure_atomic_checkout_pricing(
  p_concept text,
  p_payment_method text,
  p_manual_payment_channel text,
  p_order_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_expected_amount numeric;
  v_presale_active boolean := now() < timestamptz '2026-08-29 03:00:00+00';
begin
  if p_concept not in ('membership', 'registration', 'combo') then
    raise exception 'Concepto de checkout invalido.' using errcode = 'PLU01';
  end if;

  if p_payment_method = 'mercado_pago' then
    if p_manual_payment_channel is not null then
      raise exception 'Mercado Pago no admite un canal manual.' using errcode = 'PLU01';
    end if;
  elsif p_payment_method = 'manual_link' then
    if p_manual_payment_channel not in ('bank_transfer', 'cash_pitbull') then
      raise exception 'El pago manual requiere un canal valido.' using errcode = 'PLU01';
    end if;
  else
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  -- Terminada la preventa se conserva el importe del catalogo que la RPC
  -- original bloquea y lee. No se admite una cotizacion vieja del cliente/API.
  if not v_presale_active then
    if p_order_amount is not null then
      raise exception 'La cotizacion de preventa ya vencio.' using errcode = 'PLU03';
    end if;
  else
    v_expected_amount := case
      when p_concept = 'combo' and p_payment_method = 'manual_link'
        and p_manual_payment_channel = 'bank_transfer' then 120000
      when p_concept = 'combo' and p_payment_method = 'manual_link'
        and p_manual_payment_channel = 'cash_pitbull' then 150000
      when p_concept = 'combo' then 170000
      when p_payment_method = 'manual_link' then 75000
      else 85000
    end;

    if p_order_amount is distinct from v_expected_amount then
      raise exception 'La cotizacion no coincide con la politica vigente.' using errcode = 'PLU01';
    end if;
  end if;

  perform set_config('plu.atomic_checkout_pricing', '1', true);
  perform set_config('plu.atomic_checkout_amount', coalesce(p_order_amount::text, ''), true);
  perform set_config('plu.atomic_manual_payment_channel', coalesce(p_manual_payment_channel, ''), true);
end;
$$;

revoke all on function plu_private.configure_atomic_checkout_pricing(text, text, text, numeric)
  from public, anon, authenticated;

create or replace function plu_private.apply_atomic_checkout_pricing()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_amount_text text;
  v_channel text;
begin
  if current_setting('plu.atomic_checkout_pricing', true) is distinct from '1' then
    return new;
  end if;

  v_amount_text := nullif(current_setting('plu.atomic_checkout_amount', true), '');
  v_channel := nullif(current_setting('plu.atomic_manual_payment_channel', true), '');

  if v_amount_text is not null then
    if v_amount_text !~ '^[0-9]+(?:\.[0-9]{1,2})?$' or v_amount_text::numeric <= 0 then
      raise exception 'El importe atomico de checkout es invalido.' using errcode = 'PLU01';
    end if;
    new.amount := v_amount_text::numeric;
  end if;

  new.manual_payment_channel := v_channel;
  return new;
end;
$$;

drop trigger if exists athlete_payment_orders_apply_atomic_checkout_pricing
  on public.athlete_payment_orders;
create trigger athlete_payment_orders_apply_atomic_checkout_pricing
  before insert on public.athlete_payment_orders
  for each row execute function plu_private.apply_atomic_checkout_pricing();

-- No se modifica la firma de las RPC previas: pueden seguir atendiendo
-- reintentos legacy. Las rutas vigentes llaman solo a estas tres entradas.
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

  -- v4 puede aplicar cupones luego del INSERT. La tarifa del checkout tiene
  -- prioridad y se restaura antes del commit; nunca existe una ventana publica.
  if coalesce((v_result ->> 'duplicate')::boolean, false) = false then
    update public.athlete_payment_orders
    set amount = coalesce(p_order_amount, amount),
        manual_payment_channel = p_manual_payment_channel,
        updated_at = now()
    where id = (v_result -> 'order' ->> 'id')::uuid
    returning * into v_order;
    v_result := jsonb_set(v_result, '{order}', to_jsonb(v_order));
  end if;

  return v_result;
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

  if coalesce((v_result ->> 'duplicate')::boolean, false) = false then
    update public.athlete_payment_orders
    set amount = coalesce(p_order_amount, amount),
        manual_payment_channel = p_manual_payment_channel,
        updated_at = now()
    where id = (v_result -> 'order' ->> 'id')::uuid
    returning * into v_order;
    v_result := jsonb_set(v_result, '{order}', to_jsonb(v_order));
  end if;

  return v_result;
end;
$$;

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
begin
  perform plu_private.configure_atomic_checkout_pricing(
    'combo', p_payment_method, p_manual_payment_channel, p_order_amount
  );
  return public.create_membership_registration_combo_order(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key
  );
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
  if to_regprocedure('public.create_membership_order_checkout(uuid,text,text,text,text,numeric,text)') is null
    or to_regprocedure('public.create_competition_registration_checkout(uuid,text,text,text,numeric,text,text,text,numeric,text)') is null
    or to_regprocedure('public.create_membership_registration_combo_checkout(uuid,text,text,text,numeric,text,text,numeric,text)') is null then
    raise exception 'Las RPC de checkout atomico no fueron creadas.' using errcode = 'PLU01';
  end if;
end
$verification$;
