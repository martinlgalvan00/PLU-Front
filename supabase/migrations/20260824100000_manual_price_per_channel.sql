-- Precio configurable por medio de pago — PLU ARG
--
-- Reemplaza la "Política temporal Pitbull 2026" (tres copias hardcodeadas de la
-- misma fecha/montos: server/modules/pricing/checkoutPricePolicy.js,
-- plu_private.configure_atomic_checkout_pricing, y src/services/checkoutPricing.js)
-- por un precio "manual" (transferencia/efectivo, un solo valor para los dos
-- canales) editable desde Administración en membresías, inscripciones y combos.
-- `manual_price` nulo = sin diferenciación, cobra igual que `price` en cualquier
-- canal — compatibilidad total con lo que no se configure.
--
-- Se preserva la arquitectura atómica existente (precio y orden se fijan en la
-- misma transacción, ver 20260819190000_atomic_checkout_pricing.sql): en vez de
-- que la API decida un importe final y la base sólo lo valide contra una tabla
-- fija, la API pasa los dos precios crudos del plan/evento/combo y es la base
-- quien decide cuál corresponde.

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------

alter table public.membership_plans
  add column if not exists manual_price int null
    check (manual_price is null or (manual_price > 0 and manual_price <= 10000000));

alter table public.events
  add column if not exists manual_price int null
    check (manual_price is null or (manual_price > 0 and manual_price <= 10000000));

alter table public.event_combo_offers
  add column if not exists manual_price int null
    check (manual_price is null or (manual_price > 0 and manual_price <= 10000000));

-- ---------------------------------------------------------------------------
-- Helper compartido: qué precio corresponde según el medio de pago.
-- ---------------------------------------------------------------------------

create or replace function plu_private.resolve_channel_price(
  p_payment_method text,
  p_default_price numeric,
  p_manual_price numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when p_payment_method = 'manual_link' and p_manual_price is not null then p_manual_price
    else p_default_price
  end;
$$;

-- ---------------------------------------------------------------------------
-- configure_atomic_checkout_pricing: cambia de firma (p_order_amount -> los dos
-- precios crudos). Ya no depende de ninguna fecha ni monto fijo.
-- ---------------------------------------------------------------------------

drop function if exists plu_private.configure_atomic_checkout_pricing(text, text, text, numeric);

create or replace function plu_private.configure_atomic_checkout_pricing(
  p_concept text,
  p_payment_method text,
  p_manual_payment_channel text,
  p_default_price numeric,
  p_manual_price numeric
)
returns void
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_expected_amount numeric;
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

  if p_default_price is null or p_default_price <= 0 then
    raise exception 'El precio de catalogo es invalido.' using errcode = 'PLU01';
  end if;

  v_expected_amount := plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price);

  perform set_config('plu.atomic_checkout_pricing', '1', true);
  perform set_config('plu.atomic_checkout_amount', v_expected_amount::text, true);
  perform set_config('plu.atomic_manual_payment_channel', coalesce(p_manual_payment_channel, ''), true);
end;
$$;

revoke all on function plu_private.configure_atomic_checkout_pricing(text, text, text, numeric, numeric)
  from public, anon, authenticated;

-- El trigger que aplica los GUC al INSERT (apply_atomic_checkout_pricing) no
-- cambia: sigue leyendo plu.atomic_checkout_amount tal cual.

-- ---------------------------------------------------------------------------
-- settle_manual_checkout_pricing: misma firma nueva, misma decisión de precio,
-- mismo comportamiento de vencimiento/canal y el mismo freeze una vez que hay
-- comprobante o preference (no se toca esa parte).
-- ---------------------------------------------------------------------------

drop function if exists plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric);

create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_default_price numeric,
  p_manual_price numeric
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

  if v_order.status not in ('pendiente', 'creado', 'validacion_manual')
     or v_order.method is distinct from p_payment_method then
    return v_order;
  end if;

  if v_order.payment_proof_path is not null or v_order.provider_preference_id is not null then
    return v_order;
  end if;

  update public.athlete_payment_orders
  set amount = coalesce(
        plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price),
        amount
      ),
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

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Los tres wrappers _checkout: p_order_amount -> p_default_price + p_manual_price.
-- ---------------------------------------------------------------------------

drop function if exists public.create_membership_order_checkout(uuid, text, text, text, text, numeric, text);

create or replace function public.create_membership_order_checkout(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
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
    'membership', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
  );
  v_result := public.create_membership_order_v4(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text)
  to service_role;

drop function if exists public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, text
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
    'registration', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
  );
  v_result := public.create_competition_registration_v3(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text
) to service_role;

drop function if exists public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, text, text
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
  p_discount_code text default null
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
    'combo', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
  );
  v_result := public.create_membership_registration_combo_order(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code
  );

  v_order := plu_private.settle_manual_checkout_pricing(
    (v_result -> 'order' ->> 'id')::uuid,
    p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price
  );
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- CRUD admin: los tres formularios de precio ganan `manualPrice` opcional.
-- ---------------------------------------------------------------------------

create or replace function public.staff_create_membership_plan_version(
  p_plan jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.membership_plans;
  v_created public.membership_plans;
  v_organization_id uuid := coalesce(
    nullif(p_plan ->> 'organizationId', '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  v_source_id uuid := nullif(p_plan ->> 'sourcePlanId', '')::uuid;
  v_family_code text := lower(trim(p_plan ->> 'familyCode'));
  v_version int;
  v_code text;
  v_price int := nullif(p_plan ->> 'price', '')::int;
  v_manual_price int := nullif(p_plan ->> 'manualPrice', '')::int;
  v_currency text := upper(coalesce(nullif(trim(p_plan ->> 'currency'), ''), 'ARS'));
  v_frequency text := p_plan ->> 'billingFrequency';
  v_collection text := p_plan ->> 'collectionMode';
  v_interval int := coalesce(nullif(p_plan ->> 'intervalCount', '')::int, 1);
  v_grace int := coalesce(nullif(p_plan ->> 'graceDays', '')::int, 0);
  v_effective timestamptz := coalesce(nullif(p_plan ->> 'effectiveFrom', '')::timestamptz, now());
  v_retires timestamptz := nullif(p_plan ->> 'retiresAt', '')::timestamptz;
begin
  if v_source_id is not null then
    select * into v_source
    from public.membership_plans
    where id = v_source_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El plan de origen no existe.' using errcode = 'PLU02';
    end if;
    v_family_code := v_source.family_code;
  end if;

  if v_family_code is null or v_family_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or coalesce(length(trim(p_plan ->> 'name')), 0) < 3
     or v_price is null or v_price <= 0 or v_price > 10000000
     or (v_manual_price is not null and (v_manual_price <= 0 or v_manual_price > 10000000))
     or v_currency <> 'ARS'
     or v_frequency not in ('monthly', 'annual')
     or v_collection not in ('one_time', 'recurring')
     or v_interval < 1 or v_interval > 24
     or v_grace < 0 or v_grace > 90 then
    raise exception 'Los datos del plan son inválidos.' using errcode = 'PLU01';
  end if;

  if v_retires is not null and v_retires <= v_effective then
    raise exception 'La fecha de corte debe ser posterior a la vigencia.' using errcode = 'PLU01';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.membership_plans
  where organization_id = v_organization_id and family_code = v_family_code;

  v_code := case when v_version = 1 then v_family_code
    else v_family_code || '-v' || v_version::text end;

  insert into public.membership_plans(
    organization_id, family_code, version, code, name, description, price, manual_price,
    currency, billing_frequency, collection_mode, interval_count, grace_days,
    effective_from, retired_at, active
  ) values (
    v_organization_id, v_family_code, v_version, v_code,
    trim(p_plan ->> 'name'), nullif(trim(p_plan ->> 'description'), ''),
    v_price, v_manual_price, v_currency, v_frequency, v_collection, v_interval, v_grace,
    v_effective, v_retires, true
  ) returning * into v_created;

  if v_source.id is not null then
    update public.membership_plans
    set retired_at = v_effective, updated_at = now()
    where id = v_source.id;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'membership_plan.version_created', 'membership_plan', v_created.id::text,
    'staff', p_actor,
    jsonb_build_object(
      'sourcePlanId', v_source.id,
      'familyCode', v_created.family_code,
      'version', v_created.version,
      'price', v_created.price,
      'manualPrice', v_created.manual_price,
      'currency', v_created.currency,
      'effectiveFrom', v_created.effective_from,
      'retiresAt', v_created.retired_at
    ),
    v_organization_id
  );

  return to_jsonb(v_created);
end;
$$;

revoke all on function public.staff_create_membership_plan_version(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_create_membership_plan_version(jsonb, text)
  to service_role;

create or replace function public.staff_upsert_event(p_event jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_starts timestamptz;
  v_ends timestamptz;
  v_pricing jsonb;
  v_limit int;
  v_day jsonb;
  v_day_ids uuid[];
  v_type jsonb;
  v_type_id uuid;
  v_requested_type_id uuid;
  v_type_ids uuid[] := array[]::uuid[];
  v_day_index int;
  v_day_indexes int[];
  v_addon_id text;
  v_orphan_label text;
begin
  if coalesce(length(trim(p_event ->> 'slug')), 0) < 2
     or coalesce(length(trim(p_event ->> 'title')), 0) < 3 then
    raise exception 'Datos del evento invalidos.' using errcode = 'PLU01';
  end if;

  v_starts := nullif(p_event ->> 'startsAt', '')::timestamptz;
  v_ends := nullif(p_event ->> 'endsAt', '')::timestamptz;
  if v_starts is null or v_ends is null or v_ends < v_starts then
    raise exception 'Fechas del evento invalidas.' using errcode = 'PLU01';
  end if;

  v_pricing := coalesce(p_event -> 'pricing', '{}'::jsonb);
  insert into public.events(
    slug, title, description, venue, location, starts_at, ends_at,
    registration_opens_at, registration_closes_at,
    ticket_sales_opens_at, ticket_sales_closes_at,
    capacity, status, published, requires_membership, price, manual_price, currency, rules,
    live_stream_url, live_stream_provider, live_status
  ) values (
    trim(p_event ->> 'slug'),
    trim(p_event ->> 'title'),
    nullif(trim(p_event ->> 'description'), ''),
    trim(p_event ->> 'venue'),
    trim(p_event ->> 'location'),
    v_starts,
    v_ends,
    nullif(p_event ->> 'registrationOpensAt', '')::timestamptz,
    nullif(p_event ->> 'registrationClosesAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesOpensAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesClosesAt', '')::timestamptz,
    nullif(p_event ->> 'slots', '')::int,
    coalesce(p_event ->> 'status', 'proximamente'),
    coalesce((p_event ->> 'published')::boolean, false),
    coalesce((p_event ->> 'requiresMembership')::boolean, true),
    coalesce((v_pricing ->> 'registration')::int, 0),
    nullif(v_pricing ->> 'registrationManual', '')::int,
    'ARS',
    jsonb_build_object(
      'ticketAddons', coalesce(v_pricing -> 'ticketAddons', '[]'::jsonb),
      'ticketsEnabled', coalesce((v_pricing ->> 'ticketsEnabled')::boolean, true),
      'featured', coalesce((p_event ->> 'featured')::boolean, false),
      'membershipPrice', coalesce((v_pricing ->> 'membership')::int, 0),
      'comboPrice', coalesce((v_pricing ->> 'combo')::int, 0)
    ),
    nullif(p_event ->> 'liveStreamUrl', ''),
    nullif(p_event ->> 'liveStreamProvider', ''),
    coalesce(p_event ->> 'liveStatus', 'offline')
  ) on conflict(slug) do update set
    title = excluded.title,
    description = excluded.description,
    venue = excluded.venue,
    location = excluded.location,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    registration_opens_at = excluded.registration_opens_at,
    registration_closes_at = excluded.registration_closes_at,
    ticket_sales_opens_at = excluded.ticket_sales_opens_at,
    ticket_sales_closes_at = excluded.ticket_sales_closes_at,
    capacity = excluded.capacity,
    status = excluded.status,
    published = excluded.published,
    requires_membership = excluded.requires_membership,
    price = excluded.price,
    manual_price = excluded.manual_price,
    currency = excluded.currency,
    rules = excluded.rules,
    live_stream_url = excluded.live_stream_url,
    live_stream_provider = excluded.live_stream_provider,
    live_status = excluded.live_status,
    updated_at = now()
  returning * into v_event;

  if coalesce((p_event ->> 'featured')::boolean, false) then
    update public.events
    set rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{featured}', 'false'::jsonb, true),
        updated_at = now()
    where id <> v_event.id
      and coalesce((rules ->> 'featured')::boolean, false) = true;
  end if;

  v_limit := nullif(p_event ->> 'slots', '')::int;
  delete from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event';
  if v_limit is not null then
    insert into public.event_capacity_rules(event_id, scope, key, limit_count)
    values(v_event.id, 'event', '', v_limit);
  end if;

  select coalesce(array_agg(coalesce((d ->> 'dayIndex')::int, 0)), array[]::int[])
  into v_day_indexes
  from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb)) d;

  select d.label into v_orphan_label
  from public.event_days d
  where d.event_id = v_event.id
    and not (d.day_index = any (v_day_indexes))
    and (
      exists (select 1 from public.event_sessions s where s.event_day_id = d.id)
      or exists (select 1 from public.event_registrations r where r.event_day_id = d.id)
    )
  limit 1;

  if v_orphan_label is not null then
    raise exception 'No se puede eliminar el día "%": ya tiene tandas o atletas asignados.', v_orphan_label
      using errcode = 'PLU07';
  end if;

  delete from public.event_days d
  where d.event_id = v_event.id
    and not (d.day_index = any (v_day_indexes));

  for v_day in
    select * from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb))
  loop
    v_day_index := coalesce((v_day ->> 'dayIndex')::int, 0);
    insert into public.event_days(event_id, day_index, label, date)
    values (
      v_event.id,
      v_day_index,
      coalesce(nullif(trim(v_day ->> 'label'), ''), 'Día ' || (v_day_index + 1)::text),
      nullif(v_day ->> 'date', '')::date
    )
    on conflict (event_id, day_index) do update set
      label = excluded.label,
      date = excluded.date;
  end loop;

  for v_type in
    select * from jsonb_array_elements(coalesce(p_event -> 'ticketTypes', '[]'::jsonb))
  loop
    if coalesce(length(trim(v_type ->> 'name')), 0) < 1 then
      raise exception 'Cada tipo de entrada necesita un nombre.' using errcode = 'PLU01';
    end if;

    v_requested_type_id := nullif(v_type ->> 'id', '')::uuid;
    if v_requested_type_id is not null then
      select id into v_type_id
      from public.ticket_types
      where id = v_requested_type_id and event_id = v_event.id
      for update;

      if not found then
        raise exception 'El tipo de entrada no pertenece a este evento.' using errcode = 'PLU01';
      end if;
      if v_type_id = any(v_type_ids) then
        raise exception 'El tipo de entrada está repetido.' using errcode = 'PLU01';
      end if;

      update public.ticket_types set
        name = trim(v_type ->> 'name'),
        price = coalesce((v_type ->> 'price')::int, 0),
        quota = nullif(v_type ->> 'quota', '')::int,
        sort_order = coalesce((v_type ->> 'sortOrder')::int, 0),
        active = coalesce((v_type ->> 'active')::boolean, true),
        updated_at = now()
      where id = v_type_id;
    else
      insert into public.ticket_types(event_id, name, price, quota, sort_order, active)
      values (
        v_event.id,
        trim(v_type ->> 'name'),
        coalesce((v_type ->> 'price')::int, 0),
        nullif(v_type ->> 'quota', '')::int,
        coalesce((v_type ->> 'sortOrder')::int, 0),
        coalesce((v_type ->> 'active')::boolean, true)
      ) returning id into v_type_id;
    end if;

    v_type_ids := array_append(v_type_ids, v_type_id);
    delete from public.ticket_type_days where ticket_type_id = v_type_id;
    delete from public.ticket_type_included_addons where ticket_type_id = v_type_id;

    select array_agg(d.id) into v_day_ids
    from public.event_days d
    where d.event_id = v_event.id
      and d.day_index in (
        select value::int
        from jsonb_array_elements_text(coalesce(v_type -> 'dayIndexes', '[]'::jsonb))
      );
    if v_day_ids is not null then
      insert into public.ticket_type_days(ticket_type_id, event_day_id)
      select v_type_id, unnest(v_day_ids);
    end if;

    for v_addon_id in
      select jsonb_array_elements_text(coalesce(v_type -> 'includedAddonIds', '[]'::jsonb))
    loop
      insert into public.ticket_type_included_addons(ticket_type_id, addon_id)
      values (v_type_id, v_addon_id);
    end loop;
  end loop;

  update public.ticket_types tt
  set active = false, updated_at = now()
  where tt.event_id = v_event.id
    and not (tt.id = any(v_type_ids))
    and exists (select 1 from public.tickets t where t.ticket_type_id = tt.id);

  delete from public.ticket_types tt
  where tt.event_id = v_event.id
    and not (tt.id = any(v_type_ids))
    and not exists (select 1 from public.tickets t where t.ticket_type_id = tt.id);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('event.upserted', 'event', v_event.id::text, 'staff', p_actor);

  select * into v_event from public.events where id = v_event.id;
  return to_jsonb(v_event);
end $$;

revoke all on function public.staff_upsert_event(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_event(jsonb, text) to service_role;

create or replace function public.staff_save_event_combo_offer(
  p_event_slug text,
  p_offer jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_plan public.membership_plans;
  v_offer public.event_combo_offers;
  v_before jsonb;
  v_price int := nullif(p_offer ->> 'price', '')::int;
  v_manual_price int := nullif(p_offer ->> 'manualPrice', '')::int;
  v_starts timestamptz := nullif(p_offer ->> 'startsAt', '')::timestamptz;
  v_ends timestamptz := nullif(p_offer ->> 'endsAt', '')::timestamptz;
begin
  select * into v_event from public.events where slug = trim(p_event_slug) for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_plan
  from public.membership_plans
  where id = nullif(p_offer ->> 'membershipPlanId', '')::uuid
    and organization_id = v_event.organization_id;
  if not found or v_plan.collection_mode <> 'one_time' then
    raise exception 'El combo requiere un plan de afiliación de pago único.' using errcode = 'PLU01';
  end if;

  if v_price is null or v_price <= 0 or v_price > 10000000
     or v_price > v_plan.price + v_event.price
     or (v_manual_price is not null and (
       v_manual_price <= 0 or v_manual_price > 10000000
       or v_manual_price > coalesce(v_plan.manual_price, v_plan.price) + coalesce(v_event.manual_price, v_event.price)
     ))
     or (v_starts is not null and v_ends is not null and v_ends < v_starts) then
    raise exception 'La oferta combo es inválida.' using errcode = 'PLU01';
  end if;

  select to_jsonb(o) into v_before
  from public.event_combo_offers o where o.event_id = v_event.id;

  insert into public.event_combo_offers(
    organization_id, event_id, membership_plan_id, price, manual_price, currency,
    active, starts_at, ends_at
  ) values (
    v_event.organization_id, v_event.id, v_plan.id, v_price, v_manual_price, 'ARS',
    coalesce((p_offer ->> 'active')::boolean, false), v_starts, v_ends
  ) on conflict(event_id) do update set
    membership_plan_id = excluded.membership_plan_id,
    price = excluded.price,
    manual_price = excluded.manual_price,
    currency = excluded.currency,
    active = excluded.active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    updated_at = now()
  returning * into v_offer;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'event_combo_offer.upserted', 'event_combo_offer', v_offer.id::text,
    'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_offer)),
    v_event.organization_id
  );

  return to_jsonb(v_offer);
end;
$$;

revoke all on function public.staff_save_event_combo_offer(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_event_combo_offer(text, jsonb, text)
  to service_role;

-- staff_get_pricing_configuration gana el precio manual de evento y de combo
-- (el de planes ya viaja solo: usa to_jsonb(p) sobre la fila completa).
create or replace function public.staff_get_pricing_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.family_code, p.version desc)
      from public.membership_plans p
      where p.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'registrationPrice', e.price,
          'registrationManualPrice', e.manual_price,
          'currency', e.currency,
          'status', e.status,
          'published', e.published,
          'comboOffer', case when o.id is null then null else
            jsonb_build_object(
              'id', o.id,
              'membershipPlanId', o.membership_plan_id,
              'price', o.price,
              'manualPrice', o.manual_price,
              'currency', o.currency,
              'active', o.active,
              'startsAt', o.starts_at,
              'endsAt', o.ends_at,
              'updatedAt', o.updated_at
            )
          end
        ) order by e.starts_at
      )
      from public.events e
      left join public.event_combo_offers o on o.event_id = e.id
      where e.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'discountCodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'code', c.code,
          'description', c.description,
          'percentOff', c.percent_off,
          'appliesTo', c.applies_to,
          'maxRedemptions', c.max_redemptions,
          'expiresAt', c.expires_at,
          'active', c.active,
          'enablesManualPayment', c.enables_manual_payment,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'redeemedCount', (
            select count(*) from public.discount_code_redemptions r
            where r.discount_code_id = c.id
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'membership_plans' and column_name = 'manual_price'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'manual_price'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_combo_offers' and column_name = 'manual_price'
  ) or to_regprocedure(
    'plu_private.configure_atomic_checkout_pricing(text,text,text,numeric,numeric)'
  ) is null or to_regprocedure(
    'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,numeric)'
  ) is null or to_regprocedure(
    'public.create_membership_order_checkout(uuid,text,text,text,text,numeric,numeric,text)'
  ) is null or to_regprocedure(
    'public.create_competition_registration_checkout(uuid,text,text,text,numeric,text,text,text,numeric,numeric,text)'
  ) is null or to_regprocedure(
    'public.create_membership_registration_combo_checkout(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text)'
  ) is null then
    raise exception 'La verificación de precio por medio de pago no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
