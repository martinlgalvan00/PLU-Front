import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'

function redact(u) {
  const x = new URL(u)
  return {
    host: x.host,
    path: x.pathname,
    schema: x.searchParams.get('schema'),
    user: `${x.username.slice(0, 12)}…`,
  }
}

const url = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.VITE_SUPABASE_ANON_KEY
const viteUrl = process.env.VITE_SUPABASE_URL
const dbUrl = process.env.SUPABASE_DATABASE_URL
const prismaUrl = process.env.DATABASE_URL

console.log('urls', {
  supabase: url,
  vite: viteUrl,
  sameOrigin: url === viteUrl,
  hasRestSuffix: url?.includes('/rest/v1'),
  db: redact(dbUrl),
  prisma: redact(prismaUrl),
})

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
const browser = createClient(viteUrl, anon, { auth: { persistSession: false, autoRefreshToken: false } })

const adminRes = await admin.from('events').select('id', { head: true, count: 'exact' }).limit(1)
console.log('admin_events', { ok: !adminRes.error, count: adminRes.count, error: adminRes.error?.message })

const anonRes = await browser.from('events').select('id', { head: true, count: 'exact' }).eq('published', true)
console.log('anon_events', { ok: !anonRes.error, count: anonRes.count, error: anonRes.error?.message })

const rls = await browser.rpc('list_athlete_admin_data')
console.log('rls_blocks_sensitive_rpc', { blocked: Boolean(rls.error), error: rls.error?.message?.slice(0, 120) })

const prisma = new PrismaClient()
const rows = await prisma.$queryRaw`
  SELECT current_database() AS db, current_schema() AS schema,
         (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = current_schema()) AS tables
`
console.log('prisma', { ok: true, rows })
await prisma.$disconnect()
