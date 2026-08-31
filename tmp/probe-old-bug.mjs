import { loadEnvFile } from 'node:process'
try { loadEnvFile() } catch {}
const { applyDeploymentEnvironmentDefaults } = await import('../server/lib/deploymentEnvironment.js')
applyDeploymentEnvironmentDefaults(process.env)
const { getSupabaseAdmin } = await import('../server/lib/supabaseAdmin.js')
const { requireSupabaseClient } = await import('../server/lib/supabaseRpc.js')
const { createSupabasePaymentProfileRepository } = await import('../server/modules/payments/supabasePaymentProfileRepository.js')

// Reproduce el codigo PRE-fix: se pasaba la funcion, no el cliente.
try {
  const repo = createSupabasePaymentProfileRepository(requireSupabaseClient(getSupabaseAdmin), { env: process.env })
  await repo.list({ kind: 'bank_transfer', activeOnly: true })
  console.log('no error (unexpected)')
} catch (e) {
  console.log('OLD CODE THREW ->', e.constructor.name, '| status:', e.status, '| msg:', e.message)
}
process.exit(0)
