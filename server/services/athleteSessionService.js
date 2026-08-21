import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '../lib/errors.js'
import { athleteSessionCache } from '../lib/sessionCache.js'
import { assertSupabaseResult, requireSupabaseClient } from '../lib/supabaseRpc.js'
import { hashToken } from './sessionService.js'

export const ATHLETE_SESSION_COOKIE_NAME = 'plu_athlete_session'
const DURATION_MS = 30 * 24 * 60 * 60 * 1000

function secureCookieEnabled(env = process.env) {
  if (env.SESSION_COOKIE_SECURE === 'true') return true
  if (env.SESSION_COOKIE_SECURE === 'false') return false
  return env.NODE_ENV === 'production'
}

function hashOptional(value) {
  return value ? createHash('sha256').update(String(value)).digest('hex') : null
}

export function getAthleteSessionCookieOptions(env = process.env) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookieEnabled(env),
    path: '/',
    maxAge: DURATION_MS,
  }
}

export function getClearAthleteSessionCookieOptions(env = process.env) {
  const options = getAthleteSessionCookieOptions(env)
  delete options.maxAge
  return options
}

export async function createAthleteSession({ client, athleteId, req, now = new Date() }) {
  requireSupabaseClient(client)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + DURATION_MS)
  assertSupabaseResult(
    await client.from('athlete_sessions').insert({
      athlete_id: athleteId,
      token_hash: hashToken(token),
      expires_at: expiresAt.toISOString(),
      user_agent: req.get('user-agent') ?? null,
      ip_hash: hashOptional(req.ip),
    }),
    'No se pudo crear la sesion del atleta.',
  )
  return { token, expiresAt }
}

/**
 * Cada cuánto se refresca `last_seen_at`. Antes se escribía en CADA request
 * autenticado del atleta: /mi-cuenta repregunta su snapshot por polling, así que
 * era un UPDATE por minuto por pestaña abierta, y el dato sólo se usa para saber
 * si la sesión sigue viva -- una precisión de minutos alcanza y sobra.
 *
 * El corte se decide contra el valor guardado y no contra un contador en
 * memoria: así vale igual entre instancias de la Function, que no comparten
 * proceso.
 */
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000

export async function readAthleteSession({ client, token, now = new Date() }) {
  requireSupabaseClient(client)
  if (!token) return null
  const tokenHash = hashToken(token)

  const cached = athleteSessionCache.get(tokenHash, now.getTime())
  if (cached) return cached

  const row = assertSupabaseResult(
    await client
      .from('athlete_sessions')
      .select('id, athlete_id, expires_at, revoked_at, last_seen_at')
      .eq('token_hash', tokenHash)
      .maybeSingle(),
    'No se pudo validar la sesion del atleta.',
  )
  if (!row || row.revoked_at || new Date(row.expires_at) <= now) return null

  const lastSeenAt = row.last_seen_at ? Date.parse(row.last_seen_at) : Number.NaN
  const stale = Number.isNaN(lastSeenAt) || now.getTime() - lastSeenAt >= LAST_SEEN_REFRESH_MS
  if (stale) {
    void client.from('athlete_sessions').update({ last_seen_at: now.toISOString() }).eq('id', row.id)
  }

  const resolved = { session: row, athleteId: row.athlete_id }
  athleteSessionCache.set(tokenHash, resolved, {
    ownerKey: row.athlete_id,
    now: now.getTime(),
  })
  return resolved
}

export async function requireAthleteSession({ client, req }) {
  const result = await readAthleteSession({
    client,
    token: req.cookies?.[ATHLETE_SESSION_COOKIE_NAME],
  })
  if (!result) throw new HttpError(401, 'No autenticado.')
  return result
}

export async function revokeAthleteSession({ client, token, now = new Date() }) {
  requireSupabaseClient(client)
  if (!token) return
  const tokenHash = hashToken(token)
  // Antes de la escritura: un fallo del update deja la sesión fuera de la caché
  // y el próximo request la relee, en vez de mantenerla viva por lo que dure el
  // TTL después de un logout que el atleta ya vio confirmado.
  athleteSessionCache.invalidateKey(tokenHash)
  assertSupabaseResult(
    await client
      .from('athlete_sessions')
      .update({ revoked_at: now.toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null),
    'No se pudo cerrar la sesion.',
  )
}

/**
 * Corta la caché de todas las sesiones de un atleta.
 *
 * El corte real en la base lo hace la RPC de cambio de contraseña, que revoca
 * `athlete_sessions` en la misma transacción (ver 20260716000000:
 * `athlete_sessions` no está expuesta a PostgREST, así que la baja no puede
 * hacerse con un update suelto desde acá). Esta función es la contraparte en
 * memoria: sin ella, una contraseña cambiada dejaba las sesiones viejas
 * resolviendo desde la caché por lo que durara el TTL.
 */
export function forgetAthleteSessionCache(athleteId) {
  athleteSessionCache.invalidateOwner(athleteId)
}
