-- Presupuesto de almacenamiento del plan gratuito — PLU ARG
--
-- Auditado sobre la base hosteada (43 MB de los 500 MB del plan Free). El
-- problema no es el tamaño de hoy, es la pendiente y el techo:
--
--   analytics_events   7864 kB  ->  heap 2496 kB + indices 5328 kB (2,1x)
--   cron.job_run_details 7104 kB -> 30.350 filas desde el 18/07, sin purga
--   operational_event_logs 3232 kB -> sin retencion
--   domain_audit_logs   1168 kB  -> sin retencion
--
-- La analitica crece a 3.150-4.600 eventos por dia. A ~500 bytes por fila
-- (heap + indices) y con la retencion de 90 dias vigente, el estado estacionario
-- son ~350.000 filas = ~175 MB: **un tercio del plan entero en una sola tabla**,
-- sin que nadie haga nada raro. Y `/api/analytics/collect` es publico: con el
-- limite actual (120 req/min por IP x 50 eventos por lote) una sola IP mete
-- 8,6 millones de filas por dia. El plan gratuito se llena en una tarde.
--
-- Esta migracion pone tres cosas que no existian:
--   1. Cuota de ingesta (por sesion y global diaria) -- el techo de abuso.
--   2. Presupuesto **en bytes** con purga del mas viejo -- la garantia dura, la
--      unica que no depende de acertar una estimacion de filas.
--   3. Retencion e higiene del resto de las bitacoras.
--
-- No se toca la retencion de 90 dias de `purge_analytics_raw`: bajarla es una
-- decision de producto (afecta heatmaps y recorridos individuales), y el
-- presupuesto en bytes ya garantiza el techo sin necesidad de tomarla ahora.

-- ---------------------------------------------------------------------------
-- 1. Indices de analytics_events
-- ---------------------------------------------------------------------------
--
-- Con 10.439 filas la tabla tiene 2496 kB de datos y 5328 kB de indices. Siete
-- indices sobre la tabla de mayor volumen del sistema tambien encarecen cada
-- INSERT, que es la operacion caliente de la ingesta.
--
-- Uso real medido en `pg_stat_user_indexes`:
--   analytics_events_heatmap_idx    0 escaneos    584 kB
--   analytics_events_type_idx      33 escaneos   1120 kB
--
-- El de heatmap nunca se uso: es un subconjunto estricto de `path_idx`, y el
-- planner elige ese. El de tipo aporta poco porque `event_type` tiene once
-- valores sobre una tabla que ya viene acotada por `(organization_id,
-- occurred_at)`: filtrar once valores despues del rango es mas barato que
-- mantener un indice de 1 MB.
--
-- Los otros cinco se conservan: `org_occurred` (195), `athlete` (510),
-- `session` (149), `name` (81) y `path` (20) tienen uso comprobado.

drop index if exists public.analytics_events_heatmap_idx;
drop index if exists public.analytics_events_type_idx;

-- ---------------------------------------------------------------------------
-- 2. Cuota de ingesta
-- ---------------------------------------------------------------------------

create table if not exists public.analytics_ingest_quota (
  day date primary key,
  events integer not null default 0,
  throttled_batches integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.analytics_ingest_quota enable row level security;
revoke all on public.analytics_ingest_quota from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_ingest_quota to service_role;

/**
 * Techo diario de eventos aceptados en toda la instalacion.
 *
 * 15.000 es ~3,5x el pico real medido (4.626 el 14/08): deja lugar para crecer
 * varias veces sin tocar nada, y convierte "llenar la base" en algo que no se
 * puede hacer aunque se controlen mil IPs. Es el limite que no depende de
 * adivinar bien el rate limit por IP.
 */
create or replace function public.analytics_daily_event_cap()
returns integer
language sql
immutable
as $$ select 15000 $$;

/**
 * Techo por sesion.
 *
 * Es el control mas fino y el mas barato: `visitor_id` se deriva en el servidor
 * (IP + sal diaria + user agent, ver `visitorIdentity.js`), asi que un cliente
 * no puede fabricarse sesiones nuevas rotando un identificador propio. Una IP
 * abusiva queda contenida en **una** sesion cada 30 minutos, y esa sesion tiene
 * este tope.
 *
 * 1.200 eventos es holgado para navegacion real (una sesion larga con scroll y
 * clicks ronda los 200-300) y ridiculo para un bot.
 *
 * El chequeo no cuesta ninguna consulta extra: `event_count` ya viene en la fila
 * de sesion que la RPC lee igual.
 */
create or replace function public.analytics_session_event_cap()
returns integer
language sql
immutable
as $$ select 1200 $$;

-- ---------------------------------------------------------------------------
-- 3. Ingesta con cuota
-- ---------------------------------------------------------------------------
--
-- Se reescribe `ingest_analytics_events` conservando firma y contrato: el
-- endpoint sigue recibiendo `{sessionId, accepted}`. Lo nuevo es que puede
-- devolver `accepted: 0` con `throttled: true` en vez de escribir.
--
-- Ademas se acota `metadata`: era el unico campo del evento sin techo de tamaño.
-- El endpoint valida el resto (title 200, selector 300, text 120) pero
-- `z.record(z.unknown())` acepta un objeto arbitrario, y con el limite de 100 kB
-- del body de Express eso son ~2 kB de jsonb por evento, 50 eventos por lote.
-- Un lote asi pesa mas que cien lotes normales.

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
  v_today date := (v_now at time zone 'UTC')::date;
  v_inserted integer := 0;
  v_pageviews integer := 0;
  v_first_path text;
  v_last_path text;
  v_occurred timestamptz;
  v_batch integer;
  v_day_events integer;
  v_metadata jsonb;
begin
  if p_visitor_id is null or length(trim(p_visitor_id)) = 0 then
    raise exception 'PLU90 · visitante invalido' using errcode = '22023';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then
    raise exception 'PLU91 · lote de eventos vacio' using errcode = '22023';
  end if;
  if jsonb_array_length(p_events) > 50 then
    raise exception 'PLU92 · lote demasiado grande' using errcode = '22023';
  end if;

  v_batch := jsonb_array_length(p_events);

  -- Cupo diario. Se reserva ANTES de escribir nada: si el lote no entra entero,
  -- no entra. Reservar despues permitiria pasarse por el tamaño del ultimo lote
  -- multiplicado por la cantidad de instancias concurrentes.
  insert into public.analytics_ingest_quota as q (day, events, updated_at)
  values (v_today, v_batch, v_now)
  on conflict (day) do update set
    events = q.events + v_batch,
    updated_at = v_now
  returning events into v_day_events;

  if v_day_events > public.analytics_daily_event_cap() then
    update public.analytics_ingest_quota
    set events = events - v_batch,
        throttled_batches = throttled_batches + 1,
        updated_at = v_now
    where day = v_today;

    return jsonb_build_object('sessionId', null, 'accepted', 0, 'throttled', 'daily_cap');
  end if;

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
    update public.analytics_sessions
    set athlete_id = p_athlete_id
    where id = v_session.id
    returning * into v_session;

    update public.analytics_events
    set athlete_id = p_athlete_id
    where session_id = v_session.id and athlete_id is null;
  end if;

  -- Techo por sesion. Se devuelve el `sessionId` igual para que el tracker
  -- mantenga la continuidad y no interprete el corte como sesion nueva.
  if v_session.event_count >= public.analytics_session_event_cap() then
    update public.analytics_ingest_quota
    set events = events - v_batch,
        throttled_batches = throttled_batches + 1,
        updated_at = v_now
    where day = v_today;

    update public.analytics_sessions
    set last_seen_at = v_now
    where id = v_session.id;

    return jsonb_build_object('sessionId', v_session.id, 'accepted', 0, 'throttled', 'session_cap');
  end if;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    v_occurred := coalesce((v_event->>'occurredAt')::timestamptz, v_now);
    if v_occurred > v_now or v_occurred < v_now - interval '6 hours' then
      v_occurred := v_now;
    end if;

    -- Metadata acotada: si el objeto pesa mas de 2 kB serializado se descarta
    -- entero en vez de truncarse, porque un jsonb cortado a la mitad no es
    -- jsonb valido y romperia la lectura del panel.
    v_metadata := coalesce(v_event->'metadata', '{}'::jsonb);
    if length(v_metadata::text) > 2048 then
      v_metadata := jsonb_build_object('_dropped', 'oversized');
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
      v_metadata,
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
-- 4. Presupuesto en bytes
-- ---------------------------------------------------------------------------

/**
 * Recorta `analytics_events` hasta entrar en `p_max_bytes`, borrando siempre lo
 * mas viejo y consolidando el rollup diario antes de borrar.
 *
 * Es la unica garantia que no depende de una estimacion. Las cuotas de arriba
 * acotan el ritmo; esto acota el tamaño, que es lo que factura el plan.
 *
 * 120 MB de los 500: deja el resto para el dominio transaccional, que es el que
 * no se puede purgar.
 */
create or replace function public.enforce_analytics_storage_budget(
  p_max_bytes bigint default 125829120
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size bigint;
  v_deleted integer := 0;
  v_round integer := 0;
  v_cutoff timestamptz;
  v_batch integer;
begin
  v_size := pg_total_relation_size('public.analytics_events');
  if v_size <= p_max_bytes then
    return jsonb_build_object('sizeBytes', v_size, 'deleted', 0, 'withinBudget', true);
  end if;

  -- Se avanza por dias completos y no por un `limit N`: borrar un dia entero
  -- deja el rollup consistente, y borrar "las N mas viejas" lo parte al medio.
  -- Diez vueltas como maximo para no convertir el mantenimiento nocturno en una
  -- transaccion larga sobre una base compartida de dos nucleos.
  while v_size > p_max_bytes and v_round < 10 loop
    select min(occurred_at)::date into v_cutoff from public.analytics_events;
    exit when v_cutoff is null;

    perform public.rollup_analytics_daily(v_cutoff::date);

    delete from public.analytics_events
    where occurred_at < (v_cutoff::date + 1)::timestamptz;
    get diagnostics v_batch = row_count;
    v_deleted := v_deleted + v_batch;

    delete from public.analytics_sessions s
    where s.last_seen_at < (v_cutoff::date + 1)::timestamptz
      and not exists (select 1 from public.analytics_events e where e.session_id = s.id);

    v_round := v_round + 1;
    -- `pg_total_relation_size` no baja hasta que el vacuum libera las paginas,
    -- asi que se fuerza aca: sin esto el bucle borraria de mas creyendo que no
    -- avanzo.
    execute 'vacuum (analyze) public.analytics_events';
    v_size := pg_total_relation_size('public.analytics_events');
  end loop;

  return jsonb_build_object(
    'sizeBytes', v_size,
    'deleted', v_deleted,
    'withinBudget', v_size <= p_max_bytes
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Retencion del resto de las bitacoras
-- ---------------------------------------------------------------------------

/**
 * Ventanas distintas segun para que sirve cada bitacora:
 *
 *   operational_event_logs (365 d) y domain_audit_logs (365 d) sostienen
 *   reclamos de dinero y accesos: un año cubre el ciclo de temporada completo
 *   mas el margen de una disputa.
 *
 *   transactional_email_logs (180 d) es diagnostico de entrega; pasado medio año
 *   no se reclama un mail.
 *
 *   payment_integration_events (365 d) es la traza cruda del webhook. Se
 *   conserva igual que la auditoria porque es la evidencia de que un cobro
 *   entro.
 *
 * Todo con `if exists`: la funcion no puede fallar porque una tabla se llame
 * distinto en un entorno.
 */
create or replace function public.purge_operational_history(
  p_audit_days integer default 365,
  p_email_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_count integer;
  v_audit interval := make_interval(days => greatest(30, coalesce(p_audit_days, 365)));
  v_email interval := make_interval(days => greatest(30, coalesce(p_email_days, 180)));
begin
  if to_regclass('public.operational_event_logs') is not null then
    delete from public.operational_event_logs where created_at < now() - v_audit;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('operational_event_logs', v_count);
  end if;

  if to_regclass('public.domain_audit_logs') is not null then
    delete from public.domain_audit_logs where created_at < now() - v_audit;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('domain_audit_logs', v_count);
  end if;

  if to_regclass('public.transactional_email_logs') is not null then
    delete from public.transactional_email_logs where created_at < now() - v_email;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('transactional_email_logs', v_count);
  end if;

  if to_regclass('public.payment_integration_events') is not null then
    delete from public.payment_integration_events where created_at < now() - v_audit;
    get diagnostics v_count = row_count;
    v_result := v_result || jsonb_build_object('payment_integration_events', v_count);
  end if;

  return v_result;
end;
$$;

/**
 * Bitacora de pg_cron.
 *
 * `cron.job_run_details` pesa 7104 kB con 30.350 filas acumuladas desde el 18 de
 * julio, y crece sola: Supabase no la purga. La mayor parte la genera
 * `expire-domain-orders-minute`, que corre cada minuto y deja 1.440 filas
 * diarias. Es la segunda tabla mas grande de la base y no la escribe la
 * aplicacion -- es puro registro de que los jobs corrieron.
 *
 * Se conservan tres dias, que es lo que hace falta para diagnosticar un job que
 * fallo anoche.
 */
create or replace function public.purge_cron_history(p_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_count integer := 0;
begin
  if to_regclass('cron.job_run_details') is null then
    return 0;
  end if;

  begin
    delete from cron.job_run_details
    where end_time < now() - make_interval(days => greatest(1, coalesce(p_days, 3)));
    get diagnostics v_count = row_count;
  exception when insufficient_privilege then
    -- En un entorno donde la migracion no corre como dueño de `cron`, se avisa
    -- y se sigue: el resto del mantenimiento no depende de esto.
    raise warning 'Sin privilegios para purgar cron.job_run_details';
    return 0;
  end;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Autovacuum en las tablas de mayor rotacion
-- ---------------------------------------------------------------------------
--
-- El default de Postgres dispara el autovacuum al 20% de filas muertas. En una
-- tabla que se purga por lotes eso deja el espacio retenido mucho mas tiempo del
-- necesario, y en el plan gratuito el espacio retenido cuenta igual que el
-- ocupado. Con 5% las tablas se mantienen compactas sin que el vacuum se vuelva
-- constante.

alter table public.analytics_events set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
alter table public.analytics_sessions set (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.02);
alter table public.rate_limit_buckets set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.05);

do $$
begin
  if to_regclass('public.operational_event_logs') is not null then
    execute 'alter table public.operational_event_logs set (autovacuum_vacuum_scale_factor = 0.05)';
  end if;
  if to_regclass('public.domain_audit_logs') is not null then
    execute 'alter table public.domain_audit_logs set (autovacuum_vacuum_scale_factor = 0.05)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Medicion: cuanto del plan gratuito queda
-- ---------------------------------------------------------------------------

/**
 * Consumo real de la base, para que el panel deje de adivinar.
 *
 * Que el plan se mantenga gratis no es un estado, es algo que hay que mirar. Sin
 * esto la unica forma de saber cuanto queda es abrir el dashboard de Supabase, y
 * lo que no se ve en el panel propio no se mira.
 */
create or replace function public.get_database_usage(p_limit integer default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'databaseBytes', pg_database_size(current_database()),
    -- Techo del plan Free de Supabase.
    'planLimitBytes', 524288000::bigint,
    'usedRatio', round(pg_database_size(current_database())::numeric / 524288000, 4),
    'analyticsBytes', coalesce(pg_total_relation_size('public.analytics_events'), 0),
    'analyticsRows', (select count(*) from public.analytics_events),
    'analyticsToday', (select coalesce(events, 0) from public.analytics_ingest_quota where day = (now() at time zone 'UTC')::date),
    'analyticsDailyCap', public.analytics_daily_event_cap(),
    'tables', coalesce((
      select jsonb_agg(row_to_json(t) order by t.total_bytes desc)
      from (
        select n.nspname || '.' || c.relname as name,
               pg_total_relation_size(c.oid) as total_bytes,
               pg_relation_size(c.oid) as heap_bytes,
               pg_indexes_size(c.oid) as index_bytes,
               c.reltuples::bigint as estimated_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'r'
          and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
        order by pg_total_relation_size(c.oid) desc
        limit greatest(1, least(coalesce(p_limit, 15), 50))
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.enforce_analytics_storage_budget(bigint) from public, anon, authenticated;
revoke all on function public.purge_operational_history(integer, integer) from public, anon, authenticated;
revoke all on function public.purge_cron_history(integer) from public, anon, authenticated;
revoke all on function public.get_database_usage(integer) from public, anon, authenticated;
revoke all on function public.analytics_daily_event_cap() from public, anon, authenticated;
revoke all on function public.analytics_session_event_cap() from public, anon, authenticated;

grant execute on function public.enforce_analytics_storage_budget(bigint) to service_role;
grant execute on function public.purge_operational_history(integer, integer) to service_role;
grant execute on function public.purge_cron_history(integer) to service_role;
grant execute on function public.get_database_usage(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Mantenimiento nocturno
-- ---------------------------------------------------------------------------
--
-- Un solo job para todo el mantenimiento de espacio. El de analitica
-- (`plu-analytics-nightly`, 04:20) se mantiene aparte porque es de dominio, no
-- de infraestructura: consolida los rollups.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('plu-storage-nightly')
    where exists (select 1 from cron.job where jobname = 'plu-storage-nightly');

    perform cron.schedule(
      'plu-storage-nightly',
      '40 4 * * *',
      $cron$
        select public.purge_defense_counters();
        select public.purge_operational_history();
        select public.purge_cron_history(3);
        select public.enforce_analytics_storage_budget();
      $cron$
    );
  end if;
end;
$$;

-- Primera pasada inmediata sobre lo que ya se acumulo: 7 MB de bitacora de cron
-- que no aportan nada.
select public.purge_cron_history(3);
