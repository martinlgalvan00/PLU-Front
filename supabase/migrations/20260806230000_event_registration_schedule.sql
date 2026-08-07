-- Grilla de competencia: qué día y en qué tanda compite cada inscripto — PLU ARG
--
-- Hasta ahora una inscripción sabía a qué evento pertenece, pero no cuándo se
-- compite. En la puerta eso se traducía en que el QR resolvía "inscripto a
-- Pitbull Classic" y nada más: seguridad no podía decir si esa persona venía
-- el día que corresponde, y el roster de check-in daba a todos los atletas por
-- presentes todos los días (`dayIndexes: 'all'` en checkinWorkspaceService).
--
-- El modelo queda en dos niveles, porque así se arma una grilla de
-- powerlifting y así se asigna: primero el día, más cerca de la fecha la tanda
-- (grupo de levantamiento, con su horario de pesaje y su plataforma). Los dos
-- son nullable — al inscribirse y pagar todavía no hay grilla, y "a confirmar"
-- es un estado legítimo que la credencial tiene que saber mostrar.

-- ---------------------------------------------------------------------------
-- 1. Ids estables para los días del evento
-- ---------------------------------------------------------------------------
-- `staff_upsert_event` venía haciendo delete + insert de `event_days` en cada
-- guardado, así que los ids rotaban. Mientras los días solo alimentaban tipos
-- de entrada -- que se recrean en la misma pasada -- no se notaba. Con la
-- grilla colgando de ahí, editar el título del evento habría borrado la
-- asignación de todos los inscriptos.
--
-- El unique (id, event_id) es además el soporte de las FK compuestas de más
-- abajo: son las que impiden asignar una inscripción a un día de otro evento.
-- Índice único y no constraint: alcanza para que la FK compuesta lo tome como
-- destino, y `if not exists` deja la migración reejecutable (el
-- `add constraint ... using index` se rompe en la segunda pasada, porque el
-- drop previo se lleva puesto el índice que la línea siguiente espera).
create unique index if not exists event_days_id_event_uidx
  on public.event_days (id, event_id);

-- ---------------------------------------------------------------------------
-- 2. event_sessions — las tandas
-- ---------------------------------------------------------------------------
-- Una tanda pertenece a un día, y un día a un evento. `platform` y los dos
-- horarios son opcionales: la organización suele fijar primero el reparto de
-- atletas y recién después el pesaje y la plataforma.
create table if not exists public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_day_id uuid not null,
  name text not null,
  platform text,
  weigh_in_at timestamptz,
  starts_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_sessions_name_not_blank check (length(trim(name)) > 0),
  -- El día tiene que ser del mismo evento que la tanda.
  constraint event_sessions_day_fk
    foreign key (event_day_id, event_id)
    references public.event_days (id, event_id) on delete restrict,
  -- Dos tandas con el mismo nombre en un evento serían indistinguibles en la
  -- credencial, que es donde este dato se lee.
  constraint event_sessions_event_name_key unique (event_id, name)
);

-- Soportes de las FK compuestas de event_registrations, mismo criterio que
-- arriba: índices únicos, reejecutables.
create unique index if not exists event_sessions_id_event_uidx
  on public.event_sessions (id, event_id);
create unique index if not exists event_sessions_id_day_uidx
  on public.event_sessions (id, event_day_id);

create index if not exists event_sessions_event_idx
  on public.event_sessions (event_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. La asignación en la inscripción
-- ---------------------------------------------------------------------------
alter table public.event_registrations
  add column if not exists event_day_id uuid,
  add column if not exists event_session_id uuid;

do $$
begin
  -- El día asignado tiene que pertenecer al evento de la inscripción.
  if not exists (
    select 1 from pg_constraint where conname = 'event_registrations_day_fk'
  ) then
    alter table public.event_registrations
      add constraint event_registrations_day_fk
      foreign key (event_day_id, event_id)
      references public.event_days (id, event_id) on delete restrict;
  end if;

  -- Y la tanda tiene que ser una tanda de ese mismo día. Con las dos FK
  -- compuestas juntas no hace falta ningún trigger de coherencia: una tanda
  -- de otro evento o de otro día no matchea.
  if not exists (
    select 1 from pg_constraint where conname = 'event_registrations_session_fk'
  ) then
    alter table public.event_registrations
      add constraint event_registrations_session_fk
      foreign key (event_session_id, event_day_id)
      references public.event_sessions (id, event_day_id) on delete restrict;
  end if;

  -- Las FK compuestas son MATCH SIMPLE: con una columna en null no verifican
  -- nada. Eso deja pasar "tanda sin día", que no significa nada. Al revés
  -- (día sin tanda) sí es válido: es el estado intermedio de la asignación.
  if not exists (
    select 1 from pg_constraint where conname = 'event_registrations_session_needs_day'
  ) then
    alter table public.event_registrations
      add constraint event_registrations_session_needs_day
      check (event_session_id is null or event_day_id is not null);
  end if;
end $$;

create index if not exists event_registrations_day_idx
  on public.event_registrations (event_day_id);
create index if not exists event_registrations_session_idx
  on public.event_registrations (event_session_id);

-- ---------------------------------------------------------------------------
-- 4. La grilla de una inscripción, en un solo lugar
-- ---------------------------------------------------------------------------
-- Cinco proyecciones distintas necesitan el mismo bloque (la credencial
-- pública, la de staff, el snapshot del atleta, el listado del panel y el
-- roster de check-in). Duplicar el join en cada una es garantía de que se
-- desincronicen: la migración anterior ya arrastró ese problema con la
-- resolución del token.
--
-- Devuelve null cuando todavía no hay día asignado -- "a confirmar" -- y el
-- bloque con la tanda en null cuando hay día pero no tanda, que es el estado
-- intermedio normal de la asignación.
create or replace function plu_private.registration_schedule(
  p_registration public.event_registrations
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'day_id', d.id,
    'day_index', d.day_index,
    'day_label', d.label,
    'day_date', d.date,
    'session_id', s.id,
    'session_name', s.name,
    'platform', s.platform,
    'weigh_in_at', s.weigh_in_at,
    'starts_at', s.starts_at
  )
  from public.event_days d
  left join public.event_sessions s on s.id = p_registration.event_session_id
  where d.id = p_registration.event_day_id;
$$;

revoke all on function plu_private.registration_schedule(public.event_registrations)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS de event_sessions
-- ---------------------------------------------------------------------------
-- Mismo criterio que event_days: la grilla de un evento publicado es
-- información pública (el atleta la mira desde su perfil), la escritura es de
-- admin. Las policies van partidas por rol para no romper el linter de
-- Supabase, igual que en 20260721000000.
alter table public.event_sessions enable row level security;

drop policy if exists event_sessions_select_public_anon on public.event_sessions;
create policy event_sessions_select_public_anon
  on public.event_sessions
  for select
  to anon
  using (exists (
    select 1
    from public.events e
    where e.id = event_sessions.event_id and e.published = true
  ));

drop policy if exists event_sessions_select_authenticated on public.event_sessions;
create policy event_sessions_select_authenticated
  on public.event_sessions
  for select
  to authenticated
  using (
    (select plu_private.is_admin())
    or exists (
      select 1
      from public.events e
      where e.id = event_sessions.event_id and e.published = true
    )
  );

drop policy if exists event_sessions_insert_admin on public.event_sessions;
create policy event_sessions_insert_admin
  on public.event_sessions for insert to authenticated
  with check ((select plu_private.is_admin()));

drop policy if exists event_sessions_update_admin on public.event_sessions;
create policy event_sessions_update_admin
  on public.event_sessions for update to authenticated
  using ((select plu_private.is_admin()))
  with check ((select plu_private.is_admin()));

drop policy if exists event_sessions_delete_admin on public.event_sessions;
create policy event_sessions_delete_admin
  on public.event_sessions for delete to authenticated
  using ((select plu_private.is_admin()));

grant select on public.event_sessions to anon, authenticated;
grant insert, update, delete on public.event_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- 6. staff_upsert_event: los días se conservan entre guardados
-- ---------------------------------------------------------------------------
-- Único cambio respecto de 20260722140000: el bloque de `event_days` pasa de
-- delete + insert a upsert por (event_id, day_index), y borrar un día que
-- todavía tiene tandas o inscriptos asignados falla con un mensaje que se
-- puede leer en el panel en vez de con una violación de FK cruda.
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
    coalesce((p_event ->> 'published')::boolean, false), true,
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
  return to_jsonb(v_event);
end $$;

revoke all on function public.staff_upsert_event(jsonb, text) from public, anon, authenticated;
grant execute on function public.staff_upsert_event(jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Lectura de la grilla de un evento
-- ---------------------------------------------------------------------------
-- Días, tandas y cuántos atletas hay asignados a cada una. El conteo es lo que
-- vuelve usable la asignación masiva: sin él no se sabe si una tanda quedó con
-- 4 atletas o con 40.
create or replace function public.staff_get_event_schedule(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  return jsonb_build_object(
    'eventSlug', v_event.slug,
    'days', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'dayIndex', d.day_index,
          'label', d.label,
          'date', d.date,
          'assignedCount', (
            select count(*) from public.event_registrations r
            where r.event_day_id = d.id and r.status <> 'cancelada'
          )
        ) order by d.day_index
      ), '[]'::jsonb)
      from public.event_days d
      where d.event_id = v_event.id
    ),
    'sessions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'eventDayId', s.event_day_id,
          'dayIndex', d.day_index,
          'name', s.name,
          'platform', s.platform,
          'weighInAt', s.weigh_in_at,
          'startsAt', s.starts_at,
          'sortOrder', s.sort_order,
          'assignedCount', (
            select count(*) from public.event_registrations r
            where r.event_session_id = s.id and r.status <> 'cancelada'
          )
        ) order by d.day_index, s.sort_order, s.name
      ), '[]'::jsonb)
      from public.event_sessions s
      join public.event_days d on d.id = s.event_day_id
      where s.event_id = v_event.id
    ),
    'unassignedCount', (
      select count(*) from public.event_registrations r
      where r.event_id = v_event.id
        and r.status <> 'cancelada'
        and r.event_day_id is null
    )
  );
end;
$$;

revoke all on function public.staff_get_event_schedule(text) from public, anon, authenticated;
grant execute on function public.staff_get_event_schedule(text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Alta/edición de tandas
-- ---------------------------------------------------------------------------
-- Reemplaza el set completo de tandas de un evento. Las que traen `id` se
-- actualizan (así la asignación ya hecha sobrevive a un cambio de horario), las
-- que no, se crean. Las que faltan se borran, salvo que tengan atletas
-- asignados: eso se avisa en vez de dejar gente sin tanda por un descuido.
create or replace function public.staff_save_event_sessions(
  p_event_slug text,
  p_sessions jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_session jsonb;
  v_session_id uuid;
  v_day_id uuid;
  v_day_index int;
  v_keep uuid[] := array[]::uuid[];
  v_orphan_name text;
begin
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  for v_session in select * from jsonb_array_elements(coalesce(p_sessions, '[]'::jsonb))
  loop
    if coalesce(length(trim(v_session ->> 'name')), 0) < 1 then
      raise exception 'Cada tanda necesita un nombre.' using errcode = 'PLU01';
    end if;

    v_day_index := nullif(v_session ->> 'dayIndex', '')::int;
    select d.id into v_day_id
    from public.event_days d
    where d.event_id = v_event.id and d.day_index = v_day_index;
    if v_day_id is null then
      raise exception 'La tanda "%" apunta a un día que no existe en este evento.',
        trim(v_session ->> 'name') using errcode = 'PLU01';
    end if;

    v_session_id := nullif(v_session ->> 'id', '')::uuid;

    if v_session_id is not null then
      update public.event_sessions set
        event_day_id = v_day_id,
        name = trim(v_session ->> 'name'),
        platform = nullif(trim(v_session ->> 'platform'), ''),
        weigh_in_at = nullif(v_session ->> 'weighInAt', '')::timestamptz,
        starts_at = nullif(v_session ->> 'startsAt', '')::timestamptz,
        sort_order = coalesce((v_session ->> 'sortOrder')::int, 0),
        updated_at = now()
      where id = v_session_id and event_id = v_event.id
      returning id into v_session_id;

      if v_session_id is null then
        raise exception 'La tanda ya no existe. Actualizá el listado antes de continuar.'
          using errcode = 'PLU09';
      end if;
    else
      insert into public.event_sessions(
        event_id, event_day_id, name, platform, weigh_in_at, starts_at, sort_order
      ) values (
        v_event.id, v_day_id, trim(v_session ->> 'name'),
        nullif(trim(v_session ->> 'platform'), ''),
        nullif(v_session ->> 'weighInAt', '')::timestamptz,
        nullif(v_session ->> 'startsAt', '')::timestamptz,
        coalesce((v_session ->> 'sortOrder')::int, 0)
      ) returning id into v_session_id;
    end if;

    v_keep := v_keep || v_session_id;
  end loop;

  select s.name into v_orphan_name
  from public.event_sessions s
  where s.event_id = v_event.id
    and not (s.id = any (v_keep))
    and exists (select 1 from public.event_registrations r where r.event_session_id = s.id)
  limit 1;

  if v_orphan_name is not null then
    raise exception 'No se puede eliminar la tanda "%": todavía tiene atletas asignados.', v_orphan_name
      using errcode = 'PLU07';
  end if;

  delete from public.event_sessions s
  where s.event_id = v_event.id and not (s.id = any (v_keep));

  perform plu_private.record_domain_audit(
    'event.sessions_saved', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object('eventSlug', v_event.slug, 'sessionCount', cardinality(v_keep)),
    v_event.organization_id
  );

  return public.staff_get_event_schedule(v_event.slug);
end;
$$;

revoke all on function public.staff_save_event_sessions(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_event_sessions(text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Asignación masiva
-- ---------------------------------------------------------------------------
-- La operación real del panel: se filtra (por ejemplo, todas las Open Raw), se
-- selecciona y se manda todo al mismo día/tanda.
--
-- `p_day_index` y `p_session_id` en null limpian la asignación y la inscripción
-- vuelve a "a confirmar". Si viene la tanda, el día sale de ella: pedirlos por
-- separado y confiar en que coincidan es la clase de dato que se desincroniza.
create or replace function public.staff_assign_registration_schedule(
  p_event_slug text,
  p_registration_ids uuid[],
  p_day_index int,
  p_session_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_day_id uuid;
  v_session public.event_sessions;
  v_updated int;
  v_requested int;
begin
  v_requested := coalesce(cardinality(p_registration_ids), 0);
  if v_requested = 0 then
    raise exception 'No hay inscripciones seleccionadas.' using errcode = 'PLU01';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if p_session_id is not null then
    select * into v_session
    from public.event_sessions
    where id = p_session_id and event_id = v_event.id;
    if not found then
      raise exception 'La tanda no pertenece a este evento.' using errcode = 'PLU01';
    end if;
    v_day_id := v_session.event_day_id;
  elsif p_day_index is not null then
    select d.id into v_day_id
    from public.event_days d
    where d.event_id = v_event.id and d.day_index = p_day_index;
    if v_day_id is null then
      raise exception 'El día no existe en este evento.' using errcode = 'PLU01';
    end if;
  end if;

  -- El `event_id` en el WHERE no es redundante con el id de la inscripción: es
  -- lo que impide que un id de otro evento entre en el lote y termine
  -- apuntando a un día que no le corresponde.
  update public.event_registrations r
  set event_day_id = v_day_id,
      event_session_id = p_session_id,
      updated_at = now()
  where r.id = any (p_registration_ids)
    and r.event_id = v_event.id
    and r.status <> 'cancelada';

  get diagnostics v_updated = row_count;

  perform plu_private.record_domain_audit(
    'registration.schedule_assigned', 'event', v_event.id::text, 'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'requested', v_requested,
      'updated', v_updated,
      'dayIndex', p_day_index,
      'sessionId', p_session_id,
      'sessionName', v_session.name
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'updated', v_updated,
    'requested', v_requested,
    'schedule', public.staff_get_event_schedule(v_event.slug)
  );
end;
$$;

revoke all on function public.staff_assign_registration_schedule(text, uuid[], int, uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_assign_registration_schedule(text, uuid[], int, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 10. La grilla viaja en la credencial
-- ---------------------------------------------------------------------------
-- Misma proyección que 20260806140000, con el bloque `schedule` agregado a las
-- inscripciones (la puntual y las de la lista) y la fecha del evento, que ya se
-- calculaba y se descartaba. Es lo que hace que quien escanea en la puerta vea
-- qué día compite esa persona y no solo que está inscripta.
create or replace function plu_private.get_membership_by_code_or_token(
  p_code text,
  p_event_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_athlete public.athletes;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_event public.events;
  v_checkin public.check_ins;
  v_registrations jsonb;
  v_schedule jsonb;
begin
  begin
    v_token := p_code::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  if v_token is not null then
    select * into v_athlete from public.athletes where credential_token = v_token;

    -- Compatibilidad: credenciales emitidas cuando el token colgaba de la
    -- membresía. Siguen resolviendo a su dueño.
    if not found then
      select a.* into v_athlete
      from public.memberships m
      join public.athletes a on a.id = m.athlete_id
      where m.qr_token = v_token;
    end if;
  else
    select a.* into v_athlete
    from public.memberships m
    join public.athletes a on a.id = m.athlete_id
    where m.member_code = p_code;
  end if;

  if v_athlete.id is null then
    raise exception 'Credencial no encontrada.' using errcode = 'PLU02';
  end if;

  -- La afiliación que cubre HOY. Antes se devolvía la que matcheara el token,
  -- que tras una renovación podía ser la del período anterior.
  select * into v_membership
  from public.memberships m
  where m.athlete_id = v_athlete.id
    and m.status = 'activa'
    and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
  order by m.expiration_date desc
  limit 1;

  -- Sin cobertura vigente se muestra la más reciente, para que la puerta vea
  -- "vencida el X" en vez de "sin afiliación".
  if v_membership.id is null then
    select * into v_membership
    from public.memberships m
    where m.athlete_id = v_athlete.id
    order by m.expiration_date desc nulls last, m.created_at desc
    limit 1;
  end if;

  if p_event_slug is not null then
    select * into v_event from public.events where slug = p_event_slug;
    if found then
      select * into v_registration
      from public.event_registrations
      where athlete_id = v_athlete.id and event_id = v_event.id and status <> 'cancelada';
      if v_registration.id is not null then
        select * into v_checkin from public.check_ins
        where registration_id = v_registration.id;
        v_schedule := plu_private.registration_schedule(v_registration);
      end if;
    end if;
  end if;

  -- Sin evento en la URL se listan las inscripciones vigentes, para que quien
  -- escanea pueda elegir. Antes, escanear sin el query param no devolvía
  -- ninguna inscripción y la puerta se quedaba sin acción posible.
  select coalesce(jsonb_agg(entry order by entry ->> 'event_starts_at'), '[]'::jsonb)
  into v_registrations
  from (
    select jsonb_build_object(
      'id', r.id,
      'athlete_id', r.athlete_id,
      'division', r.division,
      'category', r.category,
      'status', r.status,
      'event_slug', e.slug,
      'event_title', e.title,
      'event_starts_at', e.starts_at,
      'event_ends_at', e.ends_at,
      'schedule', plu_private.registration_schedule(r),
      'check_in', case when c.id is null then null else jsonb_build_object(
        'id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at
      ) end
    ) as entry
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    left join public.check_ins c on c.registration_id = r.id
    where r.athlete_id = v_athlete.id
      and r.status <> 'cancelada'
      and e.status <> 'finalizado'
  ) rows;

  return jsonb_build_object(
    'athlete', jsonb_build_object(
      'id', v_athlete.id,
      'full_name', v_athlete.full_name
    ),
    'membership', case when v_membership.id is null then null else jsonb_build_object(
      'id', v_membership.id,
      'year', v_membership.year,
      'status', v_membership.status,
      'start_date', v_membership.start_date,
      'expiration_date', v_membership.expiration_date,
      'member_code', v_membership.member_code
    ) end,
    'registration', case when v_registration.id is null then null else jsonb_build_object(
      'id', v_registration.id,
      'athlete_id', v_registration.athlete_id,
      'division', v_registration.division,
      'category', v_registration.category,
      'status', v_registration.status,
      'event_slug', v_event.slug,
      'event_title', v_event.title,
      'event_starts_at', v_event.starts_at,
      'event_ends_at', v_event.ends_at,
      'schedule', v_schedule,
      'check_in', case when v_checkin.id is null then null else jsonb_build_object(
        'id', v_checkin.id,
        'gate', v_checkin.gate,
        'scanned_at', v_checkin.scanned_at
      ) end
    ) end,
    'registrations', v_registrations
  );
end;
$$;

revoke all on function plu_private.get_membership_by_code_or_token(text, text)
  from public, anon, authenticated, service_role;
grant execute on function plu_private.get_membership_by_code_or_token(text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Los snapshots del atleta y del panel también traen la grilla
-- ---------------------------------------------------------------------------
-- El atleta la mira desde su perfil y el panel la necesita para filtrar y
-- asignar. Las dos RPC ya devolvían `to_jsonb(r.*)`, así que las columnas
-- nuevas llegaban crudas (ids), pero sin el label del día ni el nombre de la
-- tanda no se puede mostrar nada.
create or replace function public.get_athlete_snapshot(p_athlete_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return jsonb_build_object(
    'athlete', to_jsonb(v_athlete),
    'memberships', (
      select coalesce(jsonb_agg(to_jsonb(m.*) order by m.created_at desc), '[]'::jsonb)
      from public.memberships m where m.athlete_id = p_athlete_id
    ),
    'registrations', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'registration', to_jsonb(r.*),
          'event', to_jsonb(e.*),
          'checkIn', to_jsonb(c.*),
          'schedule', plu_private.registration_schedule(r)
        )
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.event_registrations r
      join public.events e on e.id = r.event_id
      left join public.check_ins c on c.registration_id = r.id
      where r.athlete_id = p_athlete_id
    ),
    'paymentOrders', (
      select coalesce(jsonb_agg(to_jsonb(o.*) order by o.created_at desc), '[]'::jsonb)
      from public.athlete_payment_orders o where o.athlete_id = p_athlete_id
    )
  );
end;
$$;

grant execute on function public.get_athlete_snapshot(uuid) to anon, authenticated;

create or replace function public.list_athlete_admin_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_view_admin_data() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'athletes', (select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at desc), '[]'::jsonb) from public.athletes a),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(m.*) order by m.created_at desc), '[]'::jsonb) from public.memberships m),
    'registrations', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'registration', to_jsonb(r.*),
          'event', to_jsonb(e.*),
          'checkIn', to_jsonb(c.*),
          'schedule', plu_private.registration_schedule(r)
        )
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.event_registrations r
      join public.events e on e.id = r.event_id
      left join public.check_ins c on c.registration_id = r.id
    ),
    'paymentOrders', (select coalesce(jsonb_agg(to_jsonb(o.*) order by o.created_at desc), '[]'::jsonb) from public.athlete_payment_orders o)
  );
end;
$$;

grant execute on function public.list_athlete_admin_data() to authenticated;
