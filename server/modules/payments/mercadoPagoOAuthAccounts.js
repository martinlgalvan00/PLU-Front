import { HttpError } from '../../lib/errors.js'
import {
  MERCADO_PAGO_OAUTH_REFRESH_WINDOW_DAYS,
  getMercadoPagoOAuthConfig,
  refreshMercadoPagoAccessToken,
} from './mercadoPagoOAuth.js'
import { createSupabasePaymentProfileRepository } from './supabasePaymentProfileRepository.js'

/**
 * Renueva el token de una cuenta vinculada por OAuth.
 *
 * El refresh token rota: el que se usa queda muerto. Por eso la escritura es
 * condicional al ciphertext leído (ver `storeRefreshedMercadoPagoTokens`): si
 * otra corrida renovó en el medio, esta no pisa tokens buenos con unos que MP
 * ya invalidó, y devuelve la cuenta como quedó.
 *
 * `invalid_grant` = la autorización ya no sirve (el vendedor la revocó, cambió
 * la contraseña, pasaron los 180 días). No hay reintento posible: la cuenta
 * queda en `needs_reconnect` y el panel pide volver a conectarla.
 */
export async function refreshMercadoPagoOAuthProfile({
  client,
  profileId,
  env = process.env,
  fetchImpl,
  now = new Date(),
  repository = null,
}) {
  const repo = repository ?? createSupabasePaymentProfileRepository(client, { env })
  const profile = await repo.findById(profileId, { includeSecrets: true })
  if (!profile || profile.kind !== 'mercado_pago') {
    throw new HttpError(404, 'Cuenta de cobro no encontrada.')
  }
  if (profile.config?.connection !== 'oauth') {
    throw new HttpError(400, 'Solo las cuentas vinculadas con Mercado Pago se renuevan solas.')
  }
  const oauth = getMercadoPagoOAuthConfig(env)
  if (!oauth.available) {
    throw new HttpError(503, 'La vinculación con Mercado Pago no está configurada.', {
      code: 'MP_OAUTH_NOT_CONFIGURED',
      missing: oauth.missing,
    })
  }

  const secrets = repo.decryptOAuthSecrets(profile)
  if (!secrets?.refreshToken) {
    const marked = await repo.markMercadoPagoNeedsReconnect(profileId, {
      reason: 'Sin refresh token: la autorización no incluyó offline_access.',
      now,
    })
    return { profile: marked ?? profile, refreshed: false, needsReconnect: true }
  }

  let tokens
  try {
    tokens = await refreshMercadoPagoAccessToken(oauth, secrets.refreshToken, { fetchImpl, now })
  } catch (error) {
    if (error?.details?.code === 'MP_OAUTH_INVALID_GRANT') {
      const marked = await repo.markMercadoPagoNeedsReconnect(profileId, {
        reason: error.details.providerMessage || error.message,
        now,
      })
      return { profile: marked ?? profile, refreshed: false, needsReconnect: true }
    }
    throw error
  }

  // Si MP devolviera otro usuario algo está muy mal: no se guarda.
  if (tokens.userId && profile.config?.collectorId && tokens.userId !== profile.config.collectorId) {
    throw new HttpError(409, 'Mercado Pago devolvió otra cuenta al renovar.', {
      code: 'MP_OAUTH_ACCOUNT_MISMATCH',
    })
  }

  const stored = await repo.storeRefreshedMercadoPagoTokens(profileId, {
    previousCiphertext: profile.secretsCiphertext,
    tokens,
    now,
  })
  if (!stored) {
    return { profile: await repo.findById(profileId), refreshed: false, raced: true }
  }
  return { profile: stored, refreshed: true }
}

/** ¿Le toca renovar? Dentro de la ventana previa al vencimiento, o sin fecha. */
export function isMercadoPagoOAuthRefreshDue(profile, now = new Date()) {
  if (profile?.kind !== 'mercado_pago' || profile.config?.connection !== 'oauth') return false
  if (profile.config?.status === 'needs_reconnect') return false
  const expiresAt = profile.config?.expiresAt ? Date.parse(profile.config.expiresAt) : NaN
  if (!Number.isFinite(expiresAt)) return true
  return expiresAt - now.getTime() <= MERCADO_PAGO_OAUTH_REFRESH_WINDOW_DAYS * 86_400_000
}

/**
 * Corrida del job: renueva las cuentas activas que entran en la ventana. Una
 * cuenta que falla no frena a las demás.
 */
export async function runMercadoPagoOAuthRefresh({
  client,
  env = process.env,
  fetchImpl,
  now = new Date(),
} = {}) {
  if (!getMercadoPagoOAuthConfig(env).available) return { status: 'disabled' }
  if (!client) throw new Error('Supabase no está configurado para renovar cuentas de Mercado Pago.')

  const repo = createSupabasePaymentProfileRepository(client, { env })
  const profiles = await repo.list({ kind: 'mercado_pago', activeOnly: true })
  const due = profiles.filter((profile) => isMercadoPagoOAuthRefreshDue(profile, now))

  const result = { checked: profiles.length, due: due.length, refreshed: 0, needsReconnect: [], failed: [] }
  for (const profile of due) {
    try {
      const outcome = await refreshMercadoPagoOAuthProfile({
        client,
        profileId: profile.id,
        env,
        fetchImpl,
        now,
        repository: repo,
      })
      if (outcome.refreshed) result.refreshed += 1
      if (outcome.needsReconnect) result.needsReconnect.push({ id: profile.id, name: profile.name })
    } catch (error) {
      result.failed.push({ id: profile.id, name: profile.name, error: error?.message ?? 'error' })
    }
  }
  return result
}
