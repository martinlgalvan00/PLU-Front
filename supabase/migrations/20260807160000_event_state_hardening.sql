-- Endurecimiento del estado de evento: dos correcciones — PLU ARG
--
-- 1. `staff_upsert_event`: la versión de 20260806230000 se ramificó desde
--    20260722140000 y perdió el fix de 20260801150000 — `requires_membership`
--    volvió a quedar hardcodeado en true, así que el toggle "requiere
--    membresía" del editor no podía apagarse. Se restaura el coalesce sobre
--    `p_event ->> 'requiresMembership'`. Además la función devolvía la fila
--    capturada por `returning *`, anterior al trigger de capacidad
--    (`events_capacity_status_guard`, 20260807140000): se relee la fila antes
--    de devolverla para que el llamador vea el estado efectivo.
--
-- 2. `staff_set_event_state`: `statusOverridden` se calculaba solo contra
--    `p_status`, así que un cambio de solo `published` que disparaba el sync de
--    capacidad (el trigger corre ante la mención de la columna, no ante un
--    cambio de valor) podía reescribir el estado y reportar igual un éxito
--    plano. Ahora se compara el estado final contra el que el operador esperaba
--    (`coalesce(p_status, estado previo)`), cubriendo los dos casos.

-- ---------------------------------------------------------------------------
-- 1. staff_upsert_event: requires_membership configurable + fila post-trigger
-- ---------------------------------------------------------------------------
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
    slug, title, venue, location, starts_at, ends_at, registration_opens_at,
    registration_closes_at, ticket_sales_opens_at, ticket_sales_closes_at,
    capacity, status, published, requires_membership, price, currency, rules,
    live_stream_url, live_stream_provider, live_status
  ) values (
    trim(p_event ->> 'slug'), trim(p_event ->> 'title'), trim(p_event ->> 'venue'), trim(p_event ->> 'location'),
    v_starts, v_ends, nullif(p_event ->> 'registrationOpensAt', '')::timestamptz,
    nullif(p_event ->> 'registrationClosesAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesOpensAt', '')::timestamptz,
    nullif(p_event ->> 'ticketSalesClosesAt', '')::timestamptz,
    nullif(p_event ->> 'slots', '')::int, coalesce(p_event ->> 'status', 'proximamente'),
    coalesce((p_event ->> 'published')::boolean, false),
    coalesce((p_event ->> 'requiresMembership')::boolean, true),
    coalesce((v_pricing ->> 'registration')::int, 0), 'ARS',
    jsonb_build_object(
      'ticketAddons', coalesce(v_pricing -> 'ticketAddons', '[]'::jsonb),
      'ticketsEnabled', coalesce((v_pricing ->> 'ticketsEnabled')::boolean, true),
      'featured', coalesce((p_event ->> 'featured')::boolean, false),
      'membershipPrice', coalesce((v_pricing ->> 'membership')::int, 0),
      'comboPrice', coalesce((v_pricing ->> 'combo')::int, 0)
    ),
    nullif(p_event ->> 'liveStreamUrl', ''), nullif(p_event ->> 'liveStreamProvider', ''),
    coalesce(p_event ->> 'liveStatus', 'offline')
  ) on conflict(slug) do update set
    title = excluded.title, venue = excluded.venue, location = excluded.location,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    registration_opens_at = excluded.registration_opens_at, registration_closes_at = excluded.registration_closes_at,
    ticket_sales_opens_at = excluded.ticket_sales_opens_at, ticket_sales_closes_at = excluded.ticket_sales_closes_at,
    capacity = excluded.capacity, status = excluded.status, published = excluded.published,
    requires_membership = excluded.requires_membership, price = excluded.price, currency = excluded.currency,
    rules = excluded.rules, live_stream_url = excluded.live_stream_url,
    live_stream_provider = excluded.live_stream_provider, live_status = excluded.live_status, updated_at = now()
  returning * into v_event;

  if coalesce((p_event ->> 'featured')::boolean, false) then
    update public.events
    set rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{featured}', 'false'::jsonb, true), updated_at = now()
    where id <> v_event.id and coalesce((rules ->> 'featured')::boolean, false) = true;
  end if;

  v_limit := nullif(p_event ->> 'slots', '')::int;
  delete from public.event_capacity_rules where event_id = v_event.id and scope = 'event';
  if v_limit is not null then
    insert into public.event_capacity_rules(event_id, scope, key, limit_count)
    values(v_event.id, 'event', '', v_limit);
  end if;

  select coalesce(array_agg(coalesce((d ->> 'dayIndex')::int, 0)), array[]::int[])
  into v_day_indexes
  from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb)) d;

  -- Un día que desaparece del editor pero todavía tiene grilla armada encima
  -- se avisa; borrarlo en silencio dejaría inscriptos sin día y tandas
  -- huérfanas.
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

  for v_day in select * from jsonb_array_elements(coalesce(p_event -> 'eventDays', '[]'::jsonb))
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

  delete from public.ticket_types where event_id = v_event.id;
  for v_type in select * from jsonb_array_elements(coalesce(p_event -> 'ticketTypes', '[]'::jsonb))
  loop
    if coalesce(length(trim(v_type ->> 'name')), 0) < 1 then
      raise exception 'Cada tipo de entrada necesita un nombre.' using errcode = 'PLU01';
    end if;
    insert into public.ticket_types(event_id, name, price, quota, sort_order, active)
    values (
      v_event.id, trim(v_type ->> 'name'), coalesce((v_type ->> 'price')::int, 0),
      nullif(v_type ->> 'quota', '')::int, coalesce((v_type ->> 'sortOrder')::int, 0),
      coalesce((v_type ->> 'active')::boolean, true)
    ) returning id into v_type_id;

    select array_agg(d.id) into v_day_ids
    from public.event_days d
    where d.event_id = v_event.id
      and d.day_index in (
        select (value)::int
        from jsonb_array_elements_text(coalesce(v_type -> 'dayIndexes', '[]'::jsonb))
      );
    if v_day_ids is not null then
      insert into public.ticket_type_days(ticket_type_id, event_day_id)
      select v_type_id, unnest(v_day_ids);
    end if;

    for v_addon_id in select jsonb_array_elements_text(coalesce(v_type -> 'includedAddonIds', '[]'::jsonb))
    loop
      insert into public.ticket_type_included_addons(ticket_type_id, addon_id)
      values (v_type_id, v_addon_id);
    end loop;
  end loop;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id)
  values('event.upserted', 'event', v_event.id::text, 'staff', p_actor);

  -- El trigger de capacidad (events_capacity_status_guard) pudo haber corregido
  -- el estado después del upsert; se devuelve la fila efectiva, no la pedida.
  select * into v_event from public.events where id = v_event.id;
  return to_jsonb(v_event);
end $$;

revoke all on function public.staff_upsert_event(jsonb, text) from public, anon, authenticated;
grant execute on function public.staff_upsert_event(jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. staff_set_event_state: statusOverridden sin falsos negativos
-- ---------------------------------------------------------------------------
create or replace function public.staff_set_event_state(
  p_event_slug text,
  p_status text default null,
  p_published boolean default null,
  p_actor text default null
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
  if p_status is null and p_published is null then
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
      'publishedTo', v_event.published
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'registered', plu_private.event_active_registrations(v_event.id),
    -- El panel necesita distinguir "no se aplicó" de "se aplicó y la base lo
    -- corrigió". Se compara contra lo que el operador esperaba ver: el estado
    -- pedido, o el previo si solo tocó `published` — el trigger corre ante la
    -- mención de la columna y puede reescribir el estado en ambos casos.
    'statusOverridden', v_event.status <> coalesce(p_status, v_before.status)
  );
end;
$$;

revoke all on function public.staff_set_event_state(text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_state(text, text, boolean, text) to service_role;
