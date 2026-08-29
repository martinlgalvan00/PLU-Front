import { HttpError } from '../../lib/errors.js'
import { createPaymentProviderAdapter } from './createPaymentProviderAdapter.js'
import { decryptPaymentProfileSecrets } from './paymentProfileSecrets.js'
import { createSupabasePaymentProfileRepository } from './supabasePaymentProfileRepository.js'

/**
 * Credenciales efectivas para cobrar con MP en un evento.
 * Sin perfil → cuenta global del env. Con perfil → secrets descifrados.
 */
export function credentialsFromMercadoPagoProfile(profile, env = process.env) {
  if (!profile || profile.kind !== 'mercado_pago') return null
  if (!profile.secretsCiphertext) {
    throw new HttpError(503, 'El perfil de Mercado Pago no tiene credenciales guardadas.')
  }
  const secrets = decryptPaymentProfileSecrets(profile.secretsCiphertext, env)
  return {
    profileId: profile.id,
    accessToken: secrets?.accessToken ?? '',
    webhookSecret: secrets?.webhookSecret ?? '',
    publicKey: profile.config?.publicKey ?? '',
    collectorId: profile.config?.collectorId ?? '',
  }
}

export async function loadMercadoPagoProfileCredentials(client, profileId, env = process.env) {
  if (!client || !profileId) return null
  const profile = await createSupabasePaymentProfileRepository(client).findById(profileId, {
    includeSecrets: true,
  })
  return credentialsFromMercadoPagoProfile(profile, env)
}

/**
 * Public key efectiva para el Brick: perfil del evento o env global.
 * Nunca expone access token ni webhook secret.
 */
export async function resolveMercadoPagoPublicKeyForProfileId(
  client,
  profileId,
  env = process.env,
) {
  const globalKey = String(env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? '').trim() || null
  if (!profileId || !client) return globalKey
  try {
    const credentials = await loadMercadoPagoProfileCredentials(client, profileId, env)
    return credentials?.publicKey || globalKey
  } catch {
    return globalKey
  }
}

/**
 * Adapter MP para una orden/evento. Membership (sin event) usa el global.
 */
export async function createMercadoPagoAdapterForProfileId(
  client,
  profileId,
  { env = process.env, timeout, store } = {},
) {
  if (!profileId) return createPaymentProviderAdapter({ env, timeout, store })
  const credentials = await loadMercadoPagoProfileCredentials(client, profileId, env)
  if (!credentials) return createPaymentProviderAdapter({ env, timeout, store })
  return createPaymentProviderAdapter({ env, timeout, store, credentials })
}

/**
 * Todos los secretos de webhook conocidos (env + perfiles activos) para
 * verificar firmas multi-cuenta en la misma URL.
 */
export async function listMercadoPagoWebhookSecrets(client, env = process.env) {
  const secrets = []
  const global = String(env.MERCADO_PAGO_WEBHOOK_SECRET ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  for (const secret of global) {
    secrets.push({ secret, profileId: null, accessToken: env.MERCADO_PAGO_ACCESS_TOKEN })
  }

  if (!client) return secrets

  try {
    const profiles = await createSupabasePaymentProfileRepository(client).list({
      kind: 'mercado_pago',
      activeOnly: true,
      includeSecrets: true,
    })
    for (const profile of profiles) {
      if (!profile.secretsCiphertext) continue
      try {
        const decrypted = decryptPaymentProfileSecrets(profile.secretsCiphertext, env)
        if (decrypted?.webhookSecret) {
          secrets.push({
            secret: decrypted.webhookSecret,
            profileId: profile.id,
            accessToken: decrypted.accessToken,
            publicKey: profile.config?.publicKey,
            collectorId: profile.config?.collectorId,
          })
        }
      } catch {
        // Perfil con ciphertext ilegible: no tumba el webhook global.
      }
    }
  } catch {
    // Sin tabla / sin permiso: solo env.
  }

  return secrets
}

/**
 * Verifica la firma contra cada secreto conocido y devuelve el candidato que
 * matcheó (para usar su access token al GET /payments/:id).
 */
export function pickWebhookCredentials(secrets, verifyFn) {
  let lastError = null
  for (const candidate of secrets) {
    try {
      verifyFn(candidate.secret)
      return candidate
    } catch (error) {
      lastError = error
      if (error?.status !== 401) throw error
    }
  }
  if (lastError) throw lastError
  throw new HttpError(401, 'Firma de webhook invalida.')
}

/**
 * GET /payments/:id contra cada cuenta conocida hasta que una responda.
 * Usado por recovery/revalidation cuando el webhook quedó diferido y no
 * recordó qué perfil firmó la notificación.
 */
export async function getPaymentAcrossMercadoPagoAccounts(client, resourceId, env = process.env) {
  const secrets = await listMercadoPagoWebhookSecrets(client, env)
  if (secrets.length === 0) {
    const adapter = createPaymentProviderAdapter({ env })
    return { payment: await adapter.getPayment(resourceId), adapter, profileId: null }
  }

  let lastError = null
  const tried = new Set()
  for (const candidate of secrets) {
    const tokenKey = candidate.accessToken || '__env__'
    if (tried.has(tokenKey)) continue
    tried.add(tokenKey)
    const adapter = candidate.accessToken
      ? createPaymentProviderAdapter({
          env,
          credentials: {
            accessToken: candidate.accessToken,
            webhookSecret: candidate.secret,
            publicKey: candidate.publicKey,
            collectorId: candidate.collectorId,
          },
        })
      : createPaymentProviderAdapter({ env })
    try {
      const payment = await adapter.getPayment(resourceId)
      return { payment, adapter, profileId: candidate.profileId ?? null }
    } catch (error) {
      lastError = error
      // 404 = esa cuenta no tiene el pago; probar la siguiente.
      if (Number(error?.status) !== 404) continue
    }
  }
  throw lastError ?? new HttpError(404, 'Pago no encontrado en ninguna cuenta configurada.')
}
