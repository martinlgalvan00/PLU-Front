-- Capa de defensa adaptativa (limite compartido + bloqueo por identidad) — PLU ARG
--
-- Motivo: `server/middleware/rateLimit.js` define presets bien calibrados, pero
-- corren sobre el store en memoria de `express-rate-limit`. En Vercel cada
-- request concurrente puede aterrizar en una instancia distinta, y cada
-- instancia arranca su propio contador. El limite efectivo no es "20 intentos
-- cada 15 minutos": es "20 por instancia", y la cantidad de instancias la
-- elige el atacante subiendo la concurrencia. Justo el escenario que el limite
-- deberia cubrir es el unico en el que no cubre nada.
--
-- Esto agrega el estado compartido que faltaba. Dos piezas:
--
--   1. `consume_rate_limit` — ventana fija por clave, atomica, con bloqueo
--      escalonado para el que reincide.
--   2. `register_identity_failure` — bloqueo por *cuenta*, no por IP. El limite
--      por IP no frena credential stuffing distribuido: mil IPs probando la
--      misma casilla ven mil contadores separados. Este ve uno solo.
--
-- Sobre el plan gratuito: el costo tiene que bajar cuando hay ataque, no subir.
-- El cliente Node (`server/lib/defense/sharedRateLimitStore.js`) cuenta primero
-- en memoria y solo consulta esta tabla al cruzar un umbral; cuando la respuesta
-- es "bloqueado", cachea el bloqueo local hasta que venza y deja de preguntar.
-- Resultado: el trafico legitimo casi nunca toca la base, y una IP que satura
-- hace **una** escritura y despues cero.

-- ---------------------------------------------------------------------------
-- Contadores de ventana
-- ---------------------------------------------------------------------------
--
-- `unlogged` a proposito: son contadores efimeros: no van al WAL, no entran a
-- los backups y no gastan I/O de replicacion. Se pierden ante un crash del
-- servidor, y eso es exactamente lo que se quiere -- un contador de rate limit
-- que sobrevive a un reinicio no vale el disco que ocupa.

create unlogged table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0,
  -- Bloqueo explicito: separado de `hits` porque sobrevive al reinicio de la
  -- ventana. Sin esto, quien satura espera a que la ventana rote y vuelve a
  -- tener el cupo entero.
  blocked_until timestamptz,
  -- Reincidencia. Cada bloqueo dentro del periodo de gracia sube el escalon y
  -- alarga el siguiente. Un cliente con un bug de polling paga segundos; uno
  -- que insiste, horas.
  strikes integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Unico indice ademas de la PK, y solo para que la purga no escanee la tabla.
create index if not exists rate_limit_buckets_updated_idx
  on public.rate_limit_buckets (updated_at);

-- ---------------------------------------------------------------------------
-- Bloqueo por identidad
-- ---------------------------------------------------------------------------
--
-- Esta si es `logged`: un bloqueo por intentos fallidos tiene que sobrevivir a
-- un reinicio, o alcanza con esperar uno para resetear el castigo. El volumen es
-- de decenas de filas, asi que el costo es irrelevante.
--
-- `identity_hash` es un SHA-256 con sal de servidor calculado en Node: la tabla
-- nunca ve el email. Un volcado de esta tabla no revela que casillas existen.

create table if not exists public.identity_lockouts (
  scope text not null,
  identity_hash text not null,
  failures integer not null default 0,
  first_failure_at timestamptz not null default now(),
  last_failure_at timestamptz not null default now(),
  locked_until timestamptz,
  lock_level integer not null default 0,
  primary key (scope, identity_hash)
);

create index if not exists identity_lockouts_last_failure_idx
  on public.identity_lockouts (last_failure_at);

alter table public.rate_limit_buckets enable row level security;
alter table public.identity_lockouts enable row level security;

revoke all on public.rate_limit_buckets from public, anon, authenticated;
revoke all on public.identity_lockouts from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limit_buckets to service_role;
grant select, insert, update, delete on public.identity_lockouts to service_role;

-- ---------------------------------------------------------------------------
-- consume_rate_limit
-- ---------------------------------------------------------------------------

/**
 * Consume `p_cost` unidades de la ventana de `p_key`.
 *
 * Todo el trabajo pasa por un `insert ... on conflict do update` y un `update`
 * sobre la fila que ese upsert ya dejo bloqueada: dos instancias pidiendo a la
 * vez se serializan en la fila, no se pisan. Contar con `select` + `update`
 * separados daria de mas justo bajo la concurrencia que esto tiene que frenar.
 *
 * `p_cost` existe porque el cliente sincroniza por lotes: acumula N hits
 * locales y los descarga de una. Sin costo variable, agrupar mentiria el conteo.
 */
create or replace function public.consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer,
  p_cost integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval;
  v_cost integer := greatest(1, coalesce(p_cost, 1));
  v_limit integer := greatest(1, coalesce(p_limit, 1));
  v_row public.rate_limit_buckets;
  v_block_seconds integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'PLU95 · clave de rate limit vacia' using errcode = '22023';
  end if;

  -- Techo de un dia: una ventana absurda por un bug de llamada no puede dejar a
  -- alguien bloqueado para siempre.
  v_window := make_interval(secs => greatest(1, least(86400, coalesce(p_window_seconds, 60))));

  insert into public.rate_limit_buckets as b (bucket_key, window_started_at, hits, strikes, updated_at)
  values (left(p_key, 200), v_now, v_cost, 0, v_now)
  on conflict (bucket_key) do update set
    -- La ventana rota sola cuando vencio; no hace falta un job para eso.
    window_started_at = case
      when b.window_started_at + v_window <= v_now then v_now
      else b.window_started_at
    end,
    hits = case
      when b.window_started_at + v_window <= v_now then v_cost
      else b.hits + v_cost
    end,
    -- Los strikes se perdonan solos: quien no vuelve a pasarse durante ocho
    -- ventanas seguidas arranca de cero. Sin este olvido, un pico legitimo de
    -- hace un mes seguiria encareciendo el bloqueo de hoy.
    strikes = case
      when b.updated_at < v_now - (v_window * 8) then 0
      else b.strikes
    end,
    updated_at = v_now
  returning * into v_row;

  -- Bloqueo vigente: se responde sin tocar nada mas. El cliente cachea esto y
  -- deja de preguntar hasta que venza, que es lo que hace barato el ataque.
  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'hits', v_row.hits,
      'limit', v_limit,
      'blocked', true,
      'resetAt', v_row.blocked_until,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer)
    );
  end if;

  if v_row.hits > v_limit then
    -- Escalera: 1x la ventana el primer bloqueo, y se duplica hasta 16x.
    v_block_seconds := least(
      extract(epoch from v_window)::integer * 16,
      extract(epoch from v_window)::integer * power(2, least(4, v_row.strikes))::integer
    );

    update public.rate_limit_buckets
    set blocked_until = v_now + make_interval(secs => v_block_seconds),
        strikes = least(10, v_row.strikes + 1),
        updated_at = v_now
    where bucket_key = v_row.bucket_key
    returning * into v_row;

    return jsonb_build_object(
      'allowed', false,
      'hits', v_row.hits,
      'limit', v_limit,
      'blocked', true,
      'resetAt', v_row.blocked_until,
      'retryAfterSeconds', greatest(1, v_block_seconds)
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'hits', v_row.hits,
    'limit', v_limit,
    'blocked', false,
    'resetAt', v_row.window_started_at + v_window,
    'retryAfterSeconds', 0
  );
end;
$$;

/** Libera una clave. La usa `resetKey` del store y el panel ante un falso positivo. */
create or replace function public.release_rate_limit(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_buckets where bucket_key = left(p_key, 200);
$$;

-- ---------------------------------------------------------------------------
-- Bloqueo por identidad
-- ---------------------------------------------------------------------------

/**
 * Escalera de bloqueo. Deliberadamente empinada al final: los primeros escalones
 * apenas molestan a quien se equivoco de contraseña, y el quinto deja la cuenta
 * fuera de alcance por seis horas para quien la esta barriendo.
 */
create or replace function public.identity_lock_seconds(p_level integer)
returns integer
language sql
immutable
as $$
  select case greatest(0, coalesce(p_level, 0))
    when 0 then 0
    when 1 then 60
    when 2 then 300
    when 3 then 900
    when 4 then 3600
    else 21600
  end;
$$;

/**
 * Registra un intento fallido y devuelve el estado resultante.
 *
 * `p_window_seconds` es la memoria del contador: fallas mas viejas que eso no
 * suman. Sin esa amnesia, cinco errores de tipeo repartidos en un año terminan
 * bloqueando a un socio que nunca hizo nada raro.
 */
create or replace function public.register_identity_failure(
  p_scope text,
  p_identity_hash text,
  p_threshold integer default 5,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window interval := make_interval(secs => greatest(60, least(86400, coalesce(p_window_seconds, 900))));
  v_threshold integer := greatest(1, coalesce(p_threshold, 5));
  v_row public.identity_lockouts;
  v_seconds integer;
begin
  if p_scope is null or p_identity_hash is null then
    raise exception 'PLU96 · identidad invalida' using errcode = '22023';
  end if;

  insert into public.identity_lockouts as l (
    scope, identity_hash, failures, first_failure_at, last_failure_at, lock_level
  )
  values (p_scope, p_identity_hash, 1, v_now, v_now, 0)
  on conflict (scope, identity_hash) do update set
    failures = case when l.last_failure_at < v_now - v_window then 1 else l.failures + 1 end,
    first_failure_at = case when l.last_failure_at < v_now - v_window then v_now else l.first_failure_at end,
    last_failure_at = v_now,
    -- El nivel tambien se perdona, pero mucho mas despacio que las fallas: hace
    -- falta un dia limpio para bajar un escalon.
    lock_level = case when l.last_failure_at < v_now - interval '1 day' then greatest(0, l.lock_level - 1) else l.lock_level end
  returning * into v_row;

  if v_row.failures >= v_threshold then
    v_seconds := public.identity_lock_seconds(v_row.lock_level + 1);
    update public.identity_lockouts
    set lock_level = least(5, v_row.lock_level + 1),
        locked_until = v_now + make_interval(secs => v_seconds),
        failures = 0,
        first_failure_at = v_now
    where scope = v_row.scope and identity_hash = v_row.identity_hash
    returning * into v_row;

    return jsonb_build_object(
      'locked', true,
      'lockedUntil', v_row.locked_until,
      'retryAfterSeconds', v_seconds,
      'failures', 0,
      'level', v_row.lock_level
    );
  end if;

  return jsonb_build_object(
    'locked', false,
    'lockedUntil', v_row.locked_until,
    'retryAfterSeconds', 0,
    'failures', v_row.failures,
    'level', v_row.lock_level
  );
end;
$$;

/** Estado actual sin registrar nada. Se consulta ANTES de gastar el bcrypt. */
create or replace function public.inspect_identity_lock(
  p_scope text,
  p_identity_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'locked', true,
        'lockedUntil', l.locked_until,
        'retryAfterSeconds', greatest(1, ceil(extract(epoch from (l.locked_until - now())))::integer),
        'level', l.lock_level
      )
      from public.identity_lockouts l
      where l.scope = p_scope
        and l.identity_hash = p_identity_hash
        and l.locked_until is not null
        and l.locked_until > now()
    ),
    jsonb_build_object('locked', false, 'retryAfterSeconds', 0)
  );
$$;

/**
 * Login correcto: se limpia el contador pero **no** el nivel de escalera. Quien
 * viene de un bloqueo largo no vuelve a foja cero por acertar una vez -- eso es
 * justo lo que consigue un atacante que dio con la credencial.
 */
create or replace function public.clear_identity_failures(
  p_scope text,
  p_identity_hash text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.identity_lockouts
  set failures = 0, locked_until = null
  where scope = p_scope and identity_hash = p_identity_hash;
$$;

-- ---------------------------------------------------------------------------
-- Purga
-- ---------------------------------------------------------------------------

/**
 * Las dos tablas se limpian solas. Sin esto, `rate_limit_buckets` acumula una
 * fila por IP vista alguna vez: es la tabla con mas cardinalidad potencial de
 * todo el sistema y la que mas rapido comeria el plan gratuito.
 */
create or replace function public.purge_defense_counters()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buckets integer;
  v_locks integer;
begin
  delete from public.rate_limit_buckets
  where updated_at < now() - interval '2 days'
    and (blocked_until is null or blocked_until < now());
  get diagnostics v_buckets = row_count;

  delete from public.identity_lockouts
  where last_failure_at < now() - interval '30 days'
    and (locked_until is null or locked_until < now());
  get diagnostics v_locks = row_count;

  return jsonb_build_object('buckets', v_buckets, 'lockouts', v_locks);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.release_rate_limit(text) from public, anon, authenticated;
revoke all on function public.register_identity_failure(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.inspect_identity_lock(text, text) from public, anon, authenticated;
revoke all on function public.clear_identity_failures(text, text) from public, anon, authenticated;
revoke all on function public.purge_defense_counters() from public, anon, authenticated;
revoke all on function public.identity_lock_seconds(integer) from public, anon, authenticated;

grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.release_rate_limit(text) to service_role;
grant execute on function public.register_identity_failure(text, text, integer, integer) to service_role;
grant execute on function public.inspect_identity_lock(text, text) to service_role;
grant execute on function public.clear_identity_failures(text, text) to service_role;
grant execute on function public.purge_defense_counters() to service_role;
