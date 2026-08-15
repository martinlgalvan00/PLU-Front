-- Tiempo activo y engagement — PLU ARG
--
-- `analytics_sessions.duration_seconds` es reloj de pared: `last_seen - started`.
-- Una pestaña abierta en segundo plano toda la tarde cuenta igual que una tarde
-- de lectura. Sobre datos reales del sitio eso daba 5m17s de permanencia media,
-- un numero que nadie deberia usar para decidir nada.
--
-- El mismo problema, del otro lado, en `is_bounce`: la condicion era
-- `page_count <= 1 and event_count <= 1`, y como el tracker emite scroll y
-- clicks por su cuenta, casi ninguna sesion calificaba. Daba 8% de rebote
-- cuando lo normal en una landing esta entre 40% y 70%. Las dos metricas se
-- leian bien y las dos estaban mal.
--
-- Esta migracion agrega la medicion honesta al lado de la vieja, sin borrar
-- nada:
--
--   * `active_seconds` — solo el tiempo con la pestaña visible, que el tracker
--     acumula por tramos y manda en el contexto del lote.
--   * `conversion_count` — conversiones de la sesion, que hasta ahora habia que
--     ir a buscar a `analytics_events`.
--   * `is_engaged` — el corte de GA4: 10s de atencion real, o dos paginas, o una
--     conversion. Columna generada: no puede desincronizarse de sus insumos.
--   * `is_quality` — el mismo corte sin el termino temporal. Existe porque
--     `active_seconds` vale 0 en todo lo ya registrado, y esta es la unica
--     lectura de calidad de sesion que se puede comparar contra el historico.
--
-- `duration_seconds` e `is_bounce` quedan donde estan. El informe deja de
-- apoyarse en ellas, pero borrarlas romperia los rollups ya consolidados.

-- ---------------------------------------------------------------------------
-- Sesiones: tiempo activo y cortes de engagement
-- ---------------------------------------------------------------------------

alter table public.analytics_sessions
  add column if not exists active_seconds integer not null default 0,
  add column if not exists conversion_count integer not null default 0;

alter table public.analytics_sessions
  drop constraint if exists analytics_sessions_active_seconds_check;
alter table public.analytics_sessions
  add constraint analytics_sessions_active_seconds_check
  check (active_seconds >= 0);

-- Generadas y no mantenidas por la aplicacion a proposito: son funcion pura de
-- columnas que ya viven en la fila, y calcularlas en la ingesta abriria la
-- puerta a que una sesion quede marcada con un criterio y otra con otro.
--
-- El umbral de 10 segundos es el de GA4. No es arbitrario: por debajo de eso no
-- se alcanza a leer un titulo, y la mayoria son rebotes de gente que se dio
-- cuenta de que el link no era lo que buscaba.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_sessions'
      and column_name = 'is_engaged'
  ) then
    alter table public.analytics_sessions
      add column is_engaged boolean
      generated always as (
        active_seconds >= 10 or page_count >= 2 or conversion_count >= 1
      ) stored;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'analytics_sessions'
      and column_name = 'is_quality'
  ) then
    alter table public.analytics_sessions
      add column is_quality boolean
      generated always as (page_count >= 2 or conversion_count >= 1) stored;
  end if;
end;
$$;

create index if not exists analytics_sessions_engaged_idx
  on public.analytics_sessions (organization_id, started_at desc)
  where is_engaged;

-- ---------------------------------------------------------------------------
-- Backfill de `conversion_count`
-- ---------------------------------------------------------------------------
--
-- Sin esto `is_quality` arranca subestimando: las conversiones ya registradas
-- viven en `analytics_events` y la columna nueva no las ve.

update public.analytics_sessions s
set conversion_count = c.total
from (
  select session_id, count(*) as total
  from public.analytics_events
  where event_type = 'conversion'
  group by session_id
) c
where c.session_id = s.id and s.conversion_count is distinct from c.total;

-- ---------------------------------------------------------------------------
-- Rollups diarios: tiempo activo y sesiones con engagement
-- ---------------------------------------------------------------------------

alter table public.analytics_daily_rollups
  add column if not exists avg_active_seconds integer,
  add column if not exists engaged_sessions integer not null default 0;

-- ---------------------------------------------------------------------------
-- Ingesta
-- ---------------------------------------------------------------------------

/**
 * Ingesta atomica de un lote de eventos.
 *
 * Cambia respecto de la version anterior en tres puntos:
 *
 *   1. Acepta `p_context->>'activeMs'`: el tiempo con la pestaña visible desde
 *      el lote previo, que se suma al acumulado de la sesion.
 *   2. Admite un lote sin eventos cuando trae tiempo activo. Es el caso de
 *      alguien que lee sin tocar nada: produce atencion y cero interaccion, y
 *      antes esa lectura no se registraba en ningun lado.
 *   3. Lleva `conversion_count`, que alimenta los cortes de engagement.
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
  v_conversions integer := 0;
  v_first_path text;
  v_last_path text;
  v_occurred timestamptz;
  v_events_length integer;
  v_active_seconds integer;
  v_duration integer;
begin
  if p_visitor_id is null or length(trim(p_visitor_id)) = 0 then
    raise exception 'PLU90 · visitante invalido' using errcode = '22023';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'PLU91 · lote de eventos invalido' using errcode = '22023';
  end if;

  v_events_length := jsonb_array_length(p_events);

  -- Techo por lote de tiempo activo: 15 minutos, holgado frente al latido de
  -- 30s del tracker. Acota tanto un reloj que salta como un cliente que quiera
  -- inflar la permanencia a mano.
  v_active_seconds := least(
    900,
    greatest(0, floor(coalesce((p_context->>'activeMs')::numeric, 0) / 1000)::integer)
  );

  -- Un lote vacio sin tiempo activo no aporta nada y no puede abrir sesion.
  if v_events_length = 0 and v_active_seconds = 0 then
    raise exception 'PLU91 · lote de eventos vacio' using errcode = '22023';
  end if;
  -- Techo duro: el endpoint ya valida, pero la RPC no puede confiar en eso.
  if v_events_length > 50 then
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
      -- La sesion arranca cuando la persona abrio la pagina, no cuando llego el
      -- primer lote. El tracker manda recien a los 10s, y anclar el inicio al
      -- momento de llegada dejaba `duration_seconds` en 0 justo cuando se aplica
      -- el tope de mas abajo: el tiempo activo del primer lote se descartaba
      -- entero, y cada lote siguiente quedaba corriendo uno de atraso.
      v_now - make_interval(secs => v_active_seconds),
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
      position_x, position_y, viewport_width, viewport_height,
      document_width, document_height, scroll_depth,
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
      nullif(v_event->>'documentWidth', '')::integer,
      nullif(v_event->>'documentHeight', '')::integer,
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
    elsif v_event->>'type' = 'conversion' then
      v_conversions := v_conversions + 1;
    end if;
  end loop;

  v_duration := greatest(0, extract(epoch from (v_now - v_session.started_at))::integer);

  update public.analytics_sessions
  set last_seen_at = v_now,
      exit_path = coalesce(v_last_path, exit_path),
      entry_path = coalesce(entry_path, v_first_path),
      page_count = page_count + v_pageviews,
      event_count = event_count + v_inserted,
      conversion_count = conversion_count + v_conversions,
      duration_seconds = v_duration,
      -- El tiempo activo no puede superar al reloj de pared. Sin este tope, un
      -- cliente con la hora corrida mostraria "3 minutos de atencion" en una
      -- sesion de 40 segundos y el informe entero perderia credibilidad.
      active_seconds = least(active_seconds + v_active_seconds, v_duration),
      -- Se conserva por compatibilidad con los rollups ya consolidados. El
      -- informe usa `is_engaged`.
      is_bounce = (page_count + v_pageviews) <= 1 and (event_count + v_inserted) <= 1
  where id = v_session.id
  returning * into v_session;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'accepted', v_inserted,
    'activeSeconds', v_session.active_seconds
  );
end;
$$;

revoke all on function public.ingest_analytics_events(text, jsonb, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.ingest_analytics_events(text, jsonb, uuid, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Resumen del panel
-- ---------------------------------------------------------------------------

/**
 * Totales del periodo + serie diaria.
 *
 * `bounceRate` pasa a ser `1 - engagementRate`, que es la definicion que usa
 * GA4 y la unica que se sostiene: la anterior contaba como "no rebote"
 * cualquier sesion donde el tracker hubiera emitido un scroll, o sea casi
 * todas.
 *
 * Se devuelven las dos duraciones. `avgActiveSeconds` es la que hay que mirar;
 * `avgDurationSeconds` queda porque la diferencia entre ambas es en si misma un
 * dato —cuanto de lo que se cuenta como visita es pestaña olvidada— y porque
 * sacarla de golpe dejaria el historico sin punto de comparacion.
 */
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

    -- Sesiones con atencion real: 10s visibles, o dos paginas, o una conversion.
    'engagedSessions', (select count(*) filter (where is_engaged) from sessions),
    'engagementRate', (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where is_engaged)::numeric / count(*), 4) end
      from sessions
    ),
    -- Mismo corte sin el termino temporal: es el unico comparable contra lo
    -- registrado antes de que existiera `active_seconds`.
    'qualitySessions', (select count(*) filter (where is_quality) from sessions),
    'qualityRate', (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where is_quality)::numeric / count(*), 4) end
      from sessions
    ),
    'bounceRate', (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where not is_engaged)::numeric / count(*), 4) end
      from sessions
    ),

    'avgActiveSeconds', (select coalesce(round(avg(active_seconds)), 0)::integer from sessions),
    'avgDurationSeconds', (select coalesce(round(avg(duration_seconds)), 0)::integer from sessions),
    -- Tiempo activo total del periodo, en minutos. Responde "cuanta atencion
    -- acumulo el sitio", que no es lo mismo que el promedio por sesion.
    'totalActiveMinutes', (select coalesce(round(sum(active_seconds) / 60.0), 0)::integer from sessions),

    'series', coalesce((
      select jsonb_agg(row_to_json(daily) order by daily.day)
      from (
        select
          date_trunc('day', s.started_at)::date as day,
          count(distinct s.visitor_id) as visitors,
          count(*) as sessions,
          count(*) filter (where s.is_engaged) as engaged,
          coalesce(round(avg(s.active_seconds)), 0)::integer as avg_active_seconds
        from sessions s
        group by 1
      ) daily
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(row_to_json(d) order by d.sessions desc)
      from (
        select
          coalesce(device_type, 'unknown') as device_type,
          count(*) as sessions,
          count(*) filter (where is_engaged) as engaged,
          coalesce(round(avg(active_seconds)), 0)::integer as avg_active_seconds
        from sessions group by 1
      ) d
    ), '[]'::jsonb),
    'referrers', coalesce((
      select jsonb_agg(row_to_json(r) order by r.sessions desc)
      from (
        select
          coalesce(referrer_host, 'directo') as referrer,
          count(*) as sessions,
          count(*) filter (where is_engaged) as engaged,
          coalesce(round(avg(active_seconds)), 0)::integer as avg_active_seconds
        from sessions group by 1 order by 2 desc limit 12
      ) r
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Embudo
-- ---------------------------------------------------------------------------

/**
 * Embudo por pasos.
 *
 * La version anterior encadenaba por visitante sobre la ventana entera, con
 * `min(occurred_at)` por paso. Sobre datos reales eso reportaba cero en
 * `payment_submitted` con dos pagos efectivamente registrados: un visitante que
 * paga, vuelve y reabre el checkout termina con su primer `checkout_opened`
 * posterior a su primer `payment_submitted`, la condicion de orden temporal
 * falla y el visitante desaparece del embudo desde ese paso en adelante.
 *
 * Ahora la cadena se evalua **dentro de cada sesion** y despues se cuentan
 * visitantes distintos entre las sesiones que si completaron el tramo. Dos
 * intentos separados dejan de pisarse, que era la causa real.
 *
 * Sigue exigiendo empezar por el paso 1 y no saltear ninguno. Eso es correcto
 * siempre que el paso 1 sea algo que toda sesion emite —ver `landing_view` en
 * `AnalyticsTracker.jsx`, que se dispara en la primera vista de cualquier
 * pagina y no solo en la portada; cuando dependia de la portada, el 39% de las
 * sesiones que entran directo desde Instagram a `/pitbull` o `/afiliacion`
 * quedaban fuera del embudo entero.
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
  with steps as (
    select step_name, idx
    from unnest(p_steps) with ordinality as t(step_name, idx)
  ),
  firsts as (
    select e.session_id, e.visitor_id, s.idx, min(e.occurred_at) as at
    from public.analytics_events e
    join steps s on s.step_name = e.name
    where e.organization_id = p_organization_id
      and e.occurred_at >= p_from and e.occurred_at < p_to
    group by e.session_id, e.visitor_id, s.idx
  ),
  ordered as (
    select
      session_id,
      visitor_id,
      idx,
      at,
      lag(idx) over (partition by session_id order by idx) as prev_idx,
      lag(at) over (partition by session_id order by idx) as prev_at
    from firsts
  ),
  -- `ok` se mantiene verdadero mientras la cadena no se corte: arranca en el
  -- paso 1, sin saltearse pasos y sin retroceder en el tiempo.
  chain as (
    select
      session_id,
      visitor_id,
      idx,
      bool_and(
        case
          when prev_idx is null then idx = 1
          else idx = prev_idx + 1 and at >= prev_at
        end
      ) over (
        partition by session_id
        order by idx
        rows between unbounded preceding and current row
      ) as ok
    from ordered
  ),
  reached as (
    select idx, count(distinct visitor_id) as visitors, count(distinct session_id) as sessions
    from chain
    where ok
    group by idx
  )
  select coalesce(jsonb_agg(row_to_json(s) order by s.step_index), '[]'::jsonb)
  from (
    select
      steps.idx as step_index,
      steps.step_name,
      coalesce(reached.visitors, 0) as visitors,
      coalesce(reached.sessions, 0) as sessions
    from steps
    left join reached on reached.idx = steps.idx
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- Consolidacion diaria
-- ---------------------------------------------------------------------------

/**
 * Rollup diario por ruta. Suma tiempo activo medio y sesiones con engagement,
 * para que la serie historica sobreviva a la purga de los 90 dias con las
 * metricas nuevas y no solo con las viejas.
 */
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
    clicks, conversions, bounces, avg_scroll_depth, avg_duration_seconds,
    avg_active_seconds, engaged_sessions, updated_at
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
        and not s.is_engaged
        and s.entry_path = e.path
        and s.started_at >= v_from and s.started_at < v_to),
    round(avg(e.scroll_depth) filter (where e.scroll_depth is not null), 3),
    (select coalesce(round(avg(s.duration_seconds)), 0)::integer
      from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.entry_path = e.path
        and s.started_at >= v_from and s.started_at < v_to),
    (select coalesce(round(avg(s.active_seconds)), 0)::integer
      from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.entry_path = e.path
        and s.started_at >= v_from and s.started_at < v_to),
    (select count(*)
      from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.is_engaged
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
    avg_active_seconds = excluded.avg_active_seconds,
    engaged_sessions = excluded.engaged_sessions,
    updated_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.rollup_analytics_daily(date) from public, anon, authenticated;
grant execute on function public.rollup_analytics_daily(date) to service_role;
