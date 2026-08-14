#!/usr/bin/env node
/**
 * payments-trace.mjs — PLU ARG
 *
 * Reconstruye un cobro concreto. Es la herramienta de guardia: alguien reporta
 * "pague y no me figura la afiliacion" y esto contesta, en una pantalla, que
 * paso, hasta donde llego, donde se rompio (archivo y linea), por donde habia
 * entrado y que hay que hacer.
 *
 * Uso:
 *   npm run payments:trace -- <orderId>          # vida completa de la orden
 *   npm run payments:trace -- <requestId>        # que paso en esa operacion
 *   npm run payments:trace -- <email|documento>  # ordenes de ese atleta
 *   npm run payments:trace -- <orderId> --stack  # incluye stacks completos
 *   npm run payments:trace -- <orderId> --json
 */

import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { PRIMARY_ORGANIZATION_ID } from '../server/lib/organizations.js'
import {
  buildAthleteTimeline,
  buildOrderTimeline,
  buildRequestTimeline,
} from '../server/modules/payments/paymentForensics.js'

try {
  loadEnvFile()
} catch {
  // Las variables tambien pueden venir del entorno del proceso (CI).
}

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((arg) => arg.startsWith('--')))
const target = argv.find((arg) => !arg.startsWith('--'))
const asJson = flags.has('--json')
const withStack = flags.has('--stack')

if (!target) {
  console.error('Indicá un id de orden, un requestId, un email o un documento.')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const organizationId = PRIMARY_ORGANIZATION_ID
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SEVERITY_MARK = { success: '+', info: '·', warning: '!', danger: 'X' }

function line(text = '') {
  console.log(text)
}

function printTimeline(report) {
  const { order, kind, timeline, verdict, stageReached, failures, fulfillment } = report
  line('')
  line(`=== Traza de cobro · ${kind === 'ticket' ? 'entradas' : order.concept} ===`)
  line(`orden      ${order.id}`)
  line(`estado     ${order.status}  ·  ${order.amount} ${order.currency}  ·  ${order.method ?? order.provider}`)
  if (order.athlete) line(`atleta     ${order.athlete.full_name} (${order.athlete.email})`)
  line(`referencia ${order.reference ?? '—'}`)
  line(`avance     ${stageReached}`)
  if (fulfillment) line(`dominio    ${fulfillment.type}: ${fulfillment.status}`)
  line('')

  line('--- linea de tiempo ---')
  for (const item of timeline) {
    const mark = SEVERITY_MARK[item.severity] ?? '·'
    const gap = item.sincePrevious ? ` (+${item.sincePrevious})` : ''
    line(`${mark} ${item.at ?? '—'}  [${item.source}] ${item.event}${item.status ? ` → ${item.status}` : ''}${gap}`)
    const detail = Object.entries(item.detail ?? {}).filter(([, value]) => value !== null && value !== undefined)
    if (detail.length) {
      line(`      ${detail.map(([key, value]) => `${key}=${value}`).join('  ')}`)
    }
    if (item.failure) printFailure(item.failure, '      ')
  }

  line('')
  line('--- veredicto ---')
  line(`${verdict.state.toUpperCase()}: ${verdict.summary}`)
  if (verdict.action) line(`→ ${verdict.action}`)
  if (failures.length) {
    line('')
    line(`--- ${failures.length} falla(s) ---`)
    for (const failure of failures) {
      line(`${failure.at}  ${failure.event}`)
      printFailure(failure, '  ')
    }
  }
  line('')
}

function printFailure(failure, indent) {
  if (failure.message) line(`${indent}error: ${failure.message}`)
  // Donde se rompio: archivo y linea de codigo propio, no del SDK.
  if (failure.origin) {
    line(`${indent}donde: ${failure.origin.file}:${failure.origin.line}${failure.origin.function ? ` (${failure.origin.function})` : ''}`)
  }
  if (failure.entrypoint) line(`${indent}entro por: ${failure.entrypoint}`)
  if (failure.requestId) line(`${indent}requestId: ${failure.requestId}`)
  if (failure.provider?.code) {
    line(`${indent}proveedor: ${failure.provider.code}${failure.provider.detail ? ` — ${failure.provider.detail}` : ''}`)
  }
  if (failure.diagnosis) {
    line(`${indent}diagnostico: [${failure.diagnosis.code}] ${failure.diagnosis.title} (${failure.diagnosis.severity})`)
    for (const step of failure.diagnosis.fix ?? []) line(`${indent}  → ${step}`)
  }
  // Que venia pasando antes de romperse.
  if (failure.trail?.length) {
    line(`${indent}pasos previos:`)
    for (const crumb of failure.trail) {
      const context = Object.entries(crumb)
        .filter(([key]) => !['event', 'atMs'].includes(key))
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')
      line(`${indent}  +${crumb.atMs ?? '?'}ms ${crumb.event}${context ? `  ${context}` : ''}`)
    }
  }
  if (withStack && failure.stack) {
    line(`${indent}stack:`)
    for (const stackLine of String(failure.stack).split('\n').slice(0, 12)) {
      line(`${indent}  ${stackLine.trim()}`)
    }
  }
}

/** Recorrido de afiliacion de un atleta, buscado por correo o documento. */
async function traceAthlete(needle) {
  const params = /^\d{7,8}$/.test(needle)
    ? { documentId: needle }
    : UUID.test(needle)
      ? { athleteId: needle }
      : { email: needle }
  return buildAthleteTimeline(admin, { ...params, organizationId })
}

const FUNNEL_MARK = { true: '+', false: 'X' }

function printRequest(report) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  line('')
  line(`=== Operacion ${report.requestId} ===`)
  if (report.entrypoint) line(`entro por: ${report.entrypoint}`)
  line('')
  for (const item of report.entries) {
    const mark = SEVERITY_MARK[item.severity] ?? '·'
    line(`${mark} ${item.at}  [${item.source}] ${item.event} ${item.entityType}:${item.entityId}`)
    if (item.failure) printFailure(item.failure, '      ')
  }
  line('')
}

function printAthlete(report) {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const { athlete, funnel, timeline, verdict } = report
  line('')
  line(`=== Afiliacion · ${athlete.full_name} ===`)
  line(`atleta   ${athlete.id}`)
  line(`contacto ${athlete.email} · doc ${athlete.document_id}`)
  line('')
  line('--- recorrido ---')
  for (const step of funnel) {
    line(`${FUNNEL_MARK[String(step.done)]} ${step.step}${step.at ? `  ${step.at}` : ''}`)
  }
  line('')
  line('--- linea de tiempo ---')
  for (const item of timeline) {
    const mark = SEVERITY_MARK[item.severity] ?? '·'
    const detail = Object.entries(item.detail ?? {})
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}=${value}`)
      .join('  ')
    line(`${mark} ${item.at ?? '—'}  [${item.source}] ${item.event}${item.status ? ` → ${item.status}` : ''}`)
    if (detail) line(`      ${detail}`)
    if (item.failure) printFailure(item.failure, '      ')
  }
  line('')
  line('--- veredicto ---')
  line(`${verdict.state.toUpperCase()}: ${verdict.summary}`)
  if (verdict.action) line(`→ ${verdict.action}`)
  line('')
}

const notFound = (error) => error?.status === 404

/**
 * El operador escribe lo que tiene a mano y no deberia tener que aclarar que
 * es. Un uuid casi siempre es una orden; un email o un documento identifican a
 * un atleta; cualquier otra cadena es el requestId que trae el header o la
 * pantalla de error (Mercado Pago usa los suyos, que no son uuid).
 */
try {
  const looksLikeAthlete = target.includes('@') || /^\d{7,8}$/.test(target)

  if (looksLikeAthlete) {
    printAthlete(await traceAthlete(target))
  } else if (UUID.test(target)) {
    // Un uuid puede ser orden, atleta o requestId, en ese orden de frecuencia.
    try {
      printTimeline(await buildOrderTimeline(admin, { orderId: target, organizationId }))
    } catch (orderError) {
      if (!notFound(orderError)) throw orderError
      try {
        printAthlete(await traceAthlete(target))
      } catch (athleteError) {
        if (!notFound(athleteError)) throw athleteError
        printRequest(await buildRequestTimeline(admin, { requestId: target, organizationId }))
      }
    }
  } else {
    try {
      printRequest(await buildRequestTimeline(admin, { requestId: target, organizationId }))
    } catch (requestError) {
      if (!notFound(requestError)) throw requestError
      console.error(`Sin resultados para "${target}" (no es una orden, un requestId ni un atleta conocido).`)
      process.exit(1)
    }
  }
} catch (error) {
  console.error(`No se pudo reconstruir la traza: ${error?.message ?? error}`)
  process.exitCode = 1
}
