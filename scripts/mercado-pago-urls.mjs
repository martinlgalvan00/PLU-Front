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

const OK = 'OK'
const FAIL = 'FALLA'
const WARN = 'AVISO'

const ENVIRONMENTS = [
  {
    name: 'DEV (preview rama dev)',
    appUrl: 'https://maximal-strcorp-fn7n-git-dev-martinlgalvan00s-projects.vercel.app',
    mpEnv: 'sandbox',
  },
  {
    name: 'PROD',
    appUrl: 'https://www.powerliftingunited.ar',
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

  const hook = await probe(webhookUrl(env.appUrl), {
    method: 'POST',
    body: JSON.stringify({ type: 'payment', data: { id: 'url-smoke' } }),
  })

  // 400/401 de la app = ruta viva y pública. 401/403/302 de Vercel Protection = bloqueo.
  if (hook.status === 400 || hook.status === 401 || hook.status === 422) {
    ok(`/api/payments/webhook/mercadopago alcanzable (HTTP ${hook.status}; firma inválida esperada)`)
  } else if (hook.status === 302 || hook.status === 403) {
    fail(
      `/api/payments/webhook/mercadopago protegido (HTTP ${hook.status}).`,
      'Desactivá Deployment Protection en el preview o agregá bypass para esta ruta.',
    )
  } else if (hook.status === 0) {
    fail(`/api/payments/webhook/mercadopago sin respuesta.`, hook.error)
  } else {
    warn(
      `/api/payments/webhook/mercadopago → HTTP ${hook.status}`,
      'Revisá logs; se esperaba 400 por payload/firma incompletos.',
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
