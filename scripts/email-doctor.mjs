#!/usr/bin/env node
/**
 * email-doctor.mjs � PLU ARG
 *
 * Diagn�stico de la infraestructura de emails. Existe por un caso real: la
 * cuenta ten�a `BREVO_SENDER_EMAIL=soporte@pluarg.com`, un remitente sin
 * validar. La API de Brevo aceptaba el env�o con **201** y lo rechazaba
 * despu�s, de forma asincr�nica. Es decir: los logs dec�an 'sent', el c�digo
 * no ten�a de qu� agarrarse, y no se entregaba un solo mail.
 *
 * Este script chequea justamente lo que no se ve desde el c�digo:
 *   1. Que la API key sea v�lida.
 *   2. Que el remitente configurado est� validado o su dominio autenticado.
 *   3. Cu�nta cuota diaria queda.
 *   4. Si hay eventos de error recientes en la cuenta.
 *   5. Qu� templates del cat�logo est�n cargados.
 *
 * Uso:
 *   npm run email:doctor
 *   npm run email:doctor -- --send tu@email.com   (env�a una prueba real)
 */

import { loadEnvFile } from 'node:process'
import { createBrevoAdapter } from '../server/modules/notifications/brevoAdapter.js'
import { applyDeploymentEnvironmentDefaults } from '../server/lib/deploymentEnvironment.js'
import { describeCatalog } from '../server/modules/notifications/emailCatalog.js'
import { renderEmail } from '../server/modules/notifications/emailTemplates.js'

try {
  loadEnvFile()
} catch {
  // Las variables tambi�n pueden venir del entorno del proceso.
}

// En Vercel APP_URL/API_URL se derivan de las variables del sistema. El
// diagn�stico debe evaluar el mismo entorno efectivo que usa la API.
applyDeploymentEnvironmentDefaults(process.env)

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

console.log('\n=== Diagn�stico de emails � PLU ARG ===\n')

// ------------------------------------------------------------- 1. credencial
console.log('Credenciales')
if (!apiKey) {
  fail('BREVO_API_KEY no est� definida.', 'Sin esto no se env�a nada: todo queda en status skipped.')
} else if (!senderEmail) {
  fail('BREVO_SENDER_EMAIL no est� definida.')
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
  console.log(`         plan: ${plan.type} � cr�ditos restantes: ${restante ?? '?'}`)
  if (plan.type === 'free') {
    warn(
      'Plan free: 300 emails por d�a.',
      'Un anuncio a toda la base puede agotar la cuota. Los excedentes fallan con error de cuota.',
    )
  }
}

// --------------------------------------------------------------- 2. remitente
console.log('\nRemitente')
const senders = await brevo('/senders')
const verified = (senders.body.senders ?? [])
  .map((s) => s.email?.toLowerCase())
  .filter(Boolean)
const domains = (await brevo('/senders/domains')).body.domains ?? []
const authenticated = domains
  .filter((d) => d.authenticated)
  .map((d) => (d.domain_name ?? d.domain)?.toLowerCase())
  .filter(Boolean)
const senderDomain = senderEmail?.split('@')[1]?.toLowerCase()

if (verified.includes(senderEmail?.toLowerCase())) {
  ok(`${senderEmail} est� validado como remitente.`)
} else if (authenticated.includes(senderDomain)) {
  ok(`El dominio ${senderDomain} est� autenticado (SPF/DKIM).`)
} else {
  fail(
    `${senderEmail} NO est� validado y su dominio tampoco est� autenticado.`,
    'Brevo va a aceptar el env�o con 201 y rechazarlo despu�s. No se entrega nada.',
  )
  console.log(`         Remitentes validados: ${verified.join(', ') || '(ninguno)'}`)
  console.log(`         Dominios autenticados: ${authenticated.join(', ') || '(ninguno)'}`)
  console.log('         Soluci�n: Brevo ? Senders & IP ? Domains ? autenticar el dominio por DNS.')
}

// ------------------------------------------------------------ 3. errores recientes
console.log('\nEventos de error recientes')
const events = await brevo('/smtp/statistics/events?limit=50&event=error')
const recent = events.body.events ?? []
if (recent.length === 0) {
  ok('Sin errores registrados.')
} else {
  warn(`${recent.length} env�o(s) rechazados por Brevo.`)
  const motivos = new Map()
  for (const e of recent) motivos.set(e.reason ?? '?', (motivos.get(e.reason ?? '?') ?? 0) + 1)
  for (const [motivo, cantidad] of motivos) console.log(`         ${cantidad}x  ${motivo}`)
}

// ----------------------------------------------------------------- 4. webhook
console.log('\nWebhook de entrega')
const expectedWebhook = expectedWebhookUrl()
if (!webhookToken) {
  fail(
    'BREVO_WEBHOOK_TOKEN no est� definido.',
    'Sin webhook no hay forma de enterarse de rebotes ni de rechazos asincr�nicos.',
  )
} else if (!expectedWebhook) {
  fail(
    'API_URL/APP_URL no apunta a una URL HTTPS p�blica.',
    'Definila con el origen p�blico de la API antes de registrar el webhook de Brevo.',
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

// ---------------------------------------------------------------- 5. cat�logo
console.log('\nCat�logo de templates')
const catalog = describeCatalog(process.env)
const conTemplate = catalog.filter((c) => c.delivery === 'brevo_template')
ok(`${catalog.length} tipos declarados � ${conTemplate.length} con template de Brevo � ${catalog.length - conTemplate.length} con fallback HTML del repo`)
console.log('         (el fallback es v�lido: el email igual sale, con la identidad institucional)')

// ------------------------------------------------------------- 6. env�o real
const sendIndex = process.argv.indexOf('--send')
if (sendIndex !== -1) {
  const to = process.argv[sendIndex + 1]
  console.log(`\nEnv�o de prueba a ${to}`)
  if (!to?.includes('@')) {
    fail('Falta la direcci�n: npm run email:doctor -- --send tu@email.com')
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
      ok(`Aceptado por Brevo � messageId ${result.messageId}`)
      warn(
        'El 201 no garantiza entrega.',
        'Verific� en 30 s con: npm run email:doctor (mir� "Eventos de error recientes").',
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
