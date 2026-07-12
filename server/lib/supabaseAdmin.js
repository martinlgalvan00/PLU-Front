import { createClient } from '@supabase/supabase-js'

const PROOF_BUCKET = 'ticket-payment-proofs'

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

export { PROOF_BUCKET }
