-- Presencia en vivo y metricas de acceso — PLU ARG
--
-- El informe de analitica contestaba "cuanta gente entro en los ultimos 30
-- dias" y la auditoria contestaba "que paso con esta orden". Ninguno de los dos
-- contestaba las dos preguntas que se hacen durante un evento en curso:
--
--   1. Cuanta gente hay en el sitio AHORA, en que pagina, desde que dispositivo.
--   2. Cuantas personas entraron correctamente y cuantas rebotaron contra un
--      acceso fallido.
--
-- La primera no existia en ninguna forma: para contestarla habia que abrir la
-- base y escribir el `where last_seen_at > now() - interval '5 minutes'` a mano.
-- La segunda estaba en la bitacora pero solo como filas sueltas: contarlas
-- exigia paginar `operational_event_logs` y agrupar en la cabeza.
--
-- Las dos RPC de esta migracion son de solo lectura y agregan en Postgres. No
-- se agrega ninguna tabla: la presencia se deriva de `analytics_sessions`, que
-- ya se actualiza en cada latido del tracker, y los accesos de
-- `operational_event_logs`, que ya audita cada login.

-- ---------------------------------------------------------------------------
-- Indices de soporte
-- ---------------------------------------------------------------------------
--
-- La consulta de presencia filtra por `last_seen_at` sobre toda la
-- organizacion, sin acotar por `started_at`. El indice existente
-- (`analytics_sessions_visitor_idx`) lidera por `visitor_id`, asi que no la
-- sirve: haria un scan completo en cada refresco, y el panel refresca solo.

create index if not exists analytics_sessions_last_seen_idx
  on public.analytics_sessions (organization_id, last_seen_at desc);

-- Los accesos se leen por accion y fecha. Sin esto, cada apertura del panel
-- escanea la bitacora entera para contar cuatro acciones.
create index if not exists operational_event_logs_action_created_idx
  on public.operational_event_logs (organization_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- Presencia en vivo
-- ---------------------------------------------------------------------------

/**
 * Quien esta en el sitio ahora mismo.
 *
 * "Ahora" son los ultimos `p_window_minutes` (5 por omision). No es un numero
 * elegido al azar: el tracker late cada 30 segundos, asi que una ventana de 5
 * minutos tolera diez latidos perdidos antes de dar por ida a una persona que
 * sigue leyendo. Es tambien la ventana que usa GA para su vista de tiempo real,
 * lo que hace comparables los numeros con cualquier otra herramienta.
 *
 * Tres precisiones sobre lo que cada campo mide, porque se confunden facil:
 *
 *   - `visitors` cuenta personas distintas (`visitor_id`), no sesiones. Alguien
 *     con dos pestañas abiertas es una persona.
 *   - `series` es concurrencia real y no actividad por minuto: una sesion cuenta
 *     en el minuto `m` si su intervalo [started_at, last_seen_at] lo cubre,
 *     aunque no haya emitido ningun evento en ese minuto exacto. Contar eventos
 *     por minuto daria una curva dentada que subestima a quien esta leyendo.
 *   - `pages` usa `exit_path`, que la ingesta mantiene apuntando al ultimo
 *     pageview de la sesion. Es "donde esta parada la persona", no "por donde
 *     paso".
 *
 * La serie se acota a 60 minutos y el pico del dia se calcula en baldes de 5
 * minutos. La diferencia de granularidad es deliberada: por minuto sobre 24
 * horas serian 1440 puntos cruzados contra todas las sesiones del dia, un costo
 * que no se justifica para un unico numero.
 */
create or replace function public.get_analytics_live(
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid,
  p_window_minutes integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      now() as at,
      -- Techo y piso sobre la ventana: un `p_window_minutes` gigante convertiria
      -- esta RPC en el informe historico, que ya existe y esta indexado para eso.
      greatest(1, least(coalesce(p_window_minutes, 5), 60)) as window_minutes
  ),
  live as (
    select s.*
    from public.analytics_sessions s, bounds b
    where s.organization_id = p_organization_id
      and s.last_seen_at > b.at - make_interval(mins => b.window_minutes)
  ),
  -- Ventana ampliada: una sesion que empezo hace 40 minutos y sigue viva tiene
  -- que contar en los minutos intermedios de la serie, aunque su `last_seen_at`
  -- sea reciente. Se acota a 3 horas para que el rango escaneado sea acotado.
  recent as (
    select s.started_at, s.last_seen_at
    from public.analytics_sessions s, bounds b
    where s.organization_id = p_organization_id
      and s.last_seen_at > b.at - interval '3 hours'
  ),
  minutes as (
    select generate_series(
      date_trunc('minute', (select at from bounds) - interval '59 minutes'),
      date_trunc('minute', (select at from bounds)),
      interval '1 minute'
    ) as minute
  ),
  concurrency as (
    select
      m.minute,
      count(*) filter (
        where r.started_at <= m.minute + interval '1 minute'
          and r.last_seen_at >= m.minute
      ) as sessions
    from minutes m
    left join recent r on true
    group by m.minute
  ),
  today_buckets as (
    select
      b5.bucket,
      count(*) filter (
        where s.started_at <= b5.bucket + interval '5 minutes'
          and s.last_seen_at >= b5.bucket
      ) as sessions
    from (
      select generate_series(
        date_trunc('day', (select at from bounds)),
        date_trunc('minute', (select at from bounds)),
        interval '5 minutes'
      ) as bucket
    ) b5
    left join public.analytics_sessions s
      on s.organization_id = p_organization_id
      and s.last_seen_at >= date_trunc('day', (select at from bounds))
    group by b5.bucket
  )
  select jsonb_build_object(
    'generatedAt', (select at from bounds),
    'windowMinutes', (select window_minutes from bounds),

    'visitors', (select count(distinct visitor_id) from live),
    'sessions', (select count(*) from live),
    -- Personas con sesion de atleta iniciada: separa "hay 40 curiosos" de "hay
    -- 40 afiliados operando", que ante un problema no es lo mismo.
    'identified', (select count(distinct athlete_id) from live where athlete_id is not null),
    'engaged', (select count(*) from live where is_engaged),

    'peakLastHour', coalesce((select max(sessions) from concurrency), 0),
    'peakToday', coalesce((select max(sessions) from today_buckets), 0),
    'peakTodayAt', (select bucket from today_buckets order by sessions desc, bucket limit 1),

    -- Contexto del dia, para leer el numero de ahora contra algo.
    'visitorsToday', (
      select count(distinct visitor_id) from public.analytics_sessions
      where organization_id = p_organization_id
        and last_seen_at >= date_trunc('day', (select at from bounds))
    ),
    'visitorsLast24h', (
      select count(distinct visitor_id) from public.analytics_sessions
      where organization_id = p_organization_id
        and last_seen_at >= (select at from bounds) - interval '24 hours'
    ),

    'series', coalesce((
      select jsonb_agg(jsonb_build_object('minute', minute, 'sessions', sessions) order by minute)
      from concurrency
    ), '[]'::jsonb),

    'pages', coalesce((
      select jsonb_agg(row_to_json(p) order by p.visitors desc, p.path)
      from (
        select
          coalesce(exit_path, entry_path, '/') as path,
          count(distinct visitor_id) as visitors,
          count(*) as sessions
        from live
        group by 1
        order by 2 desc
        limit 15
      ) p
    ), '[]'::jsonb),

    'devices', coalesce((
      select jsonb_agg(row_to_json(d) order by d.visitors desc)
      from (
        select coalesce(device_type, 'unknown') as device_type,
               count(distinct visitor_id) as visitors
        from live group by 1
      ) d
    ), '[]'::jsonb),

    'countries', coalesce((
      select jsonb_agg(row_to_json(c) order by c.visitors desc)
      from (
        select coalesce(country, 'desconocido') as country,
               count(distinct visitor_id) as visitors
        from live group by 1 order by 2 desc limit 10
      ) c
    ), '[]'::jsonb),

    'referrers', coalesce((
      select jsonb_agg(row_to_json(r) order by r.visitors desc)
      from (
        select coalesce(referrer_host, 'directo') as referrer,
               count(distinct visitor_id) as visitors
        from live group by 1 order by 2 desc limit 10
      ) r
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Metricas de acceso
-- ---------------------------------------------------------------------------

/**
 * Cuantas personas entraron correctamente, y cuantas no pudieron.
 *
 * Sale de `operational_event_logs`, que ya audita cada intento de acceso. Lo que
 * agrega esta RPC es la lectura por persona: la bitacora tiene 407 asientos de
 * login exitoso, pero eso son 13 personas entrando muchas veces. Reportar el
 * conteo de eventos como si fueran personas es el error mas facil de cometer
 * con estos datos, asi que las dos cifras van siempre juntas y con nombre
 * distinto (`events` / `people`).
 *
 * Atletas y staff se cuentan por separado a proposito: son poblaciones de
 * tamaño y significado distinto, y sumarlas produce un total que no responde
 * ninguna pregunta real.
 *
 * `failureRate` se calcula sobre intentos y no sobre personas: mide cuanto
 * cuesta entrar, que es lo que se quiere vigilar durante un evento.
 */
create or replace function public.get_access_metrics(
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
  with scoped as (
    select action, entity_type, entity_id, status, created_at, metadata
    from public.operational_event_logs
    where organization_id = p_organization_id
      and source = 'identity'
      and created_at >= p_from and created_at < p_to
  ),
  succeeded as (select * from scoped where action in ('auth.login_succeeded', 'auth.session_started')),
  failed as (select * from scoped where action = 'auth.login_failed'),
  created as (select * from scoped where action = 'account.created')
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,

    'succeeded', jsonb_build_object(
      'events', (select count(*) from succeeded),
      'people', (select count(distinct entity_id) from succeeded where entity_id is not null),
      'athletes', (select count(distinct entity_id) from succeeded where entity_type = 'athlete' and entity_id is not null),
      'staff', (select count(distinct entity_id) from succeeded where entity_type = 'staff_user' and entity_id is not null)
    ),
    'failed', jsonb_build_object(
      'events', (select count(*) from failed),
      'people', (select count(distinct entity_id) from failed where entity_id is not null),
      'athletes', (select count(distinct entity_id) from failed where entity_type = 'athlete' and entity_id is not null),
      'staff', (select count(distinct entity_id) from failed where entity_type = 'staff_user' and entity_id is not null)
    ),
    'accountsCreated', (select count(*) from created),

    -- Sobre intentos: cuanto cuesta entrar.
    'failureRate', (
      select case
        when (select count(*) from succeeded) + (select count(*) from failed) = 0 then 0
        else round(
          (select count(*) from failed)::numeric
          / ((select count(*) from succeeded) + (select count(*) from failed)),
          4)
      end
    ),

    -- Personas que solo fallaron: nunca llegaron a entrar en toda la ventana.
    -- Es la cifra que importa ante "no puedo entrar": las que fallaron y
    -- despues entraron no son un problema abierto.
    'blockedPeople', (
      select count(*) from (
        select entity_id from failed where entity_id is not null
        except
        select entity_id from succeeded where entity_id is not null
      ) b
    ),

    'series', coalesce((
      select jsonb_agg(row_to_json(d) order by d.day)
      from (
        select
          date_trunc('day', created_at)::date as day,
          count(*) filter (where action in ('auth.login_succeeded', 'auth.session_started')) as succeeded,
          count(*) filter (where action = 'auth.login_failed') as failed,
          count(distinct entity_id) filter (
            where action in ('auth.login_succeeded', 'auth.session_started') and entity_id is not null
          ) as people
        from scoped
        group by 1
      ) d
    ), '[]'::jsonb),

    -- Motivos de rechazo, para distinguir "se equivocaron de contraseña" de
    -- "el sistema los rechaza".
    'failureReasons', coalesce((
      select jsonb_agg(row_to_json(r) order by r.attempts desc)
      from (
        select
          coalesce(metadata->>'reason', 'sin_motivo') as reason,
          count(*) as attempts,
          count(distinct entity_id) as people
        from failed
        group by 1
        order by 2 desc
        limit 12
      ) r
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Cierre de acceso
-- ---------------------------------------------------------------------------

revoke all on function public.get_analytics_live(uuid, integer) from public, anon, authenticated;
revoke all on function public.get_access_metrics(timestamptz, timestamptz, uuid) from public, anon, authenticated;

grant execute on function public.get_analytics_live(uuid, integer) to service_role;
grant execute on function public.get_access_metrics(timestamptz, timestamptz, uuid) to service_role;
