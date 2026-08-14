#!/usr/bin/env node
/**
 * purge-test-athletes.mjs — PLU ARG
 *
 * Borra atletas de prueba (y en cascada sus inscripciones, afiliaciones,
 * ordenes de pago y check-ins) usando la RPC `delete_athlete`, la misma que
 * usa el panel para el borrado individual. No toca nada que no matchee un
 * patron de dato de prueba explicito.
 *
 * Por default corre en dry-run: solo lista los candidatos. Nada se borra
 * hasta pasar --confirm.
 *
 * Uso:
 *   npm run purge:test-athletes                # dry-run, solo lista
 *   npm run purge:test-athletes -- --confirm    # borra de verdad
 */

import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'

try {
  loadEnvFile()
} catch {
  // Las variables tambien pueden venir del entorno del proceso (CI).
}

const argv = process.argv.slice(2)
const confirm = argv.includes('--confirm')

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Nombres/emails que arrancan con estas palabras, o dominios de correo
// desechables/de prueba conocidos, o documentos obviamente dummy.
const NAME_PATTERN = /^(test|demo|prueba|sample|tmp|qa|asdf?|foo|bar)\b/i
const EMAIL_LOCAL_PATTERN = /^(test|demo|prueba|fake|qa)[\W_]/i
const FAKE_EMAIL_DOMAINS = [
  'example.com', 'example.org', 'example.net',
  'test.com', 'fake.com', 'mailinator.com', 'yopmail.com',
  'guerrillamail.com', '10minutemail.com', 'temp-mail.org',
]
const DUMMY_DOCUMENTS = new Set([
  '00000000', '11111111', '22222222', '33333333', '44444444',
  '55555555', '66666666', '77777777', '88888888', '99999999',
  '12345678', '87654321',
])

function isFakeAthlete(row) {
  const name = String(row.full_name ?? '')
  const email = String(row.email ?? '').toLowerCase()
  const [local, domain] = email.split('@')
  const document = String(row.document_id ?? '')

  if (NAME_PATTERN.test(name.trim())) return 'nombre'
  if (local && EMAIL_LOCAL_PATTERN.test(local)) return 'email'
  if (domain && FAKE_EMAIL_DOMAINS.includes(domain)) return 'dominio de email'
  if (DUMMY_DOCUMENTS.has(document)) return 'documento dummy'
  return null
}

const { data: athletes, error } = await admin
  .from('athletes')
  .select('id, full_name, email, document_id, status, created_at')
  .order('created_at', { ascending: false })

if (error) {
  console.error(`No se pudo leer athletes: ${error.message}`)
  process.exit(1)
}

const candidates = athletes
  .map((row) => ({ row, reason: isFakeAthlete(row) }))
  .filter((entry) => entry.reason)

if (candidates.length === 0) {
  console.log('No se encontraron atletas que matcheen patrones de datos de prueba.')
  process.exit(0)
}

console.log(`${candidates.length} atleta(s) candidato(s) a borrado:\n`)
for (const { row, reason } of candidates) {
  console.log(`- ${row.full_name}  <${row.email}>  doc:${row.document_id}  [${reason}]  id:${row.id}  creado:${row.created_at}`)
}

if (!confirm) {
  console.log('\nDry-run: no se borro nada. Reviza la lista de arriba y volve a correr con --confirm para borrar de verdad.')
  process.exit(0)
}

console.log('\nBorrando (RPC delete_athlete, cascada de inscripciones/afiliaciones/ordenes/check-ins)...\n')

let ok = 0
let failed = 0
for (const { row } of candidates) {
  const { data, error: rpcError } = await admin.rpc('delete_athlete', {
    p_athlete_id: row.id,
    p_actor: 'script:purge-test-athletes',
  })
  if (rpcError) {
    console.error(`X ${row.full_name} <${row.email}>: ${rpcError.message}`)
    failed += 1
    continue
  }
  const removed = data?.removed ?? {}
  console.log(
    `+ ${row.full_name} <${row.email}> — `
    + `inscripciones:${removed.registrations ?? 0} afiliaciones:${removed.memberships ?? 0} `
    + `ordenes:${removed.paymentOrders ?? 0} check-ins:${removed.checkIns ?? 0}`,
  )
  ok += 1
}

console.log(`\nListo: ${ok} borrado(s), ${failed} fallido(s).`)
if (failed > 0) process.exitCode = 1
