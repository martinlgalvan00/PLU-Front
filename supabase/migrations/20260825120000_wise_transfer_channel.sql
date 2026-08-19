-- Wise como canal de pago manual para pagos del exterior.
--
-- Se apoya en el sistema de precio configurable por canal que introdujo
-- 20260824100000_manual_price_per_channel.sql y en el settle con cupones de
-- 20260825100000_promo_codes_fixed_price.sql — no los reemplaza. Wise se
-- modela como un canal más de `manual_link` (lado atleta) / `manual` (lado
-- entradas), igual que 'cash_pitbull', y reusa comprobante + aprobación
-- staff sin tocar `approve_athlete_payment_order` (esa función sólo hace
-- excepción explícita para 'cash_pitbull', así que Wise ya cae del lado
-- "requiere comprobante").
--
-- El precio de Wise es en USD, fijado por la API (no por el cliente) y no
-- pasa por `resolve_channel_price`/cupones: no tiene equivalente ARS ni
-- admite descuentos. `settle_manual_checkout_pricing` gana un branch de
-- salida temprana para 'wise_transfer' que fija monto + moneda directo,
-- antes de tocar la lógica de cupón existente (que queda intacta para todo
-- lo demás). `configure_atomic_checkout_pricing` tampoco se toca: las tres
-- RPC "_checkout" la saltean sólo para el canal Wise, igual que ya hacían
-- con la política ARS anterior.
--
-- IMPORTANTE: `CREATE OR REPLACE FUNCTION` con un parámetro nuevo NO
-- reemplaza la función existente — crea un overload aparte y dejaría dos
-- funciones con el mismo nombre (el equipo ya pisó este problema dos veces:
-- 20260824120000 y 20260824130000). Por eso cada función cuya firma cambia
-- acá lleva su `drop function if exists` con la firma vigente antes del
-- `create or replace` con la firma nueva.

-- 1. Canal manual: ampliar el CHECK existente en athlete_payment_orders
-- (sin cambios desde 20260819130000).
alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_manual_payment_channel_check;
alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_manual_payment_channel_check
  check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'cash_pitbull', 'wise_transfer'));

-- 2. ticket_orders no tenía noción de canal (provider sólo distingue
-- mercado_pago/manual/mock). Se agrega la columna siguiendo el mismo
-- patrón que el lado atleta, con backfill para las órdenes manuales viejas.
alter table public.ticket_orders
  add column if not exists manual_payment_channel text;
update public.ticket_orders
  set manual_payment_channel = 'bank_transfer'
  where provider = 'manual' and manual_payment_channel is null;
alter table public.ticket_orders
  drop constraint if exists ticket_orders_manual_payment_channel_check;
alter table public.ticket_orders
  add constraint ticket_orders_manual_payment_channel_check
  check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'wise_transfer'));

-- 3. Interruptor propio, independiente de *_manual_enabled: el staff puede
-- abrir Wise sin reabrir la transferencia local en ARS. Nace en `false`
-- (a diferencia de los demás boolean de esta tabla, que nacen abiertos):
-- Wise no existía antes y no hay comportamiento previo que preservar.
alter table public.platform_feature_toggles
  add column if not exists wise_enabled boolean not null default false;

create or replace function plu_private.platform_feature_toggles_payload(
  p_row public.platform_feature_toggles
)
returns jsonb
language sql
immutable
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'checkoutEnabled', p_row.checkout_enabled,
    'membershipEnabled', p_row.membership_enabled,
    'registrationEnabled', p_row.registration_enabled,
    'ticketEnabled', p_row.ticket_enabled,
    'membershipManualEnabled', p_row.membership_manual_enabled,
    'registrationManualEnabled', p_row.registration_manual_enabled,
    'ticketManualEnabled', p_row.ticket_manual_enabled,
    'membershipValidationEnabled', p_row.membership_validation_enabled,
    'registrationValidationEnabled', p_row.registration_validation_enabled,
    'ticketValidationEnabled', p_row.ticket_validation_enabled,
    'wiseEnabled', p_row.wise_enabled,
    'updatedBy', p_row.updated_by,
    'updatedAt', p_row.updated_at
  );
$$;

revoke all on function plu_private.platform_feature_toggles_payload(public.platform_feature_toggles)
  from public, anon, authenticated;

create or replace function plu_private.platform_feature_toggle_column(p_feature text)
returns text
language sql
immutable
set search_path = public, plu_private
as $$
  select case lower(btrim(coalesce(p_feature, '')))
    when 'checkout' then 'checkout_enabled'
    when 'membership' then 'membership_enabled'
    when 'registration' then 'registration_enabled'
    when 'ticket' then 'ticket_enabled'
    when 'membership_manual' then 'membership_manual_enabled'
    when 'registration_manual' then 'registration_manual_enabled'
    when 'ticket_manual' then 'ticket_manual_enabled'
    when 'membership_validation' then 'membership_validation_enabled'
    when 'registration_validation' then 'registration_validation_enabled'
    when 'ticket_validation' then 'ticket_validation_enabled'
    when 'wise' then 'wise_enabled'
    else null
  end;
$$;

revoke all on function plu_private.platform_feature_toggle_column(text)
  from public, anon, authenticated;

-- Wise es la excepción al default abierto de esta función cuando no hay
-- fila: nace cerrada incluso sin fila, para no exponer un canal sin datos
-- de cuenta configurados.
create or replace function public.staff_get_platform_feature_toggles()
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_row public.platform_feature_toggles;
begin
  select * into v_row from public.platform_feature_toggles
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid;

  if not found then
    v_row.checkout_enabled := true;
    v_row.membership_enabled := true;
    v_row.registration_enabled := true;
    v_row.ticket_enabled := true;
    v_row.membership_manual_enabled := true;
    v_row.registration_manual_enabled := true;
    v_row.ticket_manual_enabled := true;
    v_row.membership_validation_enabled := true;
    v_row.registration_validation_enabled := true;
    v_row.ticket_validation_enabled := true;
    v_row.wise_enabled := false;
  end if;

  return plu_private.platform_feature_toggles_payload(v_row);
end;
$$;

-- `staff_set_platform_feature_toggle` no cambia: ya es genérica sobre los
-- dos helpers de arriba.

-- 4. settle_manual_checkout_pricing: agrega el branch de salida temprana
-- para Wise y el parámetro de moneda. El resto (resolve_channel_price,
-- cupones, discount_code_redemptions, vencimientos por canal) queda
-- exactamente igual a la versión vigente (20260825100000).
drop function if exists plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric);

create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_default_price numeric,
  p_manual_price numeric,
  p_currency text default null
)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
  v_code public.discount_codes;
  v_base numeric;
  v_discount numeric := 0;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden de checkout no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.status not in ('pendiente', 'creado', 'validacion_manual')
     or v_order.method is distinct from p_payment_method then
    return v_order;
  end if;

  if v_order.payment_proof_path is not null or v_order.provider_preference_id is not null then
    return v_order;
  end if;

  -- Wise: precio propio en USD, sin cupón ni resolve_channel_price — no hay
  -- equivalente ARS y los cupones no aplican a este canal.
  if p_manual_payment_channel = 'wise_transfer' then
    update public.athlete_payment_orders
    set amount = coalesce(p_default_price, amount),
        currency = coalesce(p_currency, currency),
        manual_payment_channel = p_manual_payment_channel,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
    return v_order;
  end if;

  v_base := coalesce(
    plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price),
    v_order.amount + coalesce(v_order.discount_amount, 0)
  );

  if v_order.discount_code_id is not null then
    select * into v_code from public.discount_codes where id = v_order.discount_code_id;
    if found then
      v_discount := least(
        plu_private.resolve_discount_amount(v_base, v_code.kind, v_code.percent_off, v_code.fixed_price),
        greatest(v_base - 1, 0)
      );
    else
      v_discount := least(coalesce(v_order.discount_amount, 0), greatest(v_base - 1, 0));
    end if;
  end if;

  update public.athlete_payment_orders
  set amount = v_base - v_discount,
      discount_amount = case when v_order.discount_code_id is null then discount_amount
        else v_discount::int end,
      manual_payment_channel = p_manual_payment_channel,
      expires_at = case
        when p_manual_payment_channel = 'cash_pitbull' then
          greatest(coalesce(expires_at, now()), plu_private.cash_checkout_deadline(v_order.id))
        when p_manual_payment_channel = 'bank_transfer' then
          least(coalesce(expires_at, now() + interval '1 day'), now() + interval '1 day')
        else expires_at
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  if v_order.discount_code_id is not null then
    update public.discount_code_redemptions
    set discount_amount = v_discount::int
    where payment_order_id = v_order.id
      and discount_amount is distinct from v_discount::int;
  end if;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric, text)
  from public, anon, authenticated;

-- 5. Las tres RPC "_checkout": agregan `p_currency` (default null) y
-- saltean `configure_atomic_checkout_pricing` sólo cuando el canal es Wise
-- — exactamente el mismo mecanismo que usaban con la política ARS anterior,
-- ahora aplicado a la firma de 5 parámetros vigente.
drop function if exists public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text);

create or replace function public.create_membership_order_checkout(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_currency text default null
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
  if p_manual_payment_channel is distinct from 'wise_transfer' then
    perform plu_private.configure_atomic_checkout_pricing(
      'membership', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
    );
  end if;
  v_result := public.create_membership_order_v4(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price,
    case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text, text)
  to service_role;

drop function if exists public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text
);

create or replace function public.create_competition_registration_checkout(
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
  p_currency text default null
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
  if p_manual_payment_channel is distinct from 'wise_transfer' then
    perform plu_private.configure_atomic_checkout_pricing(
      'registration', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
    );
  end if;
  v_result := public.create_competition_registration_v3(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price,
    case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text
) to service_role;

drop function if exists public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text
);

create or replace function public.create_membership_registration_combo_checkout(
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
  p_discount_code text default null,
  p_currency text default null
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
  if p_manual_payment_channel is distinct from 'wise_transfer' then
    perform plu_private.configure_atomic_checkout_pricing(
      'combo', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
    );
  end if;
  v_result := public.create_membership_registration_combo_order(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price,
    case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text
) to service_role;

-- 6. Entradas: `create_ticket_order_v2` recibe `provider` adentro de
-- `p_buyer` (jsonb) en vez de como parámetro propio — se agrega el canal en
-- el mismo lugar. Firma idéntica a la vigente (5 parámetros): no hace falta
-- drop, es un `create or replace` real.
create or replace function public.create_ticket_order_v2(
  p_event_slug text,
  p_attendees jsonb,
  p_buyer jsonb,
  p_idempotency_key text,
  p_access_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_existing public.ticket_orders;
  v_order public.ticket_orders;
  v_attendee jsonb;
  v_ticket jsonb;
  v_tickets jsonb := '[]'::jsonb;
  v_catalog jsonb;
  v_addon_result jsonb;
  v_addons jsonb;
  v_included_addons jsonb;
  v_type_id uuid;
  v_type public.ticket_types;
  v_provider text;
  v_channel text;
  v_currency text;
  v_unit_price int;
  v_total int := 0;
  v_requested int;
  v_reserved int;
  v_limit int;
  v_hold_minutes int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_access_token_hash is null or length(p_access_token_hash) <> 64 then
    raise exception 'Token de orden invalido.' using errcode = 'PLU01';
  end if;
  if jsonb_typeof(p_attendees) <> 'array'
     or jsonb_array_length(p_attendees) < 1
     or jsonb_array_length(p_attendees) > 8 then
    raise exception 'La compra debe incluir entre 1 y 8 asistentes.' using errcode = 'PLU01';
  end if;

  select * into v_existing from public.ticket_orders
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.access_token_hash is distinct from p_access_token_hash then
      raise exception 'La clave de idempotencia ya pertenece a otra solicitud.' using errcode = 'PLU01';
    end if;
    select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb)
      into v_tickets from public.tickets t where t.order_id = v_existing.id;
    return jsonb_build_object('order', to_jsonb(v_existing), 'tickets', v_tickets, 'duplicate', true);
  end if;

  perform public.expire_ticket_reservations(now());

  select * into v_event from public.events where slug = p_event_slug for update;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  if v_event.status in ('cerrado', 'finalizado') then
    raise exception 'La venta de entradas esta cerrada.' using errcode = 'PLU03';
  end if;
  if v_event.ticket_sales_opens_at is not null and now() < v_event.ticket_sales_opens_at then
    raise exception 'La venta de entradas todavia no abrio.' using errcode = 'PLU03';
  end if;
  if v_event.ticket_sales_closes_at is not null and now() > v_event.ticket_sales_closes_at then
    raise exception 'La venta de entradas ya cerro.' using errcode = 'PLU03';
  end if;

  v_provider := coalesce(p_buyer ->> 'provider', 'mercado_pago');
  if v_provider not in ('mercado_pago', 'manual') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  v_channel := nullif(trim(p_buyer ->> 'manualPaymentChannel'), '');
  if v_provider = 'manual' then
    v_channel := coalesce(v_channel, 'bank_transfer');
    if v_channel not in ('bank_transfer', 'wise_transfer') then
      raise exception 'Canal de pago manual invalido.' using errcode = 'PLU01';
    end if;
  elsif v_channel is not null then
    raise exception 'Solo el pago manual admite un canal.' using errcode = 'PLU01';
  end if;

  if coalesce(length(trim(p_buyer ->> 'email')), 0) > 0
     and (p_buyer ->> 'email') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email del comprador invalido.' using errcode = 'PLU01';
  end if;

  v_catalog := public.event_ticket_addons_catalog(v_event.rules);

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    if coalesce(length(trim(v_attendee ->> 'fullName')), 0) < 3
       or coalesce(v_attendee ->> 'dni', '') !~ '^[0-9]{7,8}$' then
      raise exception 'Datos de asistente invalidos.' using errcode = 'PLU01';
    end if;
    begin
      v_type_id := (v_attendee ->> 'ticketTypeId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Tipo de entrada invalido.' using errcode = 'PLU01';
    end;
    if not exists (
      select 1 from public.ticket_types where id = v_type_id and event_id = v_event.id and active
    ) then
      raise exception 'Tipo de entrada invalido.' using errcode = 'PLU01';
    end if;
  end loop;

  select limit_count into v_limit from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event' and key = '';
  if v_limit is not null then
    select count(*) into v_reserved from public.tickets
    where event_id = v_event.id and status <> 'cancelada';
    if v_reserved + jsonb_array_length(p_attendees) > v_limit then
      raise exception 'Evento agotado.' using errcode = 'PLU04';
    end if;
  end if;

  for v_type in select * from public.ticket_types where event_id = v_event.id and quota is not null
  loop
    select count(*) into v_reserved from public.tickets
    where ticket_type_id = v_type.id and status <> 'cancelada';
    select count(*) into v_requested from jsonb_array_elements(p_attendees)
    where (value ->> 'ticketTypeId')::uuid = v_type.id;
    if v_requested > 0 and v_reserved + v_requested > v_type.quota then
      raise exception 'Entradas agotadas para %.', v_type.name using errcode = 'PLU04';
    end if;
  end loop;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    select * into v_type from public.ticket_types where id = (v_attendee ->> 'ticketTypeId')::uuid;
    v_addon_result := public.ticket_addons_total_and_snapshot(
      coalesce(v_attendee -> 'addonIds', '[]'::jsonb), v_catalog
    );
    v_unit_price := v_type.price + coalesce((v_addon_result ->> 'total')::int, 0);
    v_total := v_total + v_unit_price;
  end loop;

  -- Wise fija su propio precio en USD (calculado por la API, nunca por el
  -- cliente) en vez del catálogo ARS por tipo de entrada + addons.
  v_currency := v_event.currency;
  if v_channel = 'wise_transfer' then
    if coalesce((p_buyer ->> 'wiseAmount')::int, 0) <= 0 then
      raise exception 'Falta el importe de Wise.' using errcode = 'PLU01';
    end if;
    v_total := (p_buyer ->> 'wiseAmount')::int;
    v_currency := coalesce(nullif(trim(p_buyer ->> 'wiseCurrency'), ''), 'USD');
  end if;

  v_hold_minutes := case when v_provider = 'manual' then 1440 else 20 end;
  insert into public.ticket_orders (
    event_id, buyer_name, buyer_email, buyer_phone, amount, currency, provider,
    manual_payment_channel, status, reference, idempotency_key, access_token_hash,
    reservation_expires_at
  ) values (
    v_event.id, nullif(trim(p_buyer ->> 'name'), ''), lower(nullif(trim(p_buyer ->> 'email'), '')),
    nullif(trim(p_buyer ->> 'phone'), ''), v_total, v_currency, v_provider, v_channel,
    case when v_provider = 'manual' then 'pendiente' else 'creado' end,
    'TORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    p_access_token_hash, now() + make_interval(mins => v_hold_minutes)
  ) returning * into v_order;

  for v_attendee in select value from jsonb_array_elements(p_attendees)
  loop
    select * into v_type from public.ticket_types where id = (v_attendee ->> 'ticketTypeId')::uuid;
    v_addon_result := public.ticket_addons_total_and_snapshot(
      coalesce(v_attendee -> 'addonIds', '[]'::jsonb), v_catalog
    );
    v_unit_price := v_type.price + coalesce((v_addon_result ->> 'total')::int, 0);

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', addon ->> 'id', 'label', addon ->> 'label', 'price', 0,
      'redeemLabel', addon ->> 'redeemLabel', 'redeemedAt', null, 'included', true
    )), '[]'::jsonb)
    into v_included_addons
    from jsonb_array_elements(v_catalog) addon
    where addon ->> 'id' in (
      select addon_id from public.ticket_type_included_addons where ticket_type_id = v_type.id
    );

    v_addons := coalesce(v_addon_result -> 'addons', '[]'::jsonb) || v_included_addons;

    insert into public.tickets (
      ticket_code, order_id, event_id, attendee_name, attendee_dni,
      ticket_type_id, unit_price, addons, status
    ) values (
      'TCK-' || lpad(nextval('public.ticket_code_seq')::text, 8, '0'),
      v_order.id, v_event.id, trim(v_attendee ->> 'fullName'),
      v_attendee ->> 'dni', v_type.id, v_unit_price, v_addons, 'pendiente_pago'
    ) returning to_jsonb(tickets) into v_ticket;
    v_tickets := v_tickets || jsonb_build_array(v_ticket);
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, metadata)
  values ('ticket_order.created', 'ticket_order', v_order.id::text, 'public',
    jsonb_build_object('eventId', v_event.id, 'quantity', jsonb_array_length(p_attendees), 'provider', v_provider, 'manualPaymentChannel', v_channel));

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

do $verification$
declare
  v_toggles jsonb := public.staff_get_platform_feature_toggles();
begin
  if v_toggles -> 'wiseEnabled' is null then
    raise exception 'El interruptor wiseEnabled no quedó expuesto.' using errcode = 'PLU01';
  end if;
  if to_regprocedure(
    'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,numeric,text)'
  ) is null then
    raise exception 'settle_manual_checkout_pricing no quedó con el parámetro de moneda.' using errcode = 'PLU01';
  end if;
  if to_regprocedure(
    'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,numeric)'
  ) is not null then
    raise exception 'Quedó vivo el overload viejo (5 args) de settle_manual_checkout_pricing.' using errcode = 'PLU01';
  end if;
  if to_regprocedure(
    'public.create_membership_registration_combo_checkout(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text)'
  ) is not null then
    raise exception 'Quedó vivo el overload viejo (11 args) del combo checkout.' using errcode = 'PLU01';
  end if;
end
$verification$;
