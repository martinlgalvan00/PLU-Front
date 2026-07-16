import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '../lib/errors.js'
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

export async function readAthleteSession({ client, token, now = new Date() }) {
  requireSupabaseClient(client)
  if (!token) return null
  const row = assertSupabaseResult(
    await client
      .from('athlete_sessions')
      .select('id, athlete_id, expires_at, revoked_at')
      .eq('token_hash', hashToken(token))
      .maybeSingle(),
    'No se pudo validar la sesion del atleta.',
  )
  if (!row || row.revoked_at || new Date(row.expires_at) <= now) return null
  void client.from('athlete_sessions').update({ last_seen_at: now.toISOString() }).eq('id', row.id)
  return { session: row, athleteId: row.athlete_id }
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
  assertSupabaseResult(
    await client
      .from('athlete_sessions')
      .update({ revoked_at: now.toISOString() })
      .eq('token_hash', hashToken(token))
      .is('revoked_at', null),
    'No se pudo cerrar la sesion.',
  )
}
