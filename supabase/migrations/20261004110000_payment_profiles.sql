-- Perfiles de cobro reutilizables (Fase B1) — PLU ARG
--
-- Extrae alias/CBU/titular a un catálogo que varios eventos pueden compartir.
-- Las columnas bank_transfer_* del evento quedan como fallback (Fase A) y se
-- sincronizan al vincular un perfil para no romper lecturas viejas.
--
-- MP / OAuth / secrets de terceros quedan fuera (Fase B3).

create table if not exists public.payment_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  name text not null,
  kind text not null
    check (kind in ('bank_transfer', 'mercado_pago', 'wise_transfer', 'cash_pitbull')),
  -- Datos no secretos del medio. Para bank_transfer: {alias,cbu,holder,notes}.
  -- mercado_pago queda reservado (sin secrets acá).
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_profiles_name_len check (char_length(trim(name)) between 2 and 120),
  constraint payment_profiles_config_object check (jsonb_typeof(config) = 'object')
);

create unique index if not exists payment_profiles_org_name_kind_uidx
  on public.payment_profiles (organization_id, lower(trim(name)), kind)
  where active = true;

create index if not exists payment_profiles_org_kind_idx
  on public.payment_profiles (organization_id, kind)
  where active = true;

comment on table public.payment_profiles is
  'Catálogo de medios de cobro reutilizables (alias bancario, futuro MP, etc.).';

alter table public.events
  add column if not exists bank_transfer_profile_id uuid
    references public.payment_profiles(id) on delete set null;

create index if not exists events_bank_transfer_profile_id_idx
  on public.events (bank_transfer_profile_id)
  where bank_transfer_profile_id is not null;

comment on column public.events.bank_transfer_profile_id is
  'Perfil bancario reutilizable. Si está set, manda sobre bank_transfer_* del evento.';

-- Backfill: un perfil por evento que ya tenía alias propio.
insert into public.payment_profiles (organization_id, name, kind, config, active)
select
  e.organization_id,
  left('Transferencia · ' || coalesce(nullif(trim(e.title), ''), e.slug), 120),
  'bank_transfer',
  jsonb_strip_nulls(jsonb_build_object(
    'alias', nullif(trim(e.bank_transfer_alias), ''),
    'cbu', nullif(trim(e.bank_transfer_cbu), ''),
    'holder', nullif(trim(e.bank_transfer_holder), '')
  )),
  true
from public.events e
where nullif(trim(e.bank_transfer_alias), '') is not null
  and e.bank_transfer_profile_id is null
  and not exists (
    select 1
    from public.payment_profiles p
    where p.organization_id = e.organization_id
      and p.kind = 'bank_transfer'
      and lower(trim(p.name)) = lower(left('Transferencia · ' || coalesce(nullif(trim(e.title), ''), e.slug), 120))
      and p.active
  );

update public.events e
set bank_transfer_profile_id = p.id
from public.payment_profiles p
where e.bank_transfer_profile_id is null
  and nullif(trim(e.bank_transfer_alias), '') is not null
  and p.organization_id = e.organization_id
  and p.kind = 'bank_transfer'
  and p.active
  and lower(trim(p.name)) = lower(left('Transferencia · ' || coalesce(nullif(trim(e.title), ''), e.slug), 120));

-- ── staff_upsert_event: aceptar bankTransferProfileId ──
-- Redefinición de 20261003100000 + FK al perfil.

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
  v_channel_overrides jsonb;
  v_bank jsonb;
  v_bank_profile_id uuid;
  v_profile public.payment_profiles;
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

  if p_event ? 'paymentChannelOverrides' then
    if p_event -> 'paymentChannelOverrides' is null
       or jsonb_typeof(p_event -> 'paymentChannelOverrides') = 'null' then
      v_channel_overrides := null;
    else
      v_channel_overrides := p_event -> 'paymentChannelOverrides';
    end if;
  else
    v_channel_overrides := null;
  end if;

  v_bank := coalesce(p_event -> 'bankTransfer', '{}'::jsonb);
  v_bank_profile_id := nullif(p_event ->> 'bankTransferProfileId', '')::uuid;

  if v_bank_profile_id is not null then
    select * into v_profile
    from public.payment_profiles
    where id = v_bank_profile_id and active = true;
    if not found then
      raise exception 'El perfil de cobro no existe o está archivado.' using errcode = 'PLU02';
    end if;
    if v_profile.kind <> 'bank_transfer' then
      raise exception 'El perfil vinculado no es de transferencia bancaria.' using errcode = 'PLU01';
    end if;
  end if;

  insert into public.events(
    slug, title, description, venue, location, starts_at, ends_at,
    registration_opens_at, registration_closes_at,
    ticket_sales_opens_at, ticket_sales_closes_at,
    capacity, status, published, requires_membership, price, manual_price, currency, rules,
    live_stream_url, live_stream_provider, live_status, capacity_progress_public,
    payment_channel_overrides, bank_transfer_alias, bank_transfer_cbu, bank_transfer_holder,
    bank_transfer_profile_id
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
    coalesce(p_event ->> 'liveStatus', 'offline'),
    coalesce((p_event ->> 'capacityProgressPublic')::boolean, true),
    v_channel_overrides,
    coalesce(
      case when v_bank_profile_id is not null
        then nullif(trim(v_profile.config ->> 'alias'), '') end,
      nullif(trim(v_bank ->> 'alias'), '')
    ),
    coalesce(
      case when v_bank_profile_id is not null
        then nullif(trim(v_profile.config ->> 'cbu'), '') end,
      nullif(trim(v_bank ->> 'cbu'), '')
    ),
    coalesce(
      case when v_bank_profile_id is not null
        then nullif(trim(v_profile.config ->> 'holder'), '') end,
      nullif(trim(v_bank ->> 'holder'), '')
    ),
    v_bank_profile_id
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
    capacity_progress_public = excluded.capacity_progress_public,
    payment_channel_overrides = case
      when p_event ? 'paymentChannelOverrides' then excluded.payment_channel_overrides
      else public.events.payment_channel_overrides
    end,
    bank_transfer_alias = case
      when p_event ? 'bankTransfer' or p_event ? 'bankTransferProfileId'
        then excluded.bank_transfer_alias
      else public.events.bank_transfer_alias
    end,
    bank_transfer_cbu = case
      when p_event ? 'bankTransfer' or p_event ? 'bankTransferProfileId'
        then excluded.bank_transfer_cbu
      else public.events.bank_transfer_cbu
    end,
    bank_transfer_holder = case
      when p_event ? 'bankTransfer' or p_event ? 'bankTransferProfileId'
        then excluded.bank_transfer_holder
      else public.events.bank_transfer_holder
    end,
    bank_transfer_profile_id = case
      when p_event ? 'bankTransferProfileId' then excluded.bank_transfer_profile_id
      else public.events.bank_transfer_profile_id
    end,
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
grant execute on function public.staff_upsert_event(jsonb, text)
  to service_role;

do $verification$
begin
  if to_regclass('public.payment_profiles') is null then
    raise exception 'Falta payment_profiles.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'bank_transfer_profile_id'
  ) then
    raise exception 'Falta events.bank_transfer_profile_id.';
  end if;
end;
$verification$;
