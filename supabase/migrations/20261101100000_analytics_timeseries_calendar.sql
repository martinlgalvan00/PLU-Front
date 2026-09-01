-- ===========================================================================
-- Serie diaria perpetua, pico historico y resumen de tablero
-- ===========================================================================
--
-- El informe ya devolvia una serie diaria, pero la calculaba sobre
-- `analytics_sessions`, que se purga a los 90 dias: pasado ese horizonte el
-- grafico quedaba vacio aunque `analytics_daily_rollups` conservara la historia.
--
-- El rollup diario consolida por (dia, ruta), y sumar `unique_visitors` de
-- varias rutas sobreestima a la gente —una persona que navega tres paginas
-- cuenta tres veces--. Para tener el total exacto del dia, el rollup pasa a
-- escribir ademas una fila sintetica por organizacion con path = '__site__':
-- visitantes distintos del dia completo, sesiones, paginas vistas y
-- engagement, calculados igual que en el informe en vivo.
--
-- Convencion: '__site__' no empieza con '/', asi que ninguna ruta normalizada
-- por el servidor puede colisionar con ella. Toda lectura de rollups que no
-- quiera el total debe excluir esta fila de forma explicita.

-- ---------------------------------------------------------------------------
-- Backfill de la fila '__site__' para los dias ya registrados
-- ---------------------------------------------------------------------------

insert into public.analytics_daily_rollups as r (
  organization_id, day, path, pageviews, unique_visitors, sessions,
  clicks, conversions, bounces, avg_scroll_depth, avg_duration_seconds,
  avg_active_seconds, engaged_sessions, updated_at
)
select
  e.organization_id,
  e.day,
  '__site__',
  count(*) filter (where e.event_type = 'pageview'),
  count(distinct e.visitor_id),
  count(distinct e.session_id),
  count(*) filter (where e.event_type = 'click'),
  count(*) filter (where e.event_type = 'conversion'),
  (select count(*) from public.analytics_sessions s
    where s.organization_id = e.organization_id
      and not s.is_engaged
      and s.started_at::date = e.day),
  round(avg(e.scroll_depth) filter (where e.scroll_depth is not null), 3),
  (select coalesce(round(avg(s.duration_seconds)), 0)::integer
    from public.analytics_sessions s
    where s.organization_id = e.organization_id
      and s.started_at::date = e.day),
  (select coalesce(round(avg(s.active_seconds)), 0)::integer
    from public.analytics_sessions s
    where s.organization_id = e.organization_id
      and s.started_at::date = e.day),
  (select count(*) from public.analytics_sessions s
    where s.organization_id = e.organization_id
      and s.is_engaged
      and s.started_at::date = e.day),
  now()
from (
  select organization_id, visitor_id, session_id, event_type, scroll_depth,
    occurred_at::date as day
  from public.analytics_events
  where occurred_at < current_date
) e
group by e.organization_id, e.day
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

-- ---------------------------------------------------------------------------
-- Rollup diario: consolidar tambien el total del dia
-- ---------------------------------------------------------------------------

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

  -- Total exacto del dia. Sumar la fila por ruta sirve para paginas vistas o
  -- clicks, pero no para visitantes: hay que contar personas distintas sobre
  -- el dia completo, no por ruta y despues sumar.
  insert into public.analytics_daily_rollups as r (
    organization_id, day, path, pageviews, unique_visitors, sessions,
    clicks, conversions, bounces, avg_scroll_depth, avg_duration_seconds,
    avg_active_seconds, engaged_sessions, updated_at
  )
  select
    e.organization_id,
    p_day,
    '__site__',
    count(*) filter (where e.event_type = 'pageview'),
    count(distinct e.visitor_id),
    count(distinct e.session_id),
    count(*) filter (where e.event_type = 'click'),
    count(*) filter (where e.event_type = 'conversion'),
    (select count(*) from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and not s.is_engaged
        and s.started_at >= v_from and s.started_at < v_to),
    round(avg(e.scroll_depth) filter (where e.scroll_depth is not null), 3),
    (select coalesce(round(avg(s.duration_seconds)), 0)::integer
      from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.started_at >= v_from and s.started_at < v_to),
    (select coalesce(round(avg(s.active_seconds)), 0)::integer
      from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.started_at >= v_from and s.started_at < v_to),
    (select count(*) from public.analytics_sessions s
      where s.organization_id = e.organization_id
        and s.is_engaged
        and s.started_at >= v_from and s.started_at < v_to),
    now()
  from public.analytics_events e
  where e.occurred_at >= v_from and e.occurred_at < v_to
  group by e.organization_id
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

-- ---------------------------------------------------------------------------
-- Serie diaria perpetua con pico historico
-- ---------------------------------------------------------------------------

/**
 * Serie diaria del sitio completo entre dos fechas.
 *
 * Los dias cerrados salen de la fila '__site__' de los rollups, que sobrevive
 * a la purga del detalle. El dia en curso no esta consolidado todavia, asi que
 * se calcula en vivo desde sesiones y eventos, con la misma semantica que el
 * resto del informe. La serie es densa: los dias sin trafico vienen en cero
 * para que el grafico y el calendario no necesiten rellenar huecos.
 *
 * `peak` es el dia con mas visitantes distintos de toda la historia
 * registrada, incluyendo el de hoy en curso: si el record se esta rompiendo
 * ahora, el panel tiene que poder decirlo.
 */
create or replace function public.get_analytics_timeseries(
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
  with bounds as (
    select
      p_from::date as first_day,
      least(p_to::date, current_date) as last_day
  ),
  today_sessions as (
    select
      count(distinct visitor_id) as visitors,
      count(*) as sessions,
      count(*) filter (where is_engaged) as engaged_sessions,
      coalesce(round(avg(active_seconds)), 0)::integer as avg_active_seconds
    from public.analytics_sessions
    where organization_id = p_organization_id
      and started_at >= current_date::timestamptz
  ),
  today_events as (
    select
      count(*) filter (where event_type = 'pageview') as pageviews
    from public.analytics_events
    where organization_id = p_organization_id
      and occurred_at >= current_date::timestamptz
  ),
  closed_days as (
    select
      g.day::date as day,
      coalesce(r.unique_visitors, 0) as visitors,
      coalesce(r.pageviews, 0) as pageviews,
      coalesce(r.sessions, 0) as sessions,
      coalesce(r.engaged_sessions, 0) as engaged_sessions,
      coalesce(r.avg_active_seconds, 0) as avg_active_seconds
    from bounds b
    cross join generate_series(b.first_day, b.last_day, interval '1 day') as g(day)
    left join public.analytics_daily_rollups r
      on r.organization_id = p_organization_id
      and r.day = g.day::date
      and r.path = '__site__'
    where g.day::date < current_date
  ),
  series as (
    select * from closed_days
    union all
    select
      current_date as day,
      coalesce(t.visitors, 0) as visitors,
      coalesce(e.pageviews, 0) as pageviews,
      coalesce(t.sessions, 0) as sessions,
      coalesce(t.engaged_sessions, 0) as engaged_sessions,
      coalesce(t.avg_active_seconds, 0) as avg_active_seconds
    from today_sessions t
    cross join today_events e
    where (select last_day from bounds) = current_date
  ),
  history_peak as (
    select
      day,
      unique_visitors as visitors,
      pageviews,
      sessions
    from public.analytics_daily_rollups
    where organization_id = p_organization_id
      and path = '__site__'
      and day < current_date
    order by unique_visitors desc, day desc
    limit 1
  ),
  peak as (
    select day, visitors, pageviews, sessions from history_peak
    union all
    select
      current_date,
      coalesce(t.visitors, 0),
      coalesce(e.pageviews, 0),
      coalesce(t.sessions, 0)
    from today_sessions t
    cross join today_events e
    where (select last_day from bounds) = current_date
    order by visitors desc, day desc
    limit 1
  ),
  first_tracked as (
    select min(day)::date as day
    from public.analytics_daily_rollups
    where organization_id = p_organization_id and path = '__site__'
  )
  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day', to_char(s.day, 'YYYY-MM-DD'),
          'visitors', s.visitors,
          'pageviews', s.pageviews,
          'sessions', s.sessions,
          'engagedSessions', s.engaged_sessions,
          'avgActiveSeconds', s.avg_active_seconds
        ) order by s.day
      )
      from series s
    ), '[]'::jsonb),
    'peak', (
      select case when p.day is null then null else jsonb_build_object(
        'day', to_char(p.day, 'YYYY-MM-DD'),
        'visitors', p.visitors,
        'pageviews', p.pageviews,
        'sessions', p.sessions
      ) end
      from peak p
    ),
    'firstDay', (select to_char(day, 'YYYY-MM-DD') from first_tracked)
  );
$$;

-- ---------------------------------------------------------------------------
-- Resumen de trafico para el tablero principal
-- ---------------------------------------------------------------------------

/**
 * Numeros que el Dashboard necesita de un vistazo: hoy, ayer, la semana que
 * corre contra la anterior, y el record historico.
 *
 * Todo lo reciente se lee del detalle vivo (la purga es a 90 dias, y una
 * ventana de 14 dias siempre entra); el pico consultan los rollups perpetuos.
 * `last7` cuenta personas distintas en el tramo, no la suma de los dias: la
 * misma persona que entro lunes y jueves es una sola.
 */
create or replace function public.get_analytics_dashboard_summary(
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'today', (
      select jsonb_build_object(
        'visitors', coalesce(t.visitors, 0),
        'pageviews', coalesce(e.pageviews, 0),
        'sessions', coalesce(t.sessions, 0)
      )
      from (
        select count(distinct visitor_id) as visitors, count(*) as sessions
        from public.analytics_sessions
        where organization_id = p_organization_id
          and started_at >= current_date::timestamptz
      ) t
      cross join (
        select count(*) filter (where event_type = 'pageview') as pageviews
        from public.analytics_events
        where organization_id = p_organization_id
          and occurred_at >= current_date::timestamptz
      ) e
    ),
    'yesterday', (
      select jsonb_build_object(
        'visitors', count(distinct visitor_id),
        'pageviews', (select count(*) from public.analytics_events e2
          where e2.organization_id = p_organization_id
            and e2.event_type = 'pageview'
            and e2.occurred_at >= current_date - 1
            and e2.occurred_at < current_date),
        'sessions', count(*)
      )
      from public.analytics_sessions
      where organization_id = p_organization_id
        and started_at >= current_date - 1
        and started_at < current_date
    ),
    'last7', (
      select jsonb_build_object(
        'visitors', count(distinct visitor_id),
        'pageviews', (select count(*) from public.analytics_events e3
          where e3.organization_id = p_organization_id
            and e3.event_type = 'pageview'
            and e3.occurred_at >= current_date - 6),
        'sessions', count(*)
      )
      from public.analytics_sessions
      where organization_id = p_organization_id
        and started_at >= current_date - 6
    ),
    'previous7', (
      select jsonb_build_object(
        'visitors', count(distinct visitor_id),
        'sessions', count(*)
      )
      from public.analytics_sessions
      where organization_id = p_organization_id
        and started_at >= current_date - 13
        and started_at < current_date - 6
    ),
    'peak', (
      select case when p.day is null then null else jsonb_build_object(
        'day', to_char(p.day, 'YYYY-MM-DD'),
        'visitors', p.unique_visitors,
        'pageviews', p.pageviews
      ) end
      from (
        select day, unique_visitors, pageviews
        from public.analytics_daily_rollups
        where organization_id = p_organization_id and path = '__site__'
        order by unique_visitors desc, day desc
        limit 1
      ) p
    ),
    'firstDay', (
      select to_char(min(day), 'YYYY-MM-DD')
      from public.analytics_daily_rollups
      where organization_id = p_organization_id and path = '__site__'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Cierre de acceso
-- ---------------------------------------------------------------------------

revoke all on function public.get_analytics_timeseries(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_analytics_dashboard_summary(uuid) from public, anon, authenticated;

grant execute on function public.get_analytics_timeseries(timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.get_analytics_dashboard_summary(uuid) to service_role;
