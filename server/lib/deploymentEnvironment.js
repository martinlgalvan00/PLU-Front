function asHttpsUrl(value) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return ''
  if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, '')
  return `https://${candidate.replace(/\/+$/, '')}`
}

/**
 * Dominio canonico, **con `www`**.
 *
 * El apex (`powerliftingunited.ar`) no sirve la aplicacion: responde `308
 * Permanent Redirect` hacia `www`. Para un navegador eso es invisible, pero
 * Mercado Pago exige que la `notification_url` conteste 200/201 y no sigue
 * redirects: con el apex, cada notificacion se daba por fallida.
 *
 * Ese era el motivo de que `payment_integration_events` estuviera en cero con
 * pagos reales acreditados. Los cobros con tarjeta funcionaban igual porque el
 * checkout embebido acredita contra la respuesta del Brick, asi que la falla
 * solo se manifestaba en lo que depende del webhook: acreditacion diferida
 * (transferencia, efectivo, cuotas pendientes), contracargos y reembolsos.
 *
 * `emailTemplates.js` ya usaba `www` para los assets, asi que la constante
 * tambien era inconsistente con el resto del sistema.
 */
export const OFFICIAL_APP_URL = 'https://www.powerliftingunited.ar'

/** Apex del dominio oficial. No sirve la aplicacion: redirige a `www`. */
const OFFICIAL_APEX_HOST = 'powerliftingunited.ar'

/**
 * Promueve el apex del dominio oficial a `www`.
 *
 * Corregir `OFFICIAL_APP_URL` no alcanza: `resolveApiUrl` lee `env.API_URL` y
 * `env.APP_URL` **antes** que el valor derivado del deployment, asi que una
 * variable de entorno cargada con el apex —el dominio que uno escribe de
 * memoria, y el que tenia esta misma constante— volveria a producir una
 * `notification_url` que redirige, con el mismo sintoma silencioso.
 *
 * Se normaliza el host y no se rechaza la URL: fallar el checkout porque falta
 * un `www` seria peor que la falla que se esta corrigiendo. Cualquier otro
 * dominio (previews de Vercel, tuneles locales) pasa intacto.
 */
export function normalizeOfficialHost(value) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return candidate

  try {
    const url = new URL(candidate)
    if (url.hostname === OFFICIAL_APEX_HOST) {
      url.hostname = `www.${OFFICIAL_APEX_HOST}`
      return url.toString().replace(/\/+$/, '')
    }
    return candidate
  } catch {
    // No es una URL absoluta: la validacion de quien llama se encarga.
    return candidate
  }
}

function isProductionRuntime(env) {
  return env.VERCEL_ENV === 'production'
}

export function resolveDeploymentAppUrl(env = process.env) {
  if (isProductionRuntime(env)) return OFFICIAL_APP_URL

  const explicit = String(env.APP_URL ?? '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  return asHttpsUrl(env.VERCEL_BRANCH_URL ?? env.VERCEL_URL ?? env.VERCEL_PROJECT_PRODUCTION_URL)
}

/**
 * En Vercel cada request concurrente puede aterrizar en una instancia nueva, y
 * cada instancia levanta su propio pool de Prisma. Con el default (`num_cpus * 2
 * + 1`, ~9 conexiones) bastan unas pocas decenas de instancias simultáneas para
 * agotar el límite de Postgres y que todo el staff empiece a ver
 * "Timed out fetching a new connection from the connection pool" -- justo en el
 * pico de check-in, que es cuando más instancias hay.
 *
 * Con `connection_limit=1` cada instancia usa una sola conexión y el paralelismo
 * lo absorbe el pooler de Supabase, que es el componente diseñado para eso.
 *
 * `pgbouncer=true` solo aplica al Transaction mode (puerto 6543): le dice a
 * Prisma que no use prepared statements, que ese modo no soporta. En Session
 * mode (5432) los prepared statements sí funcionan y desactivarlos sería
 * perder rendimiento sin motivo.
 */
function isServerlessRuntime(env) {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME)
}

/** Host del pooler de Supabase (Supavisor). 5432 = session, 6543 = transaction. */
export const POOLER_HOST = /\.pooler\.supabase\.com$/i

/**
 * Tope de conexiones para procesos de larga vida (`npm run dev:api`, un
 * contenedor, Prisma Studio) que entran por el Session mode del pooler.
 *
 * El Session mode tiene un `pool_size` de 15 **compartido por todo el
 * proyecto**, no por proceso. Prisma, sin `connection_limit`, abre
 * `num_cpus * 2 + 1` conexiones: una sola máquina de desarrollo se lleva casi
 * el cupo entero y el resto —migraciones, Studio, los scripts de `scripts/`,
 * otra persona del equipo— empieza a recibir
 * `FATAL: (EMAXCONNSESSION) max clients reached in session mode`.
 *
 * Además cada una de esas conexiones es un backend de Postgres vivo en una
 * instancia de 1 GB, ocioso la mayor parte del tiempo. Dos alcanzan para
 * desarrollar (una consulta en vuelo más una de reserva) y devuelven el resto
 * del cupo al proyecto.
 *
 * En serverless no aplica: ahí se usa Transaction mode con `connection_limit=1`.
 */
export const POOLER_SESSION_CONNECTION_LIMIT = 2

export function buildRuntimeDatabaseUrl(supabaseDatabaseUrl, env = process.env) {
  const url = new URL(supabaseDatabaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL debe ser una conexión PostgreSQL válida.')
  }
  url.searchParams.set('schema', 'plu_prisma')

  const isPooler = POOLER_HOST.test(url.hostname)

  if (isServerlessRuntime(env)) {
    // El Session mode (5432) le reserva a cada instancia una conexión de
    // Postgres mientras viva, aunque esté ociosa. En serverless las instancias
    // se multiplican con el tráfico y la base es NANO (`max_connections` 60):
    // el pico de check-in agota el cupo y Prisma empieza a fallar la primera
    // consulta de cada instancia nueva -- el sintoma es un 500 intermitente en
    // *todas* las rutas mientras PostgREST sigue respondiendo bien, porque no
    // pasa por Postgres directo. El Transaction mode devuelve la conexión al
    // terminar cada consulta, que es lo que corresponde acá.
    if (isPooler && url.port === '5432') url.port = '6543'
    url.searchParams.set('connection_limit', '1')
    // Sin esto, agotado el pool la request queda colgada 10 s (default) antes
    // de fallar; con maxDuration de 60 s eso se come el presupuesto entero.
    url.searchParams.set('pool_timeout', '15')
    // El default de Prisma son 5 s. Alcanzan de sobra con la función en la
    // región de la base (`regions: ["gru1"]` en vercel.json), pero un cold
    // start que además tenga que resolver DNS y negociar TLS se pasaba, y la
    // instancia nacía fallando.
    url.searchParams.set('connect_timeout', '10')
    if (url.port === '6543') url.searchParams.set('pgbouncer', 'true')
  } else if (isPooler) {
    // Proceso de larga vida contra el pooler compartido: se acota el pool para
    // no quedarse con el cupo de Session mode del proyecto entero
    // (ver POOLER_SESSION_CONNECTION_LIMIT). No se cambia el puerto: el Session
    // mode conserva los prepared statements y acá no hay instancias que se
    // multipliquen, que es lo que obliga al Transaction mode en serverless.
    url.searchParams.set('connection_limit', String(POOLER_SESSION_CONNECTION_LIMIT))
    url.searchParams.set('pool_timeout', '15')
    url.searchParams.set('connect_timeout', '10')
  }

  return url.toString()
}

/**
 * Normaliza una `DATABASE_URL` provista por el entorno.
 *
 * Vercel necesita `DATABASE_URL` seteada a mano para que `prisma generate` corra
 * en el build, y esa variable ganaba sobre la derivada: el runtime terminaba con
 * la URL cruda, sin `connection_limit` ni Transaction mode, que es exactamente
 * la configuración que agota la base. Se respeta el destino que puso el operador
 * y se corrigen solo los parámetros de pooling.
 */
export function normalizeRuntimeDatabaseUrl(databaseUrl, env = process.env) {
  try {
    return buildRuntimeDatabaseUrl(databaseUrl, env)
  } catch {
    // Si no es una URL que sepamos interpretar, se deja intacta: fallar el
    // arranque por no poder optimizar sería peor que no optimizar.
    return databaseUrl
  }
}

/**
 * URL sin los parámetros del pooler. `prisma migrate` abre transacciones largas
 * y usa sentencias que el Transaction mode del pooler no soporta, así que las
 * migraciones tienen que ir por la conexión directa aunque el runtime no.
 */
export function buildDirectDatabaseUrl(supabaseDatabaseUrl) {
  const url = new URL(supabaseDatabaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL debe ser una conexión PostgreSQL válida.')
  }
  url.searchParams.set('schema', 'plu_prisma')
  for (const param of ['connection_limit', 'pool_timeout', 'pgbouncer']) {
    url.searchParams.delete(param)
  }
  if (url.port === '6543') url.port = '5432'
  return url.toString()
}

export function applyDeploymentEnvironmentDefaults(env = process.env) {
  const appUrl = resolveDeploymentAppUrl(env)
  if (appUrl) {
    env.APP_URL ||= appUrl
    env.API_URL ||= appUrl
  }

  if (env.DATABASE_URL?.trim()) {
    env.DATABASE_URL = normalizeRuntimeDatabaseUrl(env.DATABASE_URL, env)
  }

  if (env.SUPABASE_DATABASE_URL?.trim()) {
    if (!env.DATABASE_URL?.trim()) {
      env.DATABASE_URL = buildRuntimeDatabaseUrl(env.SUPABASE_DATABASE_URL, env)
    }
    if (!env.DIRECT_DATABASE_URL?.trim()) {
      env.DIRECT_DATABASE_URL = buildDirectDatabaseUrl(env.SUPABASE_DATABASE_URL)
    }
  }

  return env
}
