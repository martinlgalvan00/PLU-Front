import { env } from '../config/env.js'

export function assertBrowserSupabaseKeyIsPublic(key) {
  if (!key) return

  if (key.startsWith('sb_secret_')) {
    throw new Error('La clave privada de Supabase no puede usarse en el navegador.')
  }

  const [, payload] = key.split('.')
  if (!payload) return

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decodedPayload = JSON.parse(atob(normalizedPayload))
    if (decodedPayload?.role === 'service_role') {
      throw new Error('La clave service_role de Supabase no puede usarse en el navegador.')
    }
  } catch (error) {
    if (error.message.includes('Supabase')) throw error
  }
}

assertBrowserSupabaseKeyIsPublic(env.supabase.anonKey)

export const isSupabaseConfigured = env.supabase.configured

if (!isSupabaseConfigured && env.isDev) {
  console.warn(
    'Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
      'Las funciones que dependen de Supabase van a usar fallback local hasta que se configuren.',
  )
}

let supabaseClientPromise = null

/**
 * Singleton perezoso: @supabase/supabase-js pesa ~110 KB min y el browser sólo
 * lo necesita en acciones puntuales (canje OTP de staff, RPCs, subida de
 * comprobantes). El dynamic import lo mantiene fuera del chunk inicial;
 * la sesión persiste igual porque createClient usa localStorage al crearse.
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(env.supabase.url, env.supabase.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    )
  }
  return supabaseClientPromise
}
