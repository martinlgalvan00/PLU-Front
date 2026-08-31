import { loadEnvFile } from 'node:process'
try { loadEnvFile() } catch {}
const { getSupabaseAdmin } = await import('../server/lib/supabaseAdmin.js')
const { getPrisma } = await import('../server/lib/prisma.js')
const { requireSupabaseClient } = await import('../server/lib/supabaseRpc.js')
const { createSupabasePaymentProfileRepository } = await import('../server/modules/payments/supabasePaymentProfileRepository.js')
const { isPaymentProfileSecretsKeyConfigured } = await import('../server/modules/payments/paymentProfileSecrets.js')

console.log('--- getPrisma() ---')
try { const p = getPrisma(); console.log('prisma:', p ? 'ok' : String(p)) } catch (e) { console.log('prisma THREW:', e.message) }

console.log('--- repo.list ---')
try {
  const repo = createSupabasePaymentProfileRepository(requireSupabaseClient(getSupabaseAdmin()), { env: process.env })
  for (const kind of ['bank_transfer', 'mercado_pago']) {
    const profiles = await repo.list({ kind, activeOnly: true })
    console.log(kind, '->', JSON.stringify(profiles))
  }
  console.log('secretsKeyConfigured:', isPaymentProfileSecretsKeyConfigured(process.env))
} catch (e) {
  console.log('LIST THREW:', e.status, e.message, e.details ?? '')
  console.log(e.stack)
}
process.exit(0)
