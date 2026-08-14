-- Cupones de descuento y vigencia programada de planes — PLU ARG
--
-- Cupones aplican solo a membresia e inscripcion (nunca a tickets ni al
-- combo, decision de producto explicita). Descuento en porcentaje, con
-- vencimiento, tope de usos total opcional y un uso maximo por atleta (regla
-- fija, garantizada por un unique index, no por un chequeo previo que pueda
-- perder la carrera).
--
-- La vigencia de un plan reusa `retired_at` (ya existente desde
-- 20260810140000_pricing_catalog_admin.sql): antes solo se seteaba
-- reactivamente al versionar o desactivar; ahora se puede programar de
-- antemano al crear un plan o reprogramar sobre uno ya publicado.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.discount_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  description text,
  percent_off int not null check (percent_off between 1 and 100),
  applies_to text not null check (applies_to in ('membership', 'registration', 'both')),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_codes_code_check check (code ~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'),
  constraint discount_codes_org_code_uidx unique (organization_id, code)
);

create index if not exists discount_codes_org_active_idx
  on public.discount_codes(organization_id, active, expires_at);

alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from public, anon, authenticated;
grant select, insert, update on public.discount_codes to service_role;

create table if not exists public.discount_code_redemptions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  discount_code_id uuid not null references public.discount_codes(id) on delete restrict,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  payment_order_id uuid not null references public.athlete_payment_orders(id) on delete cascade,
  discount_amount int not null check (discount_amount >= 0),
  created_at timestamptz not null default now(),
  constraint discount_code_redemptions_athlete_uidx unique (discount_code_id, athlete_id),
  constraint discount_code_redemptions_order_uidx unique (payment_order_id)
);

create index if not exists discount_code_redemptions_code_idx
  on public.discount_code_redemptions(discount_code_id);

alter table public.discount_code_redemptions enable row level security;
revoke all on public.discount_code_redemptions from public, anon, authenticated;
grant select, insert on public.discount_code_redemptions to service_role;

alter table public.athlete_payment_orders
  add column if not exists discount_code_id uuid references public.discount_codes(id) on delete set null,
  add column if not exists discount_code text,
  add column if not exists discount_amount int not null default 0;

alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_discount_amount_check;
alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_discount_amount_check check (discount_amount >= 0);

-- ---------------------------------------------------------------------------
-- Vigencia programada de planes: staff_create_membership_plan_version acepta
-- ahora `retiresAt` opcional; staff_set_membership_plan_retirement reprograma
-- la fecha de corte de un plan ya publicado sin forzar un nuevo versionado.
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
    organization_id, family_code, version, code, name, description, price,
    currency, billing_frequency, collection_mode, interval_count, grace_days,
    effective_from, retired_at, active
  ) values (
    v_organization_id, v_family_code, v_version, v_code,
    trim(p_plan ->> 'name'), nullif(trim(p_plan ->> 'description'), ''),
    v_price, v_currency, v_frequency, v_collection, v_interval, v_grace,
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

create or replace function public.staff_set_membership_plan_retirement(
  p_plan_id uuid,
  p_retires_at timestamptz,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans;
  v_before jsonb;
begin
  select * into v_plan from public.membership_plans where id = p_plan_id for update;
  if not found then
    raise exception 'Plan no encontrado.' using errcode = 'PLU02';
  end if;
  if p_retires_at is not null and p_retires_at <= v_plan.effective_from then
    raise exception 'La fecha de corte debe ser posterior a la vigencia.' using errcode = 'PLU01';
  end if;
  v_before := to_jsonb(v_plan);

  update public.membership_plans
  set retired_at = p_retires_at, updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'membership_plan.retirement_scheduled', 'membership_plan', v_plan.id::text,
    'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_plan)),
    v_plan.organization_id
  );

  return to_jsonb(v_plan);
end;
$$;

revoke all on function public.staff_set_membership_plan_retirement(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_membership_plan_retirement(uuid, timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- CRUD admin de cupones
-- ---------------------------------------------------------------------------

create or replace function public.staff_upsert_discount_code(
  p_code jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_code ->> 'id', '')::uuid;
  v_organization_id uuid := coalesce(
    nullif(p_code ->> 'organizationId', '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  v_code_text text := upper(trim(p_code ->> 'code'));
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_percent is null or v_percent < 1 or v_percent > 100
     or v_applies not in ('membership', 'registration', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código de descuento son inválidos.' using errcode = 'PLU01';
  end if;

  if v_id is not null then
    select * into v_result from public.discount_codes
    where id = v_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El código de descuento no existe.' using errcode = 'PLU02';
    end if;
    v_before := to_jsonb(v_result);

    update public.discount_codes
    set code = v_code_text,
        description = nullif(trim(p_code ->> 'description'), ''),
        percent_off = v_percent,
        applies_to = v_applies,
        max_redemptions = v_max_redemptions,
        expires_at = v_expires,
        active = v_active,
        updated_at = now()
    where id = v_id
    returning * into v_result;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.updated', 'discount_code', v_result.id::text, 'staff', p_actor,
      jsonb_build_object('before', v_before, 'after', to_jsonb(v_result)), v_organization_id
    );
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, percent_off, applies_to,
        max_redemptions, expires_at, active
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_percent, v_applies, v_max_redemptions, v_expires, v_active
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código de descuento con ese nombre.' using errcode = 'PLU13';
    end;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.created', 'discount_code', v_result.id::text, 'staff', p_actor,
      to_jsonb(v_result), v_organization_id
    );
  end if;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

create or replace function public.staff_set_discount_code_active(
  p_code_id uuid,
  p_active boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_before jsonb;
begin
  select * into v_code from public.discount_codes where id = p_code_id for update;
  if not found then
    raise exception 'Código de descuento no encontrado.' using errcode = 'PLU02';
  end if;
  v_before := to_jsonb(v_code);

  update public.discount_codes
  set active = p_active, updated_at = now()
  where id = p_code_id
  returning * into v_code;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.status_changed', 'discount_code', v_code.id::text, 'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_code)), v_code.organization_id
  );

  return to_jsonb(v_code);
end;
$$;

revoke all on function public.staff_set_discount_code_active(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_discount_code_active(uuid, boolean, text)
  to service_role;

-- staff_get_pricing_configuration gana `discountCodes`, con el conteo de
-- redenciones ya usadas, para que el panel hidrate todo en el mismo
-- round-trip que ya hace hoy (planes + eventos + combo).
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
          'currency', e.currency,
          'status', e.status,
          'published', e.published,
          'comboOffer', case when o.id is null then null else
            jsonb_build_object(
              'id', o.id,
              'membershipPlanId', o.membership_plan_id,
              'price', o.price,
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

-- ---------------------------------------------------------------------------
-- Aplicación de cupón sobre una orden ya creada (invocada desde las RPC
-- transaccionales de compra, nunca desde el webhook: apply_mercado_pago_payment
-- exige que el monto cobrado coincida exacto con athlete_payment_orders.amount,
-- así que el descuento tiene que estar resuelto antes de generar la
-- preferencia de pago).
-- ---------------------------------------------------------------------------

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

  select * into v_code from public.discount_codes
  where organization_id = p_organization_id and code = upper(trim(p_code))
  for update;
  if not found or not v_code.active
     or v_code.applies_to not in (p_applies_to, 'both')
     or (v_code.expires_at is not null and v_code.expires_at < now()) then
    raise exception 'El código de descuento no es válido.' using errcode = 'PLU20';
  end if;

  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    raise exception 'El código de descuento alcanzó el máximo de usos.' using errcode = 'PLU21';
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

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'discount_code.redeemed', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('discountCodeId', v_code.id, 'code', v_code.code, 'discountAmount', v_discount),
    p_organization_id
  );

  return jsonb_build_object('applied', true, 'discountAmount', v_discount, 'code', v_code.code);
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_discount_code_to_order(uuid, uuid, uuid, text, text)
  to service_role;

-- Preview de solo lectura: no redime, solo valida y calcula. La confirmación
-- real (y la unica que cuenta como redención) pasa por
-- apply_discount_code_to_order dentro de la creación de la orden.
create or replace function public.athlete_preview_discount_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_applies_to text,
  p_base_amount int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_discount int;
  v_already_redeemed boolean;
begin
  select * into v_code from public.discount_codes
  where organization_id = p_organization_id and code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if not v_code.active then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_code.applies_to not in (p_applies_to, 'both') then
    return jsonb_build_object('valid', false, 'reason', 'not_applicable');
  end if;
  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    return jsonb_build_object('valid', false, 'reason', 'limit_reached');
  end if;

  select exists(
    select 1 from public.discount_code_redemptions
    where discount_code_id = v_code.id and athlete_id = p_athlete_id
  ) into v_already_redeemed;
  if v_already_redeemed then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  v_discount := floor(p_base_amount * v_code.percent_off / 100.0)::int;
  return jsonb_build_object(
    'valid', true,
    'code', v_code.code,
    'percentOff', v_code.percent_off,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- RPC transaccionales versionadas: agregan p_discount_code y hacen real la
-- vigencia programada del plan (create_membership_order_v2/v3 no la
-- chequeaban). Se versiona en vez de mutar in-place porque cambia la firma
-- (mismo criterio ya usado en el repo para v2 -> v3).
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_v4(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_plan from public.membership_plans
  where organization_id = v_athlete.organization_id and code = p_plan_code and active = true;
  if not found
     or v_plan.effective_from > now()
     or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
    raise exception 'El plan de afiliación no está vigente.' using errcode = 'PLU03';
  end if;

  v_result := public.create_membership_order_v3(
    p_athlete_id, p_payment_method, p_plan_code, p_idempotency_key
  );

  select * into v_order from public.athlete_payment_orders
  where id = (v_result -> 'order' ->> 'id')::uuid for update;

  perform public.apply_discount_code_to_order(
    v_order.organization_id, p_athlete_id, v_order.id, 'membership', p_discount_code
  );

  select * into v_order from public.athlete_payment_orders where id = v_order.id;
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_membership_order_v4(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_v4(uuid, text, text, text, text)
  to service_role;

create or replace function public.create_competition_registration_v3(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  v_result := public.create_competition_registration_v2(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key
  );

  select * into v_order from public.athlete_payment_orders
  where id = (v_result -> 'order' ->> 'id')::uuid for update;

  perform public.apply_discount_code_to_order(
    v_order.organization_id, p_athlete_id, v_order.id, 'registration', p_discount_code
  );

  select * into v_order from public.athlete_payment_orders where id = v_order.id;
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_competition_registration_v3(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_v3(
  uuid, text, text, text, numeric, text, text, text
) to service_role;

do $verification$
begin
  if to_regclass('public.discount_codes') is null
    or to_regclass('public.discount_code_redemptions') is null
    or to_regprocedure('public.apply_discount_code_to_order(uuid,uuid,uuid,text,text)') is null
    or to_regprocedure('public.create_membership_order_v4(uuid,text,text,text,text)') is null
    or to_regprocedure('public.create_competition_registration_v3(uuid,text,text,text,numeric,text,text,text)') is null then
    raise exception 'La verificación de cupones/vigencia de planes no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
