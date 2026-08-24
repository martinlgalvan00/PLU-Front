-- Visibilidad pública de la ocupación del evento — PLU ARG
--
-- Decisión de negocio por evento: mostrar o no en el sitio cuánta gente se
-- anotó (contador "48/180") y el progreso del cupo (barra). Un evento chico
-- puede preferir no exhibir demanda baja; uno por llenarse puede usarla como
-- urgencia real. El panel admin sigue viendo la ocupación siempre: este flag
-- sólo gobierna la proyección pública.
--
-- Columna propia (no `rules`, como featured/ticketsEnabled) porque cruza tres
-- RPCs distintas y leerla de un jsonb en cada una era repartir el contrato.

alter table public.events
  add column if not exists capacity_progress_public boolean not null default true;

-- ── staff_upsert_event: persistir el flag desde el editor completo ──
-- Redefinición completa de 20260824100000 + la columna nueva.

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
    live_stream_url, live_stream_provider, live_status, capacity_progress_public
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
    coalesce((p_event ->> 'capacityProgressPublic')::boolean, true)
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

-- ── staff_set_event_state: el flag también desde la consola de operación ──
-- Misma razón que requiresMembership (20260826100000): prenderlo/apagarlo no
-- puede obligar a reescribir el evento entero. Se borra la firma vieja para que
-- PostgREST no resuelva ambiguo (PGRST203).

drop function if exists public.staff_set_event_state(text, text, boolean, boolean, text);

create or replace function public.staff_set_event_state(
  p_event_slug text,
  p_status text default null,
  p_published boolean default null,
  p_requires_membership boolean default null,
  p_actor text default null,
  p_capacity_progress_public boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.events;
  v_event public.events;
begin
  if p_status is null and p_published is null and p_requires_membership is null
     and p_capacity_progress_public is null then
    raise exception 'No hay ningún cambio para aplicar.' using errcode = 'PLU01';
  end if;

  if p_status is not null and p_status not in (
    'proximamente', 'inscripcion_abierta', 'cupos_limitados',
    'agotado', 'cerrado', 'finalizado'
  ) then
    raise exception 'Estado de evento inválido.' using errcode = 'PLU01';
  end if;

  select * into v_before from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  update public.events set
    status = coalesce(p_status, status),
    published = coalesce(p_published, published),
    requires_membership = coalesce(p_requires_membership, requires_membership),
    capacity_progress_public = coalesce(p_capacity_progress_public, capacity_progress_public),
    updated_at = now()
  where id = v_before.id;

  -- Después del UPDATE: el trigger de capacidad ya pudo haber corregido el estado.
  select * into v_event from public.events where id = v_before.id;

  perform plu_private.record_domain_audit(
    'event.state_changed', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'statusFrom', v_before.status,
      'statusTo', v_event.status,
      'statusRequested', p_status,
      'publishedFrom', v_before.published,
      'publishedTo', v_event.published,
      'requiresMembershipFrom', v_before.requires_membership,
      'requiresMembershipTo', v_event.requires_membership,
      'capacityProgressPublicFrom', v_before.capacity_progress_public,
      'capacityProgressPublicTo', v_event.capacity_progress_public
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'registered', plu_private.event_active_registrations(v_event.id),
    'statusOverridden', v_event.status <> coalesce(p_status, v_before.status)
  );
end;
$$;

revoke all on function public.staff_set_event_state(text, text, boolean, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_state(text, text, boolean, boolean, text, boolean)
  to service_role;

-- ── get_event_registration_capacity: el summary público dice si se exhibe ──
-- Redefinición de 20260823110000 + `progressPublic`. Los números siguen
-- viajando (el checkout de inscripciones necesita saber si hay cupo); la
-- decisión de pintarlos es del frontend con este flag.

create or replace function public.get_event_registration_capacity(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_registered int := 0;
  v_capacity int;
  v_recent jsonb := '[]'::jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;

  v_capacity := v_event.capacity;
  select count(*)::int into v_registered
  from public.event_registrations r
  where r.event_id = v_event.id
    and r.status in ('pendiente_pago', 'pagada', 'confirmada');

  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', item.display_name,
    'gym', item.gym,
    'photoPath', item.photo_path,
    'registeredAt', item.registered_at
  ) order by item.registered_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      case
        when cardinality(np.parts) = 0 or np.parts[1] is null or np.parts[1] = '' then 'Atleta'
        when cardinality(np.parts) = 1 then np.parts[1]
        else array_to_string(np.parts[1:cardinality(np.parts) - 1], ' ') || ' ' || upper(left(np.parts[cardinality(np.parts)], 1)) || '.'
      end as display_name,
      coalesce(nullif(trim(a.gym), ''), '') as gym,
      nullif(trim(a.photo_path), '') as photo_path,
      r.created_at as registered_at
    from public.event_registrations r
    join public.athletes a on a.id = r.athlete_id
    cross join lateral (
      select string_to_array(trim(both from regexp_replace(coalesce(a.full_name, ''), '\s+', ' ', 'g')), ' ') as parts
    ) np
    where r.event_id = v_event.id
      and r.public_visible
      and r.status in ('pendiente_pago', 'pagada', 'confirmada')
    order by r.created_at desc
    limit 8
  ) item;

  return jsonb_build_object(
    'capacity', v_capacity,
    'registered', v_registered,
    'remaining', case when v_capacity is null then null else greatest(v_capacity - v_registered, 0) end,
    'recent', v_recent,
    'progressPublic', v_event.capacity_progress_public
  );
end;
$$;

revoke all on function public.get_event_registration_capacity(text) from public, anon, authenticated;
grant execute on function public.get_event_registration_capacity(text) to service_role;
