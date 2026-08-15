#!/usr/bin/env node
/**
 * mercado-pago-urls.mjs — PLU ARG
 *
 * Imprime las URLs DEV/PROD para el panel de Mercado Pago y verifica que
 * health, ready y el endpoint de webhook respondan en público (sin Deployment
 * Protection bloqueante).
 *
 * Uso:
 *   npm run mercado-pago:urls
 */

import { OFFICIAL_APP_URL } from '../server/lib/deploymentEnvironment.js'

const OK = 'OK'
const FAIL = 'FALLA'
const WARN = 'AVISO'

/**
 * PROD sale de `OFFICIAL_APP_URL` y no de una constante propia.
 *
 * Cuando este script tenia la URL escrita a mano, verificaba `www` mientras el
 * backend le mandaba a Mercado Pago el apex: el chequeo daba OK con produccion
 * rota, porque comprobaba una URL distinta de la que se usaba de verdad. Atarlo
 * al valor del runtime es lo que hace que el script pueda detectar el problema
 * en vez de taparlo.
 */
const ENVIRONMENTS = [
  {
    name: 'DEV (preview rama dev)',
    appUrl: 'https://plu-git-dev-martinlgalvan00s-projects.vercel.app',
    mpEnv: 'sandbox',
  },
  {
    name: 'PROD',
    appUrl: OFFICIAL_APP_URL,
    mpEnv: 'production',
  },
]

let problems = 0
let warnings = 0

const ok = (msg) => console.log(`  ${OK}    ${msg}`)
const fail = (msg, hint) => {
  problems += 1
  console.log(`  ${FAIL}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}
const warn = (msg, hint) => {
  warnings += 1
  console.log(`  ${WARN}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}

function webhookUrl(appUrl) {
  return `${appUrl.replace(/\/+$/, '')}/api/payments/webhook/mercadopago`
}

async function probe(url, { method = 'GET', body } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body,
      signal: controller.signal,
      redirect: 'manual',
    })
    const text = await response.text().catch(() => '')
    return { status: response.status, text, location: response.headers.get('location') }
  } catch (error) {
    return {
      status: 0,
      text: '',
      error: error?.name === 'AbortError' ? 'Timeout (15s)' : error?.message,
    }
  } finally {
    clearTimeout(timer)
  }
}

console.log('\n=== URLs Mercado Pago · PLU ARG ===\n')
console.log('Copiar/pegar en el panel MP (Tu integración → Webhooks)\n')

for (const env of ENVIRONMENTS) {
  console.log(`${env.name}`)
  console.log(`  APP_URL / API_URL: ${env.appUrl}`)
  console.log(`  Webhook:          ${webhookUrl(env.appUrl)}`)
  console.log(`  MERCADO_PAGO_ENV: ${env.mpEnv}`)
  console.log(`  Eventos:          payment, subscription_preapproval, subscription_authorized_payment`)
  console.log('')
}

console.log('back_urls (las arma el backend; no van en el panel)')
console.log('  Afiliación/inscripción: {APP_URL}/registro?payment=success|pending|failure&order=...')
console.log('  Entradas:               {APP_URL}/eventos?payment=success|pending|failure&order=...')
console.log('  Suscripciones:          {APP_URL}')
console.log('')

console.log('Verificación pública\n')

for (const env of ENVIRONMENTS) {
  console.log(env.name)

  const health = await probe(`${env.appUrl}/api/health`)
  if (health.status === 200) {
    ok(`/api/health → ${health.status}`)
  } else if (health.status >= 300 && health.status < 400 && health.status !== 302) {
    // Mismo diagnóstico que el webhook, pero se detecta antes: si /api/health
    // redirige, la base entera está mal y no hace falta llegar al webhook.
    fail(
      `/api/health redirige (HTTP ${health.status} → ${health.location ?? 'destino desconocido'}).`,
      'Esa base no sirve la API: usá el destino final como APP_URL/API_URL.',
    )
  } else if (health.status === 401 || health.status === 403 || health.status === 302) {
    fail(
      `/api/health bloqueado (HTTP ${health.status}).`,
      'Deployment Protection impediría también el webhook de Mercado Pago.',
    )
  } else {
    fail(`/api/health → ${health.status || health.error || 'sin respuesta'}`)
  }

  const ready = await probe(`${env.appUrl}/api/ready`)
  if (ready.status === 200) {
    ok(`/api/ready → ${ready.status}`)
  } else {
    warn(`/api/ready → ${ready.status || ready.error || 'sin respuesta'}`, 'Prisma/Supabase pueden no estar listos.')
  }

  const hookUrl = `${webhookUrl(env.appUrl)}?data.id=url-smoke&type=payment`
  const hook = await probe(hookUrl, {
    method: 'POST',
    body: JSON.stringify({
      id: 'url-smoke',
      type: 'payment',
      action: 'payment.updated',
      data: { id: 'url-smoke' },
    }),
  })

  // 400/401/422 de la app = ruta viva y pública (firma/secret incompletos).
  // 403 con body de nuestra API también puede ser allowlist; 302 típico de Protection.
  const hookBody = String(hook.text ?? '').slice(0, 160)
  /**
   * Un redirect es una falla, no un aviso.
   *
   * Mercado Pago espera 200/201 en la `notification_url` y **no sigue
   * redirects**: un 308 del apex hacia `www` —invisible en un navegador— le
   * cuenta como entrega fallida. Eso tuvo `payment_integration_events` en cero
   * durante toda la vida del sistema, con pagos reales acreditados por el
   * Brick, así que nada se veía roto hasta que hacía falta un cobro de
   * acreditación diferida, un contracargo o un reembolso.
   *
   * Se chequea antes que el resto de los casos porque un 3xx de Deployment
   * Protection y uno de dominio se ven igual en el status y se distinguen por
   * el destino.
   */
  if (hook.status >= 300 && hook.status < 400 && hook.status !== 302) {
    fail(
      `/api/payments/webhook/mercadopago redirige (HTTP ${hook.status} → ${hook.location ?? 'destino desconocido'}).`,
      'Mercado Pago no sigue redirects: cada notificación se da por fallida. Usá el destino final como APP_URL/API_URL.',
    )
  } else if (hook.status === 400 || hook.status === 401 || hook.status === 422) {
    ok(`/api/payments/webhook/mercadopago alcanzable (HTTP ${hook.status})`)
  } else if (hook.status === 503) {
    warn(
      `/api/payments/webhook/mercadopago alcanzable pero falla en runtime (HTTP 503)`,
      'En Vercel Preview revisá MERCADO_PAGO_WEBHOOK_SECRET, ACCESS_TOKEN y logs de la Function.',
    )
  } else if (hook.status === 302) {
    fail(
      `/api/payments/webhook/mercadopago protegido (HTTP ${hook.status}).`,
      'Desactivá Deployment Protection en el preview o agregá bypass para esta ruta.',
    )
  } else if (hook.status === 403) {
    fail(
      `/api/payments/webhook/mercadopago rechazado (HTTP 403). ${hookBody}`,
      'Si el body dice "Solicitud no confiable", el allowlist no matcheó el path. Si está vacío, revisá Protection/WAF.',
    )
  } else if (hook.status === 0) {
    fail(`/api/payments/webhook/mercadopago sin respuesta.`, hook.error)
  } else {
    warn(
      `/api/payments/webhook/mercadopago → HTTP ${hook.status} ${hookBody}`,
      'Revisá logs; se esperaba 400/401 por payload/firma incompletos.',
    )
  }

  console.log('')
}

console.log('Variables Vercel (setear en el team del proyecto: martinlgalvan00s-projects)\n')
console.log('  Preview/DEV: PAYMENTS_MOCK=false, MERCADO_PAGO_ENV=sandbox, keys TEST + webhook secret TEST')
console.log('  Production:  PAYMENTS_MOCK=false, MERCADO_PAGO_ENV=production, keys PROD + webhook secret PROD')
console.log('  APP_URL/API_URL explícitas según tabla de arriba (docs/PAYMENTS_OPERATIONS.md)\n')

if (problems > 0) {
  console.log(`=== ${problems} problema(s) bloqueante(s)${warnings ? `, ${warnings} aviso(s)` : ''} ===\n`)
  process.exit(1)
}

console.log(
  warnings > 0
    ? `=== URLs OK con ${warnings} aviso(s) ===\n`
    : '=== URLs Mercado Pago OK ===\n',
)
process.exit(0)
