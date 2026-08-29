#!/usr/bin/env node
/**
 * Aplica migraciones remotas (mismo criterio que bootstrap-all) y optimiza
 * Storage: recompress de retratos + borrado de objetos huérfanos.
 *
 * Uso:
 *   npm run supabase:optimize -- --dry-run
 *   npm run supabase:optimize
 *   npm run supabase:optimize -- --skip-push
 *   npm run supabase:optimize -- --skip-recompress --skip-orphans
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

try {
  loadEnvFile(resolve(root, '.env'))
} catch {
  // vars ya en el entorno
}

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_PUSH = process.argv.includes('--skip-push')
const SKIP_RECOMPRESS = process.argv.includes('--skip-recompress')
const SKIP_ORPHANS = process.argv.includes('--skip-orphans')

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const dbUrl = process.env.SUPABASE_DATABASE_URL?.trim()

if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

function runNode(scriptArgs) {
  const display = scriptArgs.map((arg) =>
    String(arg).startsWith('postgresql://') || String(arg).startsWith('postgres://')
      ? 'postgresql://***'
      : arg,
  )
  console.log(`\n> node ${display.join(' ')}`)
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(`Falló node ${display.join(' ')} (exit ${result.status})`)
  }
}

function runSupabase(args, { capture = false } = {}) {
  const display = args.map((arg) =>
    String(arg).startsWith('postgresql://') || String(arg).startsWith('postgres://')
      ? 'postgresql://***'
      : arg,
  )
  console.log(`\n> npx supabase ${display.join(' ')}`)
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ''}\n${result.stderr ?? ''}` : ''
    throw new Error(`Falló supabase ${display.join(' ')} (exit ${result.status})\n${detail}`)
  }
  return capture ? `${result.stdout ?? ''}\n${result.stderr ?? ''}` : ''
}

function parsePendingMigrations(output = '') {
  return [...output.matchAll(/[•]\s+(\d{14}_[^\r\n]+\.sql)/g)].map((match) => match[1])
}

function pushMigrations() {
  if (!dbUrl) {
    console.warn(
      'Sin SUPABASE_DATABASE_URL: no se puede hacer db push. Configurala o corré `npx supabase link` + `db push --linked`.',
    )
    return false
  }

  const dryRun = runSupabase(
    ['db', 'push', '--db-url', dbUrl, '--include-all', '--dry-run'],
    { capture: true },
  )
  const pending = parsePendingMigrations(dryRun)
  if (pending.length === 0) {
    console.log('Supabase ya está actualizado; no hay migraciones pendientes.')
    return true
  }

  console.log(`Migraciones pendientes: ${pending.join(', ')}`)
  if (DRY_RUN) {
    console.log('Dry-run: no se aplican migraciones.')
    return true
  }

  runSupabase(['db', 'push', '--db-url', dbUrl, '--include-all', '--yes'])

  const post = runSupabase(
    ['db', 'push', '--db-url', dbUrl, '--include-all', '--dry-run'],
    { capture: true },
  )
  const still = parsePendingMigrations(post)
  if (still.length) {
    throw new Error(`Siguen pendientes: ${still.join(', ')}`)
  }
  console.log('Migraciones aplicadas.')
  return true
}

async function purgeOrphanObjects(admin, { dryRun, bucket, referenced }) {
  const { data: folders, error: listError } = await admin.storage.from(bucket).list('', {
    limit: 1000,
  })
  if (listError) throw new Error(`${bucket}: ${listError.message}`)

  let orphanFiles = 0
  let orphanBytes = 0
  const toRemove = []

  for (const entry of folders ?? []) {
    const name = entry.name
    if (!name) continue

    if (entry.id && (entry.metadata || name.includes('.'))) {
      if (!referenced.has(name)) {
        toRemove.push(name)
        orphanFiles += 1
        orphanBytes += entry.metadata?.size ?? 0
      }
      continue
    }

    const { data: files, error: filesError } = await admin.storage.from(bucket).list(name, {
      limit: 100,
    })
    if (filesError) {
      console.warn(`! no se pudo listar ${bucket}/${name}: ${filesError.message}`)
      continue
    }
    for (const file of files ?? []) {
      if (!file.name) continue
      const path = `${name}/${file.name}`
      if (referenced.has(path)) continue
      toRemove.push(path)
      orphanFiles += 1
      orphanBytes += file.metadata?.size ?? 0
    }
  }

  console.log(
    `\nHuérfanos en ${bucket}: ${orphanFiles} archivos (~${Math.round(orphanBytes / 1024)} KB)`,
  )
  if (orphanFiles === 0) return

  if (dryRun) {
    console.log('Dry-run: ejemplos a borrar:', toRemove.slice(0, 10))
    return
  }

  for (let i = 0; i < toRemove.length; i += 50) {
    const chunk = toRemove.slice(i, i + 50)
    const { error: removeError } = await admin.storage.from(bucket).remove(chunk)
    if (removeError) console.warn(`! error borrando lote ${bucket}: ${removeError.message}`)
  }
  console.log(`Borrados ${toRemove.length} objetos huérfanos en ${bucket}.`)
}

async function purgeAllOrphans(admin, { dryRun }) {
  const { data: athletes, error: athletesError } = await admin
    .from('athletes')
    .select('photo_path')
    .not('photo_path', 'is', null)
  if (athletesError) throw new Error(athletesError.message)

  await purgeOrphanObjects(admin, {
    dryRun,
    bucket: 'athlete-photos',
    referenced: new Set((athletes ?? []).map((row) => row.photo_path).filter(Boolean)),
  })

  const { data: athleteOrders, error: athleteOrdersError } = await admin
    .from('athlete_payment_orders')
    .select('payment_proof_path')
    .not('payment_proof_path', 'is', null)
  if (athleteOrdersError) throw new Error(athleteOrdersError.message)

  await purgeOrphanObjects(admin, {
    dryRun,
    bucket: 'athlete-payment-proofs',
    referenced: new Set(
      (athleteOrders ?? []).map((row) => row.payment_proof_path).filter(Boolean),
    ),
  })

  const { data: ticketOrders, error: ticketOrdersError } = await admin
    .from('ticket_orders')
    .select('payment_proof_path')
    .not('payment_proof_path', 'is', null)
  if (ticketOrdersError) {
    console.warn(`! ticket_orders: ${ticketOrdersError.message}`)
  } else {
    await purgeOrphanObjects(admin, {
      dryRun,
      bucket: 'ticket-payment-proofs',
      referenced: new Set(
        (ticketOrders ?? []).map((row) => row.payment_proof_path).filter(Boolean),
      ),
    })
  }
}

console.log(`Optimize Supabase ${DRY_RUN ? '(dry-run)' : '(apply)'}`)

if (!SKIP_PUSH) {
  pushMigrations()
} else {
  console.log('Push de migraciones omitido (--skip-push).')
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

if (!SKIP_RECOMPRESS) {
  const args = [resolve(root, 'scripts/recompress-athlete-photos.mjs')]
  if (DRY_RUN) args.push('--dry-run')
  runNode(args)
} else {
  console.log('Recompress omitido (--skip-recompress).')
}

if (!SKIP_ORPHANS) {
  await purgeAllOrphans(admin, { dryRun: DRY_RUN })
} else {
  console.log('Limpieza de huérfanos omitida (--skip-orphans).')
}

console.log('\nListo.')
