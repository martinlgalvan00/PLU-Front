#!/usr/bin/env node
/**
 * mercado-pago-doctor.mjs — PLU ARG
 *
 * Smoke de conectividad del Access Token de Mercado Pago. No crea preferencias
 * ni cobra: solo valida que el token exista, no sea placeholder y responda
 * contra /users/me.
 *
 * Uso:
 *   npm run mercado-pago:doctor
 *   npm run mercado-pago:urls   # webhooks DEV/PROD + reachability
 */

import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch {
  // Las variables también pueden venir del entorno del proceso (CI).
}

const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i
const OK = 'OK'
const FAIL = 'FALLA'

let problems = 0
const fail = (msg, hint) => {
  problems += 1
  console.log(`  ${FAIL}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}
const ok = (msg) => console.log(`  ${OK}    ${msg}`)

console.log('\n=== Diagnóstico Mercado Pago · PLU ARG ===\n')
console.log('Credenciales')

// Las dos credenciales se evalúan antes de cortar: son problemas
// independientes, y salir en la primera obligaba a correr el doctor dos veces
// para enterarse de la segunda.
const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
let tokenUsable = true

if (!accessToken) {
  tokenUsable = false
  fail(
    'MERCADO_PAGO_ACCESS_TOKEN no está definida.',
    'Cargala en GitHub Secrets / Vercel (sandbox o prod).',
  )
} else if (PLACEHOLDER_PATTERN.test(accessToken) || accessToken === 'TEST-xxxx') {
  tokenUsable = false
  fail(
    'MERCADO_PAGO_ACCESS_TOKEN parece un placeholder.',
    'Reemplazá TEST-xxxx / replace… por un Access Token real de sandbox.',
  )
} else {
  ok('Access Token presente')
}

// El secreto del webhook se chequea acá y no en el arranque porque su ausencia
// no rompe nada visible: el checkout funciona, el atleta paga, y recién la
// notificación muere con 503. La afiliación queda pendiente para siempre y
// nadie se entera hasta que el socio reclama que no le llegó la credencial.
const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
if (!webhookSecret) {
  fail(
    'MERCADO_PAGO_WEBHOOK_SECRET no está definida.',
    'Sin esto ningún pago se acredita: el webhook responde 503 y la afiliación nunca se activa.',
  )
} else if (PLACEHOLDER_PATTERN.test(webhookSecret)) {
  fail(
    'MERCADO_PAGO_WEBHOOK_SECRET parece un placeholder.',
    'Copiá la clave secreta del panel de MP > Webhooks.',
  )
} else {
  ok('Secreto de webhook presente')
}

console.log('\nAPI')
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 10_000)

if (!tokenUsable) {
  console.log('  --    Sin token usable: no se consulta la API.')
  clearTimeout(timer)
  console.log(`\n=== ${problems} problema(s) bloqueante(s) ===\n`)
  process.exit(1)
}

try {
  const response = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: controller.signal,
  })
  const body = await response.json().catch(() => ({}))

  if (response.status === 401 || response.status === 403) {
    fail(`Token rechazado (HTTP ${response.status}).`, body?.message ?? '')
  } else if (!response.ok) {
    fail(`Mercado Pago respondió HTTP ${response.status}.`, body?.message ?? '')
  } else {
    const label = body?.nickname || body?.email || body?.id || 'cuenta'
    ok(`Conectado como ${label}`)
  }
} catch (error) {
  fail(
    'No se pudo contactar la API de Mercado Pago.',
    error?.name === 'AbortError' ? 'Timeout (10s).' : error?.message,
  )
} finally {
  clearTimeout(timer)
}

console.log(
  problems === 0
    ? '\n=== Mercado Pago OK ===\n'
    : `\n=== ${problems} problema(s) bloqueante(s) ===\n`,
)
process.exit(problems === 0 ? 0 : 1)
