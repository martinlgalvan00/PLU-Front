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
import { getPaymentsRuntimeStatus } from '../server/modules/payments/createPaymentProviderAdapter.js'

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

function checkRuntime() {
  console.log('Runtime')
  const runtime = getPaymentsRuntimeStatus(process.env)
  const mercadoPagoEnv = String(process.env.MERCADO_PAGO_ENV ?? '').trim().toLowerCase()
  const apiUrl = String(process.env.API_URL ?? '').trim()

  if (runtime.provider !== 'mercado_pago') {
    fail('PAYMENTS_MOCK esta activo.', 'Para probar el ciclo real configura PAYMENTS_MOCK=false.')
  } else {
    ok('Proveedor Mercado Pago activo (sin mock).')
  }

  if (mercadoPagoEnv !== 'sandbox') {
    fail(
      `MERCADO_PAGO_ENV debe ser sandbox en DEV (actual: ${mercadoPagoEnv || 'ausente'}).`,
      'No uses credenciales ni entorno productivo para pruebas.',
    )
  } else {
    ok('Entorno Sandbox activo.')
  }

  if (!runtime.publicKeyConfigured) {
    fail('VITE_MERCADO_PAGO_PUBLIC_KEY no esta definida.', 'El Payment Brick no puede inicializarse.')
  } else {
    ok('Public Key de Mercado Pago presente.')
  }

  try {
    const parsedApiUrl = new URL(apiUrl)
    const isPublicHttps = parsedApiUrl.protocol === 'https:'
      && !['localhost', '127.0.0.1'].includes(parsedApiUrl.hostname)
    if (!isPublicHttps) {
      fail(
        'API_URL debe ser una URL HTTPS publica para el flujo end-to-end.',
        'Usa el preview estable de Vercel DEV o un tunel HTTPS para recibir el webhook.',
      )
    } else {
      ok(`API_URL publica configurada (${parsedApiUrl.origin}).`)
    }
  } catch {
    fail(
      'Falta una API_URL HTTPS publica.',
      'Sin notification_url publica Mercado Pago no puede acreditar el pago mediante webhook.',
    )
  }
}

console.log('\n=== Diagnóstico Mercado Pago · PLU ARG ===\n')
checkRuntime()
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
// Dejar que fetch/undici cierre sus handles antes de terminar. `process.exit()`
// inmediato dispara una aserción de libuv en Node 24 sobre Windows aunque el
// diagnóstico haya salido OK.
process.exitCode = problems === 0 ? 0 : 1
