/**
 * One-shot: aplica migraciones Supabase pendientes (sin Prisma generate).
 */
import { spawnSync } from 'node:child_process'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { parsePendingMigrations, scrubSecrets } from './bootstrap-all.mjs'

try {
  loadEnvFile()
} catch {
  // ignore
}

const projectRoot = resolve(fileURLToPath(import.meta.url), '../..')
const supabaseCli = resolve(projectRoot, 'node_modules/supabase/dist/supabase.js')
const url = process.env.SUPABASE_DATABASE_URL?.trim()

if (!url) {
  console.error('Falta SUPABASE_DATABASE_URL en .env')
  process.exit(1)
}

function run(args) {
  const printable = args.map((arg, i) => (args[i - 1] === '--db-url' ? 'postgresql://***' : arg))
  console.log('>', 'supabase', printable.join(' '))
  const result = spawnSync(process.execPath, [supabaseCli, ...args], {
    encoding: 'utf8',
    env: process.env,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) process.stdout.write(scrubSecrets(output))
  if (result.status) {
    throw new Error(`supabase ${args[0]} ${args[1]} falló (exit ${result.status}).`)
  }
  return output
}

const dryRun = run(['db', 'push', '--db-url', url, '--include-all', '--dry-run'])
const pending = parsePendingMigrations(dryRun)
if (pending.length === 0) {
  console.log('Supabase ya está actualizado; no se aplicaron cambios.')
} else {
  console.log(`Migraciones pendientes: ${pending.join(', ')}`)
  run(['db', 'push', '--db-url', url, '--include-all', '--yes'])
  const postDryRun = run(['db', 'push', '--db-url', url, '--include-all', '--dry-run'])
  const stillPending = parsePendingMigrations(postDryRun)
  if (stillPending.length) {
    console.error(`Supabase conserva migraciones pendientes: ${stillPending.join(', ')}.`)
    process.exit(1)
  }
  console.log('OK: migraciones Supabase aplicadas.')
}

try {
  unlinkSync(fileURLToPath(import.meta.url))
} catch {
  // ignore
}
