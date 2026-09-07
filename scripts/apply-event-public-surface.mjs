/**
 * Aplica solo la RPC de superficie pública, sin empujar el resto de migraciones.
 * `db query` no acepta varios statements en un prepared statement.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

try {
  loadEnvFile(resolve(root, '.env'))
} catch {
  // vars ya en el entorno
}

const dbUrl = process.env.SUPABASE_DATABASE_URL?.trim()
if (!dbUrl) {
  console.error('Falta SUPABASE_DATABASE_URL.')
  process.exit(1)
}

const file = resolve(root, 'supabase/migrations/20261103100000_event_public_surface.sql')
const sql = readFileSync(file, 'utf8')
const fn = sql.match(/create or replace function[\s\S]*?\$\$;/i)?.[0]
if (!fn) {
  console.error('No se encontró la función en la migración.')
  process.exit(1)
}

const statements = [
  fn,
  'revoke all on function public.staff_merge_event_public_surface(text, jsonb) from public, anon, authenticated;',
  'grant execute on function public.staff_merge_event_public_surface(text, jsonb) to service_role;',
]

const supabaseCli = resolve(root, 'node_modules/supabase/dist/supabase.js')

for (const statement of statements) {
  const result = spawnSync(
    process.execPath,
    [supabaseCli, 'db', 'query', '--db-url', dbUrl, statement],
    { cwd: root, stdio: 'inherit', env: process.env },
  )
  if (result.status) process.exit(result.status)
}

console.log('staff_merge_event_public_surface aplicada.')
