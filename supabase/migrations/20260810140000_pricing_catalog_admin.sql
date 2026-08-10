-- Catálogo económico administrable y ofertas combo versionadas — PLU ARG
--
-- Los precios que terminan en una orden salen siempre de Supabase. Los planes
-- ligados a Mercado Pago no se mutan: cada cambio económico crea una versión.

alter table public.membership_plans
  add column if not exists family_code text,
  add column if not exists version int,
  add column if not exists effective_from timestamptz,
  add column if not exists retired_at timestamptz;

update public.membership_plans
set family_code = coalesce(family_code, code),
    version = coalesce(version, 1),
    effective_from = coalesce(effective_from, created_at, now())
where family_code is null or version is null or effective_from is null;

alter table public.membership_plans
  alter column family_code set not null,
  alter column version set not null,
  alter column effective_from set not null,
  alter column effective_from set default now();

alter table public.membership_plans
  drop constraint if exists membership_plans_family_code_check,
  drop constraint if exists membership_plans_version_check,
  drop constraint if exists membership_plans_retirement_check;

alter table public.membership_plans
  add constraint membership_plans_family_code_check
    check (family_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  add constraint membership_plans_version_check check (version > 0);

-- `retired_at` puede ser anterior a `effective_from`: representa un plan
-- programado que se canceló antes de entrar en vigencia.

create unique index if not exists membership_plans_org_family_version_uidx
  on public.membership_plans(organization_id, family_code, version);
create index if not exists membership_plans_effective_catalog_idx
  on public.membership_plans(organization_id, active, effective_from, retired_at);

create table if not exists public.event_combo_offers (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete cascade,
  membership_plan_id uuid not null references public.membership_plans(id) on delete restrict,
  price int not null check (price > 0 and price <= 10000000),
  currency text not null default 'ARS' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_combo_offers_window_check
    check (starts_at is null or ends_at is null or ends_at >= starts_at),
  constraint event_combo_offers_event_unique unique(event_id)
);

create index if not exists event_combo_offers_org_active_idx
  on public.event_combo_offers(organization_id, active, starts_at, ends_at);
create index if not exists event_combo_offers_plan_idx
  on public.event_combo_offers(membership_plan_id);

alter table public.event_combo_offers enable row level security;

drop policy if exists event_combo_offers_public_read on public.event_combo_offers;
create policy event_combo_offers_public_read
  on public.event_combo_offers for select
  to anon, authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

grant select on public.event_combo_offers to anon, authenticated;

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
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

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

  select coalesce(max(version), 0) + 1 into v_version
  from public.membership_plans
  where organization_id = v_organization_id and family_code = v_family_code;

  v_code := case when v_version = 1 then v_family_code
    else v_family_code || '-v' || v_version::text end;

  insert into public.membership_plans(
    organization_id, family_code, version, code, name, description, price,
    currency, billing_frequency, collection_mode, interval_count, grace_days,
    effective_from, active
  ) values (
    v_organization_id, v_family_code, v_version, v_code,
    trim(p_plan ->> 'name'), nullif(trim(p_plan ->> 'description'), ''),
    v_price, v_currency, v_frequency, v_collection, v_interval, v_grace,
    v_effective, true
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
      'effectiveFrom', v_created.effective_from
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

create or replace function public.staff_set_membership_plan_active(
  p_plan_id uuid,
  p_active boolean,
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
  v_before := to_jsonb(v_plan);

  update public.membership_plans
  set active = p_active,
      retired_at = case when p_active then null else coalesce(retired_at, now()) end,
      updated_at = now()
  where id = p_plan_id
  returning * into v_plan;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'membership_plan.status_changed', 'membership_plan', v_plan.id::text,
    'staff', p_actor,
    jsonb_build_object('before', v_before, 'after', to_jsonb(v_plan)),
    v_plan.organization_id
  );

  return to_jsonb(v_plan);
end;
$$;

revoke all on function public.staff_set_membership_plan_active(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_membership_plan_active(uuid, boolean, text)
  to service_role;

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
     or (v_starts is not null and v_ends is not null and v_ends < v_starts) then
    raise exception 'La oferta combo es inválida.' using errcode = 'PLU01';
  end if;

  select to_jsonb(o) into v_before
  from public.event_combo_offers o where o.event_id = v_event.id;

  insert into public.event_combo_offers(
    organization_id, event_id, membership_plan_id, price, currency,
    active, starts_at, ends_at
  ) values (
    v_event.organization_id, v_event.id, v_plan.id, v_price, 'ARS',
    coalesce((p_offer ->> 'active')::boolean, false), v_starts, v_ends
  ) on conflict(event_id) do update set
    membership_plan_id = excluded.membership_plan_id,
    price = excluded.price,
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

-- El importe de inscripción es un dato económico real: nunca se persiste en
-- cero ni negativo. Los datos históricos del proyecto ya cumplen esta regla.
alter table public.events
  drop constraint if exists events_price_positive,
  add constraint events_price_positive check (price > 0 and price <= 10000000);
