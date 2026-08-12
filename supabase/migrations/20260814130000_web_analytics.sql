-- Analitica web con identidad vinculada — PLU ARG
--
-- El panel ya tenia auditoria operativa (`operational_audit_events`): quien
-- cobro, quien activo una afiliacion, que webhook fallo. Eso responde "que paso
-- en el sistema", no "que hizo la gente en el sitio". Faltaba lo segundo:
-- cuanta gente entra, por donde navega, donde clickea y donde abandona el
-- embudo de afiliacion.
--
-- Deliberadamente NO se reusan `domain_audit_logs` ni `operational_event_logs`.
-- Esas tablas son de bajo volumen y alto valor por fila (pagos, credenciales) y
-- se consultan en cada apertura del panel; mezclarles millones de pageviews
-- degradaria justo la bitacora que sostiene los reclamos de dinero. Dominio
-- separado, mismo panel.
--
-- Modelo de identidad: los eventos se vinculan al atleta cuando hay sesion.
-- Eso convierte esta tabla en datos personales, con dos consecuencias que la
-- migracion implementa y no deja libradas a la aplicacion:
--   1. Purga automatica del detalle crudo a los 90 dias (los agregados diarios
--      quedan para siempre, ya anonimizados por construccion).
--   2. Borrado en cascada real al eliminar un atleta (derecho de supresion).
--
-- No se almacena la IP cruda en ningun momento: entra a un hash con sal diaria
-- para derivar el visitante y se descarta. Da visitantes unicos sin conservar
-- el identificador de red.

-- ---------------------------------------------------------------------------
-- Sesiones
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,

  -- Hash rotativo por dia. Identifica un visitante dentro de la jornada sin
  -- guardar la IP: al cambiar la sal ya no se puede recorrelacionar historico.
  visitor_id text not null,
  -- Solo cuando hay cookie de atleta valida. La sesion arranca anonima y se
  -- "asciende" al loguearse, sin perder los eventos previos.
  athlete_id uuid references public.athletes(id) on delete cascade,

  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  entry_path text,
  exit_path text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,

  device_type text check (device_type in ('desktop', 'tablet', 'mobile', 'bot', 'unknown')),
  browser text,
  os text,
  viewport_width integer check (viewport_width between 0 and 20000),
  viewport_height integer check (viewport_height between 0 and 20000),
  language text,
  country text,

  page_count integer not null default 0,
  event_count integer not null default 0,
  -- Se recalcula en cada ingesta: last_seen_at - started_at.
  duration_seconds integer not null default 0,
  -- Una sesion de una sola pagina y sin interaccion posterior.
  is_bounce boolean not null default true,

  created_at timestamptz not null default now(),

  unique (organization_id, visitor_id, started_at)
);

create index if not exists analytics_sessions_org_started_idx
  on public.analytics_sessions (organization_id, started_at desc);
create index if not exists analytics_sessions_visitor_idx
  on public.analytics_sessions (organization_id, visitor_id, last_seen_at desc);
create index if not exists analytics_sessions_athlete_idx
  on public.analytics_sessions (organization_id, athlete_id, started_at desc)
  where athlete_id is not null;

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,

  session_id uuid not null references public.analytics_sessions(id) on delete cascade,
  visitor_id text not null,
  athlete_id uuid references public.athletes(id) on delete cascade,

  event_type text not null check (event_type in (
    'pageview', 'click', 'scroll', 'form_start', 'form_submit', 'form_error',
    'conversion', 'search', 'outbound', 'error', 'custom'
  )),

  -- Ruta normalizada (sin querystring ni ids): '/eventos/:slug', no
  -- '/eventos/pitbull-classic?utm=x'. Sin esto el top de paginas se atomiza en
  -- una fila por id y deja de agrupar.
  path text not null,
  -- El nombre de la ruta de React Router cuando esta disponible.
  route text,
  title text,

  -- Interaccion. `element_selector` es un selector corto y estable; nunca el
  -- valor de un input.
  element_selector text,
  element_text text,
  -- Coordenadas normalizadas 0..1 sobre el ancho/alto del documento. Guardarlas
  -- en pixeles haria que el heatmap solo sirva para el viewport que las genero.
  position_x numeric(6, 5) check (position_x between 0 and 1),
  position_y numeric(6, 5) check (position_y between 0 and 1),
  viewport_width integer check (viewport_width between 0 and 20000),
  viewport_height integer check (viewport_height between 0 and 20000),
  scroll_depth numeric(4, 3) check (scroll_depth between 0 and 1),

  -- Nombre de negocio del evento: 'membership_checkout_opened',
  -- 'registration_submitted'. Es lo que sostiene el embudo.
  name text,
  value numeric(14, 2),
  metadata jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_org_occurred_idx
  on public.analytics_events (organization_id, occurred_at desc);
create index if not exists analytics_events_session_idx
  on public.analytics_events (session_id, occurred_at);
create index if not exists analytics_events_path_idx
  on public.analytics_events (organization_id, path, occurred_at desc);
create index if not exists analytics_events_type_idx
  on public.analytics_events (organization_id, event_type, occurred_at desc);
create index if not exists analytics_events_name_idx
  on public.analytics_events (organization_id, name, occurred_at desc)
  where name is not null;
create index if not exists analytics_events_athlete_idx
  on public.analytics_events (organization_id, athlete_id, occurred_at desc)
  where athlete_id is not null;
-- Heatmap: solo clicks con coordenadas, filtrados por ruta.
create index if not exists analytics_events_heatmap_idx
  on public.analytics_events (organization_id, path, occurred_at desc)
  where event_type = 'click' and position_x is not null;

-- ---------------------------------------------------------------------------
-- Agregados diarios (perpetuos)
-- ---------------------------------------------------------------------------
--
-- El detalle crudo se purga a los 90 dias; la serie historica vive aca. Ya es
-- anonima por construccion: son conteos por dia y ruta, sin visitante.

create table if not exists public.analytics_daily_rollups (
  organization_id uuid not null
    references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,
  day date not null,
  path text not null,

  pageviews integer not null default 0,
  unique_visitors integer not null default 0,
  sessions integer not null default 0,
  clicks integer not null default 0,
  conversions integer not null default 0,
  bounces integer not null default 0,
  avg_scroll_depth numeric(4, 3),
  avg_duration_seconds integer,

  updated_at timestamptz not null default now(),

  primary key (organization_id, day, path)
);

create index if not exists analytics_daily_rollups_day_idx
  on public.analytics_daily_rollups (organization_id, day desc);

-- ---------------------------------------------------------------------------
-- Cierre de acceso
-- ---------------------------------------------------------------------------
--
-- Nadie llega a estas tablas desde el navegador. La ingesta entra por Express
-- con `service_role` despues de validar y normalizar; la lectura del panel pasa
-- por RPC agregadas. `anon` no puede insertar ni leer: si pudiera insertar,
-- cualquiera falsearia las metricas a mano.

alter table public.analytics_sessions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_daily_rollups enable row level security;

revoke all on public.analytics_sessions from public, anon, authenticated;
revoke all on public.analytics_events from public, anon, authenticated;
revoke all on public.analytics_daily_rollups from public, anon, authenticated;

grant select, insert, update, delete on public.analytics_sessions to service_role;
grant select, insert, update, delete on public.analytics_events to service_role;
grant select, insert, update, delete on public.analytics_daily_rollups to service_role;

-- ---------------------------------------------------------------------------
-- Ingesta
-- ---------------------------------------------------------------------------

/**
 * Ingesta atomica de un lote de eventos.
 *
 * Un lote entero por request: el tracker acumula en el cliente y descarga con
 * sendBeacon. Una fila por request haria una llamada HTTP por click.
 *
 * La sesion se resuelve (o se crea) por `p_visitor_id` + ventana de inactividad
 * de 30 minutos, el estandar de la industria. Devolver el id permite al cliente
 * mantener continuidad sin cookie propia.
 */
create or replace function public.ingest_analytics_events(
  p_visitor_id text,
  p_events jsonb,
  p_athlete_id uuid default null,
  p_context jsonb default '{}'::jsonb,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.analytics_sessions;
  v_event jsonb;
  v_now timestamptz := now();
  v_inserted integer := 0;
  v_pageviews integer := 0;
  v_first_path text;
  v_last_path text;
  v_occurred timestamptz;
begin
  if p_visitor_id is null or length(trim(p_visitor_id)) = 0 then
    raise exception 'PLU90 · visitante invalido' using errcode = '22023';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'PLU91 · lote de eventos vacio' using errcode = '22023';
  end if;
  -- Techo duro: el endpoint ya valida, pero la RPC no puede confiar en eso.
  if jsonb_array_length(p_events) > 50 then
    raise exception 'PLU92 · lote demasiado grande' using errcode = '22023';
  end if;

  -- Sesion vigente = mismo visitante con actividad en los ultimos 30 minutos.
  select * into v_session
  from public.analytics_sessions
  where organization_id = p_organization_id
    and visitor_id = p_visitor_id
    and last_seen_at > v_now - interval '30 minutes'
  order by last_seen_at desc
  limit 1;

  if v_session.id is null then
    insert into public.analytics_sessions (
      organization_id, visitor_id, athlete_id, started_at, last_seen_at,
      entry_path, referrer_host, utm_source, utm_medium, utm_campaign,
      device_type, browser, os, viewport_width, viewport_height, language, country
    ) values (
      p_organization_id,
      p_visitor_id,
      p_athlete_id,
      v_now,
      v_now,
      nullif(p_context->>'path', ''),
      nullif(p_context->>'referrerHost', ''),
      nullif(p_context->>'utmSource', ''),
      nullif(p_context->>'utmMedium', ''),
      nullif(p_context->>'utmCampaign', ''),
      coalesce(nullif(p_context->>'deviceType', ''), 'unknown'),
      nullif(p_context->>'browser', ''),
      nullif(p_context->>'os', ''),
      nullif(p_context->>'viewportWidth', '')::integer,
      nullif(p_context->>'viewportHeight', '')::integer,
      nullif(p_context->>'language', ''),
      nullif(p_context->>'country', '')
    )
    returning * into v_session;
  elsif p_athlete_id is not null and v_session.athlete_id is distinct from p_athlete_id then
    -- La sesion arranco anonima y la persona se logueo a mitad de camino: se
    -- vincula hacia atras para no partir el recorrido en dos.
    update public.analytics_sessions
    set athlete_id = p_athlete_id
    where id = v_session.id
    returning * into v_session;

    update public.analytics_events
    set athlete_id = p_athlete_id
    where session_id = v_session.id and athlete_id is null;
  end if;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    -- Un evento con timestamp del cliente no puede quedar en el futuro ni
    -- reescribir el pasado remoto: se acota a la ventana de la sesion.
    v_occurred := coalesce((v_event->>'occurredAt')::timestamptz, v_now);
    if v_occurred > v_now or v_occurred < v_now - interval '6 hours' then
      v_occurred := v_now;
    end if;

    insert into public.analytics_events (
      organization_id, session_id, visitor_id, athlete_id, event_type,
      path, route, title, element_selector, element_text,
      position_x, position_y, viewport_width, viewport_height, scroll_depth,
      name, value, metadata, occurred_at
    ) values (
      p_organization_id,
      v_session.id,
      p_visitor_id,
      coalesce(p_athlete_id, v_session.athlete_id),
      v_event->>'type',
      coalesce(nullif(v_event->>'path', ''), '/'),
      nullif(v_event->>'route', ''),
      left(nullif(v_event->>'title', ''), 200),
      left(nullif(v_event->>'selector', ''), 300),
      left(nullif(v_event->>'text', ''), 120),
      nullif(v_event->>'x', '')::numeric,
      nullif(v_event->>'y', '')::numeric,
      nullif(v_event->>'viewportWidth', '')::integer,
      nullif(v_event->>'viewportHeight', '')::integer,
      nullif(v_event->>'scrollDepth', '')::numeric,
      left(nullif(v_event->>'name', ''), 80),
      nullif(v_event->>'value', '')::numeric,
      coalesce(v_event->'metadata', '{}'::jsonb),
      v_occurred
    );

    v_inserted := v_inserted + 1;
    if v_event->>'type' = 'pageview' then
      v_pageviews := v_pageviews + 1;
      if v_first_path is null then v_first_path := v_event->>'path'; end if;
      v_last_path := v_event->>'path';
    end if;
  end loop;

  update public.analytics_sessions
  set last_seen_at = v_now,
      exit_path = coalesce(v_last_path, exit_path),
      entry_path = coalesce(entry_path, v_first_path),
      page_count = page_count + v_pageviews,
      event_count = event_count + v_inserted,
      duration_seconds = greatest(0, extract(epoch from (v_now - started_at))::integer),
      -- Deja de ser rebote apenas hay una segunda pagina o una interaccion real.
      is_bounce = (page_count + v_pageviews) <= 1 and (event_count + v_inserted) <= 1
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'accepted', v_inserted
  );
end;
$$;

revoke all on function public.ingest_analytics_events(text, jsonb, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.ingest_analytics_events(text, jsonb, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Lectura del panel
-- ---------------------------------------------------------------------------

/** Totales del periodo + serie diaria, en una sola ida. */
create or replace function public.get_analytics_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with sessions as (
    select * from public.analytics_sessions
    where organization_id = p_organization_id and started_at >= p_from and started_at < p_to
  ),
  events as (
    select * from public.analytics_events
    where organization_id = p_organization_id and occurred_at >= p_from and occurred_at < p_to
  )
  select jsonb_build_object(
    'visitors', (select count(distinct visitor_id) from sessions),
    'sessions', (select count(*) from sessions),
    'pageviews', (select count(*) from events where event_type = 'pageview'),
    'interactions', (select count(*) from events where event_type in ('click', 'form_submit', 'search')),
    'conversions', (select count(*) from events where event_type = 'conversion'),
    'identifiedVisitors', (select count(distinct athlete_id) from sessions where athlete_id is not null),
    'bounceRate', (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where is_bounce)::numeric / count(*), 4) end
      from sessions
    ),
    'avgDurationSeconds', (select coalesce(round(avg(duration_seconds)), 0)::integer from sessions),
    'series', coalesce((
      select jsonb_agg(row_to_json(daily) order by daily.day)
      from (
        select
          date_trunc('day', s.started_at)::date as day,
          count(distinct s.visitor_id) as visitors,
          count(*) as sessions
        from sessions s
        group by 1
      ) daily
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(row_to_json(d) order by d.sessions desc)
      from (
        select coalesce(device_type, 'unknown') as device_type, count(*) as sessions
        from sessions group by 1
      ) d
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(row_to_json(r) order by r.sessions desc)
      from (
        select coalesce(referrer_host, 'directo') as referrer, count(*) as sessions
        from sessions group by 1 order by 2 desc limit 12
      ) r
    ), '[]'::jsonb)
  );
$$;

/** Top de paginas con visitantes unicos, scroll medio y salidas. */
create or replace function public.get_analytics_pages(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 25,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(p) order by p.pageviews desc), '[]'::jsonb)
  from (
    select
      e.path,
      count(*) filter (where e.event_type = 'pageview') as pageviews,
      count(distinct e.visitor_id) as visitors,
      count(*) filter (where e.event_type = 'click') as clicks,
      round(avg(e.scroll_depth) filter (where e.scroll_depth is not null), 3) as avg_scroll_depth,
      (select count(*) from public.analytics_sessions s
        where s.organization_id = p_organization_id
          and s.exit_path = e.path
          and s.started_at >= p_from and s.started_at < p_to) as exits
    from public.analytics_events e
    where e.organization_id = p_organization_id
      and e.occurred_at >= p_from and e.occurred_at < p_to
    group by e.path
    having count(*) filter (where e.event_type = 'pageview') > 0
    order by pageviews desc
    limit greatest(1, least(p_limit, 100))
  ) p;
$$;

/**
 * Recorridos: pares pagina -> pagina siguiente dentro de la misma sesion.
 * Es lo que permite leer "de donde vienen y a donde se van" sin exportar el
 * detalle crudo.
 */
create or replace function public.get_analytics_flows(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 30,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with steps as (
    select
      session_id,
      path,
      lead(path) over (partition by session_id order by occurred_at) as next_path
    from public.analytics_events
    where organization_id = p_organization_id
      and event_type = 'pageview'
      and occurred_at >= p_from and occurred_at < p_to
  )
  select coalesce(jsonb_agg(row_to_json(f) order by f.transitions desc), '[]'::jsonb)
  from (
    select path as from_path, next_path as to_path, count(*) as transitions
    from steps
    where next_path is not null and next_path <> path
    group by 1, 2
    order by 3 desc
    limit greatest(1, least(p_limit, 100))
  ) f;
$$;

/**
 * Mapa de calor de una ruta: clicks agrupados en una grilla de 40x40 sobre
 * coordenadas normalizadas. Se agrega en Postgres y no en el navegador porque
 * mandar cada click suelto al panel no escala pasadas unas miles de filas.
 */
create or replace function public.get_analytics_heatmap(
  p_path text,
  p_from timestamptz,
  p_to timestamptz,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cells as (
    select
      least(39, floor(position_x * 40))::integer as cell_x,
      least(39, floor(position_y * 40))::integer as cell_y,
      count(*) as weight
    from public.analytics_events
    where organization_id = p_organization_id
      and path = p_path
      and event_type = 'click'
      and position_x is not null
      and position_y is not null
      and occurred_at >= p_from and occurred_at < p_to
    group by 1, 2
  )
  select jsonb_build_object(
    'path', p_path,
    'grid', 40,
    'total', coalesce((select sum(weight) from cells), 0),
    'max', coalesce((select max(weight) from cells), 0),
    'cells', coalesce((select jsonb_agg(row_to_json(c)) from cells c), '[]'::jsonb),
    'elements', coalesce((
      select jsonb_agg(row_to_json(el) order by el.clicks desc)
      from (
        select element_selector, max(element_text) as label, count(*) as clicks
        from public.analytics_events
        where organization_id = p_organization_id
          and path = p_path
          and event_type = 'click'
          and element_selector is not null
          and occurred_at >= p_from and occurred_at < p_to
        group by element_selector
        order by clicks desc
        limit 20
      ) el
    ), '[]'::jsonb)
  );
$$;

/**
 * Embudo por nombre de evento. Recibe la lista ordenada de pasos y devuelve
 * cuantos visitantes unicos alcanzaron cada uno, respetando el orden temporal.
 */
create or replace function public.get_analytics_funnel(
  p_steps text[],
  p_from timestamptz,
  p_to timestamptz,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(s) order by s.step_index), '[]'::jsonb)
  from (
    select
      idx as step_index,
      step_name,
      (
        select count(distinct e.visitor_id)
        from public.analytics_events e
        where e.organization_id = p_organization_id
          and e.name = step_name
          and e.occurred_at >= p_from and e.occurred_at < p_to
      ) as visitors
    from unnest(p_steps) with ordinality as t(step_name, idx)
  ) s;
$$;

revoke all on function public.get_analytics_overview(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_analytics_pages(timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_analytics_flows(timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.get_analytics_heatmap(text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_analytics_funnel(text[], timestamptz, timestamptz, uuid) from public, anon, authenticated;

grant execute on function public.get_analytics_overview(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.get_analytics_pages(timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.get_analytics_flows(timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.get_analytics_heatmap(text, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.get_analytics_funnel(text[], timestamptz, timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Rollup y retencion
-- ---------------------------------------------------------------------------

/** Consolida un dia en `analytics_daily_rollups`. Idempotente. */
create or replace function public.rollup_analytics_daily(p_day date default (current_date - 1))
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
  v_from timestamptz := p_day::timestamptz;
  v_to timestamptz := (p_day + 1)::timestamptz;
begin
  insert into public.analytics_daily_rollups as r (
    organization_id, day, path, pageviews, unique_visitors, sessions,
    clicks, conversions, bounces, avg_scroll_depth, avg_duration_seconds, updated_at
  )
  select
    e.organization_id,
    p_day,
    e.path,
    count(*) filter (where e.event_type = 'pageview'),
    count(distinct e.visitor_id),
    count(distinct e.session_id),
    count(*) filter (where e.event_type = 'click'),
    count(*) filter (where e.event_type = 'conversion'),
    (select count(*) from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.is_bounce
        and s.entry_path = e.path
        and s.started_at >= v_from and s.started_at < v_to),
    round(avg(e.scroll_depth) filter (where e.scroll_depth is not null), 3),
    (select coalesce(round(avg(s.duration_seconds)), 0)::integer
      from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.entry_path = e.path
        and s.started_at >= v_from and s.started_at < v_to),
    now()
  from public.analytics_events e
  where e.occurred_at >= v_from and e.occurred_at < v_to
  group by e.organization_id, e.path
  on conflict (organization_id, day, path) do update set
    pageviews = excluded.pageviews,
    unique_visitors = excluded.unique_visitors,
    sessions = excluded.sessions,
    clicks = excluded.clicks,
    conversions = excluded.conversions,
    bounces = excluded.bounces,
    avg_scroll_depth = excluded.avg_scroll_depth,
    avg_duration_seconds = excluded.avg_duration_seconds,
    updated_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

/**
 * Purga del detalle crudo. Antes de borrar consolida cualquier dia sin rollup,
 * para que acortar la retencion nunca implique perder la serie historica.
 */
create or replace function public.purge_analytics_raw(p_retention_days integer default 90)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(7, p_retention_days));
  v_day date;
  v_events integer := 0;
  v_sessions integer := 0;
begin
  for v_day in
    select distinct date_trunc('day', occurred_at)::date
    from public.analytics_events
    where occurred_at < v_cutoff
    order by 1
  loop
    perform public.rollup_analytics_daily(v_day);
  end loop;

  delete from public.analytics_events where occurred_at < v_cutoff;
  get diagnostics v_events = row_count;

  -- Las sesiones se van cuando ya no les queda ningun evento.
  delete from public.analytics_sessions s
  where s.last_seen_at < v_cutoff
    and not exists (select 1 from public.analytics_events e where e.session_id = s.id);
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'deletedEvents', v_events,
    'deletedSessions', v_sessions
  );
end;
$$;

revoke all on function public.rollup_analytics_daily(date) from public, anon, authenticated;
revoke all on function public.purge_analytics_raw(integer) from public, anon, authenticated;
grant execute on function public.rollup_analytics_daily(date) to service_role;
grant execute on function public.purge_analytics_raw(integer) to service_role;

-- Rollup del dia anterior y purga, todas las noches. `pg_cron` ya lo usa
-- `20260724000000_domain_maintenance_cron.sql` para el mantenimiento de
-- reservas, asi que la extension esta disponible.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('plu-analytics-nightly')
    where exists (select 1 from cron.job where jobname = 'plu-analytics-nightly');

    perform cron.schedule(
      'plu-analytics-nightly',
      '20 4 * * *',
      $cron$
        select public.rollup_analytics_daily(current_date - 1);
        select public.purge_analytics_raw(90);
      $cron$
    );
  end if;
end;
$$;
