import { createClient } from '@supabase/supabase-js'

const PROOF_BUCKET = 'ticket-payment-proofs'

let adminClient = null

function resolveSupabaseUrl() {
  return process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
}

export function isSupabaseAdminConfigured() {
  return Boolean(resolveSupabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function getSupabaseAdmin() {
  if (!isSupabaseAdminConfigured()) return null
  if (!adminClient) {
    adminClient = createClient(resolveSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return adminClient
}

export { PROOF_BUCKET }
