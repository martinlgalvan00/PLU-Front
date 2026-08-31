import { loadEnvFile } from 'node:process'
try { loadEnvFile() } catch {}
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('url set:', Boolean(url), 'key set:', Boolean(key))
const client = createClient(url, key, { auth: { persistSession: false } })

for (const kind of ['bank_transfer', 'mercado_pago']) {
  const res = await client.from('payment_profiles').select('*').eq('kind', kind).order('name')
  console.log('---', kind, '--- error:', JSON.stringify(res.error), 'rows:', res.data?.length)
  if (res.data?.[0]) console.log('cols:', Object.keys(res.data[0]).join(','))
}
