function asHttpsUrl(value) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return ''
  if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, '')
  return `https://${candidate.replace(/\/+$/, '')}`
}

export const OFFICIAL_APP_URL = 'https://powerliftingunited.ar'

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function isProductionRuntime(env) {
  return env.VERCEL_ENV === 'production' || isTruthyFlag(env.APP_PRODUCTION)
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

export function buildRuntimeDatabaseUrl(supabaseDatabaseUrl, env = process.env) {
  const url = new URL(supabaseDatabaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL debe ser una conexión PostgreSQL válida.')
  }
  url.searchParams.set('schema', 'plu_prisma')

  if (isServerlessRuntime(env)) {
    url.searchParams.set('connection_limit', '1')
    // Sin esto, agotado el pool la request queda colgada 10 s (default) antes
    // de fallar; con maxDuration de 60 s eso se come el presupuesto entero.
    url.searchParams.set('pool_timeout', '15')
    if (url.port === '6543') url.searchParams.set('pgbouncer', 'true')
  }

  return url.toString()
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
