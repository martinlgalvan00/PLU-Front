#!/usr/bin/env node
/**
 * email-doctor.mjs — PLU ARG
 *
 * Diagnóstico de la infraestructura de emails. Existe por un caso real: la
 * cuenta tenía `BREVO_SENDER_EMAIL=soporte@pluarg.com`, un remitente sin
 * validar. La API de Brevo aceptaba el envío con **201** y lo rechazaba
 * después, de forma asincrónica. Es decir: los logs decían 'sent', el código
 * no tenía de qué agarrarse, y no se entregaba un solo mail.
 *
 * Este script chequea justamente lo que no se ve desde el código:
 *   1. Que la API key sea válida.
 *   2. Que el remitente configurado esté validado o su dominio autenticado.
 *   3. Cuánta cuota diaria queda.
 *   4. Si hay eventos de error recientes en la cuenta.
 *   5. Qué templates del catálogo están cargados.
 *
 * Uso:
 *   npm run email:doctor
 *   npm run email:doctor -- --send tu@email.com   (envía una prueba real)
 */

import { loadEnvFile } from 'node:process'
import { createBrevoAdapter } from '../server/modules/notifications/brevoAdapter.js'
import { describeCatalog } from '../server/modules/notifications/emailCatalog.js'
import { renderEmail } from '../server/modules/notifications/emailTemplates.js'

try {
  loadEnvFile()
} catch {
  // Las variables también pueden venir del entorno del proceso.
}

const OK = '[32mOK[0m'
const WARN = '[33mAVISO[0m'
const FAIL = '[31mFALLA[0m'

let problems = 0
const fail = (msg, hint) => {
  problems += 1
  console.log(`  ${FAIL}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}
const warn = (msg, hint) => {
  console.log(`  ${WARN}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}
const ok = (msg) => console.log(`  ${OK}    ${msg}`)

const apiKey = process.env.BREVO_API_KEY?.trim()
const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim()
const webhookToken = process.env.BREVO_WEBHOOK_TOKEN?.trim()
const webhookBaseUrl = (
  process.env.API_URL ?? process.env.APP_URL ?? process.env.VITE_APP_URL ?? ''
).trim().replace(/\/+$/, '')
const headers = { accept: 'application/json', 'api-key': apiKey }

function expectedWebhookUrl() {
  if (!webhookToken || !webhookBaseUrl) return null
  try {
    const base = new URL(webhookBaseUrl)
    if (base.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(base.hostname)) return null
    const target = new URL('/api/emails/webhook/brevo', `${base.origin}/`)
    target.searchParams.set('token', webhookToken)
    return target.toString()
  } catch {
    return null
  }
}

function maskWebhookUrl(value) {
  return String(value).replace(/token=[^&]+/, 'token=***')
}

async function brevo(path) {
  const response = await fetch(`https://api.brevo.com/v3${path}`, { headers })
  return { status: response.status, body: await response.json().catch(() => ({})) }
}

console.log('\n=== Diagnóstico de emails · PLU ARG ===\n')

// ------------------------------------------------------------- 1. credencial
console.log('Credenciales')
if (!apiKey) {
  fail('BREVO_API_KEY no está definida.', 'Sin esto no se envía nada: todo queda en status skipped.')
} else if (!senderEmail) {
  fail('BREVO_SENDER_EMAIL no está definida.')
}

if (!apiKey) {
  console.log('\nNo se puede seguir sin la API key.\n')
  process.exit(1)
}

const account = await brevo('/account')
if (account.status !== 200) {
  fail(`La API key fue rechazada (HTTP ${account.status}).`, account.body?.message ?? '')
  process.exit(1)
}
ok(`Cuenta "${account.body.companyName ?? '?'}" (${account.body.email})`)

const plan = account.body.plan?.find((p) => p.type === 'free') ?? account.body.plan?.[0]
if (plan) {
  const restante = plan.creditsType === 'sendLimit' ? plan.credits : plan.credits
  console.log(`         plan: ${plan.type} · créditos restantes: ${restante ?? '?'}`)
  if (plan.type === 'free') {
    warn(
      'Plan free: 300 emails por día.',
      'Un anuncio a toda la base puede agotar la cuota. Los excedentes fallan con error de cuota.',
    )
  }
}

// --------------------------------------------------------------- 2. remitente
console.log('\nRemitente')
const senders = await brevo('/senders')
const verified = (senders.body.senders ?? []).map((s) => s.email.toLowerCase())
const domains = (await brevo('/senders/domains')).body.domains ?? []
const authenticated = domains.filter((d) => d.authenticated).map((d) => d.domain.toLowerCase())
const senderDomain = senderEmail?.split('@')[1]?.toLowerCase()

if (verified.includes(senderEmail?.toLowerCase())) {
  ok(`${senderEmail} está validado como remitente.`)
} else if (authenticated.includes(senderDomain)) {
  ok(`El dominio ${senderDomain} está autenticado (SPF/DKIM).`)
} else {
  fail(
    `${senderEmail} NO está validado y su dominio tampoco está autenticado.`,
    'Brevo va a aceptar el envío con 201 y rechazarlo después. No se entrega nada.',
  )
  console.log(`         Remitentes validados: ${verified.join(', ') || '(ninguno)'}`)
  console.log(`         Dominios autenticados: ${authenticated.join(', ') || '(ninguno)'}`)
  console.log('         Solución: Brevo → Senders & IP → Domains → autenticar el dominio por DNS.')
}

// ------------------------------------------------------------ 3. errores recientes
console.log('\nEventos de error recientes')
const events = await brevo('/smtp/statistics/events?limit=50&event=error')
const recent = events.body.events ?? []
if (recent.length === 0) {
  ok('Sin errores registrados.')
} else {
  warn(`${recent.length} envío(s) rechazados por Brevo.`)
  const motivos = new Map()
  for (const e of recent) motivos.set(e.reason ?? '?', (motivos.get(e.reason ?? '?') ?? 0) + 1)
  for (const [motivo, cantidad] of motivos) console.log(`         ${cantidad}x  ${motivo}`)
}

// ----------------------------------------------------------------- 4. webhook
console.log('\nWebhook de entrega')
const expectedWebhook = expectedWebhookUrl()
if (!webhookToken) {
  fail(
    'BREVO_WEBHOOK_TOKEN no está definido.',
    'Sin webhook no hay forma de enterarse de rebotes ni de rechazos asincrónicos.',
  )
} else if (!expectedWebhook) {
  fail(
    'API_URL/APP_URL no apunta a una URL HTTPS pública.',
    'Definila con el origen público de la API antes de registrar el webhook de Brevo.',
  )
} else {
  const hooks = await brevo('/webhooks?type=transactional')
  if (hooks.status !== 200) {
    fail(`No se pudieron consultar los webhooks (HTTP ${hooks.status}).`, hooks.body?.message ?? '')
  } else {
    const configured = hooks.body.webhooks ?? []
    const matching = configured.find((hook) => hook.active !== false && hook.url === expectedWebhook)
    if (!matching) {
      fail(
        'No hay un webhook transaccional activo para esta API y este token.',
        `Cargar en Brevo: ${maskWebhookUrl(expectedWebhook)}`,
      )
    } else {
      ok('Webhook transaccional activo y apuntando a esta API.')
      console.log(`         ${maskWebhookUrl(matching.url)}`)
    }
  }
}

// ---------------------------------------------------------------- 5. catálogo
console.log('\nCatálogo de templates')
const catalog = describeCatalog(process.env)
const conTemplate = catalog.filter((c) => c.delivery === 'brevo_template')
ok(`${catalog.length} tipos declarados · ${conTemplate.length} con template de Brevo · ${catalog.length - conTemplate.length} con fallback HTML del repo`)
console.log('         (el fallback es válido: el email igual sale, con la identidad institucional)')

// ------------------------------------------------------------- 6. envío real
const sendIndex = process.argv.indexOf('--send')
if (sendIndex !== -1) {
  const to = process.argv[sendIndex + 1]
  console.log(`\nEnvío de prueba a ${to}`)
  if (!to?.includes('@')) {
    fail('Falta la dirección: npm run email:doctor -- --send tu@email.com')
  } else {
    try {
      const rendered = renderEmail(
        'welcome',
        { name: 'Prueba', accountUrl: `${process.env.APP_URL ?? process.env.VITE_APP_URL ?? ''}/mi-cuenta` },
        { appUrl: process.env.APP_URL ?? process.env.VITE_APP_URL ?? '' },
      )
      const result = await createBrevoAdapter({}).send({
        to,
        subject: '[PLU ARG] prueba de infraestructura de emails',
        htmlContent: rendered.htmlContent,
        textContent: rendered.textContent,
      })
      ok(`Aceptado por Brevo · messageId ${result.messageId}`)
      warn(
        'El 201 no garantiza entrega.',
        'Verificá en 30 s con: npm run email:doctor (mirá "Eventos de error recientes").',
      )
    } catch (error) {
      fail(`No se pudo enviar: ${error.message}`)
    }
  }
}

console.log(
  problems === 0
    ? '\n=== Sin problemas bloqueantes ===\n'
    : `\n=== ${problems} problema(s) bloqueante(s) ===\n`,
)
process.exitCode = problems === 0 ? 0 : 1
