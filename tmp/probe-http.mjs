import { loadEnvFile } from 'node:process'
try { loadEnvFile() } catch {}
const { createApp } = await import('../server/app.js')
const { authHeaders, buildStaffUser, createPrismaDouble, loginStaff } = await import('../tests/integration/helpers/staffSession.js')
const { listen } = await import('../tests/integration/helpers/supabaseTestClient.js')
const { getSupabaseAdmin } = await import('../server/lib/supabaseAdmin.js')

const staff = await buildStaffUser({ email: 'probe-perfiles@plu.test' })
const target = listen(
  createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: getSupabaseAdmin(),
    env: { ...process.env, AUTH_SECRET: 'probe-secret-abcdefghijklmnop', APP_URL: 'http://localhost:5173' },
  }),
)
try {
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  for (const kind of ['bank_transfer', 'mercado_pago']) {
    const r = await fetch(`${target.url}/api/payment-profiles?kind=${kind}`, { headers: authHeaders(cookie) })
    console.log(kind, r.status, await r.text())
  }
} catch (e) {
  console.log('PROBE THREW', e)
} finally {
  await target.close()
}
process.exit(0)
