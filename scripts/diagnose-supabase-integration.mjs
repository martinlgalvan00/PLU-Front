#!/usr/bin/env node
/**
 * Diagnóstico de integración Supabase para PLU ARG.
 * No imprime secretos: solo estado de env, tablas, RPCs y migraciones pendientes.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { findMissingEnvironment, parsePendingMigrations, resolveSupabaseBinary } from './bootstrap-all.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

try {
  loadEnvFile(resolve(projectRoot, '.env'))
} catch {
  console.error('No se pudo leer .env')
  process.exit(1)
}

const missing = findMissingEnvironment()
if (missing.length) {
  console.error(`Faltan variables: ${missing.join(', ')}`)
  process.exit(1)
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function count(table) {
  const { error, count: total } = await admin.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return total ?? 0
}

async function rpcExists(name, args) {
  const { error } = await admin.rpc(name, args)
  if (error && /Could not find the function/i.test(error.message)) return { exists: false, error: error.message }
  return { exists: true, note: error?.message?.slice(0, 120) ?? 'ok' }
}

const report = {
  project: process.env.SUPABASE_URL,
  env: 'ok',
  tables: {},
  rpcs: {},
  migrations: {},
}

report.tables.events = await count('events')
report.tables.athletes = await count('athletes')
report.tables.memberships = await count('memberships')
report.tables.event_registrations = await count('event_registrations')

report.rpcs.register_athlete_v2 = await rpcExists('register_athlete_v2', {
  p_form: {},
  p_password_hash: 'x',
})
report.rpcs.create_competition_registration_v2 = await rpcExists('create_competition_registration_v2', {
  p_athlete_id: '00000000-0000-4000-8000-000000000001',
  p_event_slug: 'x',
  p_division: 'Open',
  p_category: 'Raw',
  p_bodyweight_kg: null,
  p_payment_method: 'mercado_pago',
  p_idempotency_key: '0123456789abcdef',
})

const binary = resolveSupabaseBinary()
const supabaseJs = resolve(projectRoot, 'node_modules/supabase/dist/supabase.js')
if (!binary && !existsSync(supabaseJs)) {
  report.migrations.status = 'cli_missing'
} else {
  const args = binary
    ? ['db', 'push', '--db-url', process.env.SUPABASE_DATABASE_URL, '--include-all', '--dry-run']
    : [supabaseJs, 'db', 'push', '--db-url', process.env.SUPABASE_DATABASE_URL, '--include-all', '--dry-run']
  const executable = binary ?? process.execPath
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    env: process.env,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const pending = parsePendingMigrations(output)
  report.migrations.status = result.status === 0 || pending.length >= 0 ? 'checked' : 'error'
  report.migrations.pending = pending
  report.migrations.exitCode = result.status
  if (result.status !== 0 && pending.length === 0) {
    report.migrations.hint = output.split('\n').filter(Boolean).slice(-8)
  }
}

console.log(JSON.stringify(report, null, 2))
if (report.migrations.pending?.length) process.exitCode = 2
