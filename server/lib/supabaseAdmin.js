import { createClient } from '@supabase/supabase-js'

const PROOF_BUCKET = 'ticket-payment-proofs'
/** Logo / foto de cada evento (migración 20261205100000). Público de lectura. */
const EVENT_LOGO_BUCKET = 'event-logos'
/** Media de landing (hero) — migración 20261219100000. Público de lectura. */
const EVENT_MEDIA_BUCKET = 'event-media'
const STAFF_APPLICATION_BUCKET = 'staff-application-documents'

let adminClient = null

export function requireSupabaseAdminConfig(env = process.env) {
  const url = env.SUPABASE_URL?.trim()
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url || !serviceRoleKey) return null

  return { url, serviceRoleKey }
}

export function isSupabaseAdminConfigured(env = process.env) {
  return Boolean(requireSupabaseAdminConfig(env))
}

export function getSupabaseAdmin() {
  const config = requireSupabaseAdminConfig()
  if (!config) return null

  if (!adminClient) {
    adminClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { 'X-Client-Info': 'plu-front-server-admin' },
      },
    })
  }
  return adminClient
}

export { EVENT_LOGO_BUCKET, EVENT_MEDIA_BUCKET, PROOF_BUCKET, STAFF_APPLICATION_BUCKET }
