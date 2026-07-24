function asHttpsUrl(value) {
  const candidate = String(value ?? '').trim()
  if (!candidate) return ''
  if (/^https?:\/\//i.test(candidate)) return candidate.replace(/\/+$/, '')
  return `https://${candidate.replace(/\/+$/, '')}`
}

export function resolveDeploymentAppUrl(env = process.env) {
  const explicit = String(env.APP_URL ?? '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  if (env.VERCEL_ENV === 'production') {
    return asHttpsUrl(env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL)
  }

  return asHttpsUrl(env.VERCEL_BRANCH_URL ?? env.VERCEL_URL ?? env.VERCEL_PROJECT_PRODUCTION_URL)
}

export function buildRuntimeDatabaseUrl(supabaseDatabaseUrl) {
  const url = new URL(supabaseDatabaseUrl)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DATABASE_URL debe ser una conexión PostgreSQL válida.')
  }
  url.searchParams.set('schema', 'plu_prisma')
  return url.toString()
}

export function applyDeploymentEnvironmentDefaults(env = process.env) {
  const appUrl = resolveDeploymentAppUrl(env)
  if (appUrl) {
    env.APP_URL ||= appUrl
    env.API_URL ||= appUrl
  }

  if (!env.DATABASE_URL?.trim() && env.SUPABASE_DATABASE_URL?.trim()) {
    env.DATABASE_URL = buildRuntimeDatabaseUrl(env.SUPABASE_DATABASE_URL)
  }

  return env
}
