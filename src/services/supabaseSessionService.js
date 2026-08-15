import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * Canjea el hash de magic link emitido por Express para que el staff tenga la
 * sesión Supabase que exigen las RPC protegidas. `generateLink` devuelve un
 * `hashed_token`, no el OTP legible: Supabase lo acepta exclusivamente en
 * `token_hash`.
 */
export async function establishSupabaseSession(
  supabaseAuth,
  { configured = isSupabaseConfigured, getClient = getSupabaseClient } = {},
) {
  if (!supabaseAuth || !configured) return { ok: false, reason: 'unavailable' }

  try {
    const supabase = await getClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: supabaseAuth.tokenHash,
      type: 'magiclink',
    })

    if (error) {
      console.warn('No se pudo establecer la sesión de Supabase.', error.message)
      return { ok: false, reason: 'verification_failed' }
    }

    return { ok: true }
  } catch (error) {
    console.warn('No se pudo establecer la sesión de Supabase.', error)
    return { ok: false, reason: 'request_failed' }
  }
}
