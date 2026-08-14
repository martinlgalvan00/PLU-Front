#!/usr/bin/env node
/**
 * payments-audit.mjs — PLU ARG
 *
 * Auditoria del flujo de cobro y afiliaciones. Responde tres preguntas que
 * antes solo se contestaban entrando a la base:
 *
 *   1. ¿Puede cobrar hoy?  (credenciales, secreto de webhook, URLs, proveedor)
 *   2. ¿Quedo plata sin acreditar? (eventos fallidos, conciliaciones pendientes,
 *      drift entre ordenes y asientos, afiliaciones pagadas sin activar)
 *   3. Si algo fallo: que fallo, con que stack, y como se arregla.
 *
 * Uso:
 *   npm run payments:audit            # informe legible
 *   npm run payments:audit -- --json  # salida para CI
 *   npm run payments:audit -- --offline  # sin llamar a la API de MP
 *
 * Sale con codigo 1 si hay algun bloqueante; 0 si el sistema puede cobrar y
 * acreditar (los avisos no cortan).
 */

import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { getPaymentsRuntimeStatus } from '../server/modules/payments/createPaymentProviderAdapter.js'
import {
  diagnosePaymentFailure,
  explainPaymentStatusDetail,
} from '../server/modules/payments/paymentFailureCatalog.js'

try {
  loadEnvFile()
} catch {
  // Las variables tambien pueden venir del entorno del proceso (CI).
}

const args = new Set(process.argv.slice(2))
const asJson = args.has('--json')
const offline = args.has('--offline')

const findings = []
const add = (level, area, message, detail = null) => {
  findings.push({ level, area, message, detail })
}
const blocker = (area, message, detail) => add('blocker', area, message, detail)
const warning = (area, message, detail) => add('warning', area, message, detail)
const ok = (area, message, detail) => add('ok', area, message, detail)

// --- 1. Configuracion de runtime ------------------------------------------

const runtime = getPaymentsRuntimeStatus(process.env)
const mercadoPagoEnv = String(process.env.MERCADO_PAGO_ENV ?? '').trim().toLowerCase() || 'ausente'

if (runtime.provider === 'mock') {
  warning('runtime', 'El proveedor activo es el mock: no se cobra plata real.', {
    fix: ['Definir PAYMENTS_MOCK=false para auditar el ciclo real.'],
  })
} else if (runtime.ready) {
  ok('runtime', `Mercado Pago configurado (entorno ${mercadoPagoEnv}).`)
} else {
  for (const issue of runtime.issues) {
    blocker('runtime', issue, diagnosePaymentFailure({ message: issue }))
  }
}

for (const [name, label] of [['APP_URL', 'sitio'], ['API_URL', 'API']]) {
  const raw = String(process.env[name] ?? '').trim()
  if (!raw) {
    blocker('runtime', `Falta ${name} (${label}).`, diagnosePaymentFailure({ message: `Falta ${name}` }))
    continue
  }
  try {
    const url = new URL(raw)
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !isLocal) {
      blocker('runtime', `${name} debe usar HTTPS.`, diagnosePaymentFailure({ message: `${name} debe usar HTTPS.` }))
    } else if (isLocal && runtime.provider !== 'mock') {
      warning('runtime', `${name} apunta a localhost: Mercado Pago no puede notificar la acreditacion.`, {
        fix: ['Exponer la API con un tunel HTTPS o usar el preview de Vercel (`npm run mercado-pago:urls`).'],
      })
    } else {
      ok('runtime', `${name} valida (${url.origin}).`)
    }
  } catch {
    blocker('runtime', `${name} no es una URL valida.`, diagnosePaymentFailure({ message: `${name} no es una URL valida.` }))
  }
}

if (runtime.provider !== 'mock' && process.env.NODE_ENV === 'production' && mercadoPagoEnv === 'sandbox') {
  blocker('runtime', 'Produccion corriendo con credenciales sandbox.', {
    code: 'MP_ENV_MISMATCH',
    fix: ['Cargar las credenciales de produccion y MERCADO_PAGO_ENV=production.'],
  })
}

// --- 2. Conectividad con Mercado Pago -------------------------------------

if (!offline && runtime.provider === 'mercado_pago' && runtime.accessTokenConfigured) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN.trim()}` },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (response.ok) {
      ok('proveedor', `Token valido (cuenta ${body?.nickname ?? body?.id ?? 'sin nombre'}).`)
    } else {
      blocker(
        'proveedor',
        `Mercado Pago respondio HTTP ${response.status}: ${body?.message ?? 'sin detalle'}.`,
        diagnosePaymentFailure({ message: `HTTP ${response.status}`, status: response.status }),
      )
    }
  } catch (error) {
    blocker('proveedor', `No se pudo contactar a Mercado Pago: ${error?.message ?? error}.`, diagnosePaymentFailure(error))
  } finally {
    clearTimeout(timer)
  }
}

// --- 3. Base de datos: contrato del flujo de cobro ------------------------

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
let admin = null

if (!supabaseUrl || !serviceRoleKey) {
  blocker('base', 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: no se puede auditar el ledger.', {
    code: 'SUPABASE_UNAVAILABLE',
    fix: ['Cargar las credenciales de Supabase en el entorno y repetir la auditoria.'],
  })
} else {
  admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Funciones publicadas en PostgREST, leidas del spec OpenAPI.
 *
 * Invocarlas para ver si existen no sirve: PostgREST devuelve el mismo
 * PGRST202 ("Could not find the function ... in the schema cache") cuando la
 * funcion no existe y cuando existe pero la firma no coincide, asi que toda
 * RPC con parametros obligatorios daba un falso "falta".
 */
async function listPublishedRpcs() {
  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/openapi+json',
    },
  })
  if (!response.ok) throw new Error(`PostgREST respondio ${response.status}`)
  const spec = await response.json()
  return new Set(
    Object.keys(spec?.paths ?? {})
      .filter((path) => path.startsWith('/rpc/'))
      .map((path) => path.slice('/rpc/'.length)),
  )
}

// Funciones que el ciclo de cobro necesita si o si.
const REQUIRED_RPCS = [
  'apply_mercado_pago_payment',
  'apply_ticket_mercado_pago_payment',
  'claim_embedded_payment_attempt',
  'complete_embedded_payment_attempt',
  'claim_payment_integration_event',
  'claim_due_payment_integration_events',
  'complete_payment_integration_event',
  'claim_embedded_payment_reconciliations',
  'claim_embedded_payment_reconciliation',
  'complete_embedded_payment_reconciliation',
  'get_payment_operations_summary',
  'get_payment_system_health',
  'prepare_mercado_pago_subscription',
  'apply_mercado_pago_subscription',
  'apply_subscription_payment',
]

const REQUIRED_TABLES = [
  'athlete_payment_orders',
  'athlete_payments',
  'ticket_orders',
  'ticket_payments',
  'payment_integration_events',
  'embedded_payment_attempts',
  'membership_plans',
  'memberships',
  'billing_subscriptions',
  'operational_event_logs',
]

if (admin) {
  try {
    const published = await listPublishedRpcs()
    const missingRpcs = REQUIRED_RPCS.filter((name) => !published.has(name))
    if (missingRpcs.length) {
      blocker('base', `Faltan funciones del flujo de cobro: ${missingRpcs.join(', ')}.`, {
        code: 'SUPABASE_RPC_MISSING',
        fix: [
          'Aplicar migraciones pendientes (`npm run setup:all`).',
          'Recargar el cache de esquema en Supabase (Settings > API > Reload schema).',
        ],
      })
    } else {
      ok('base', `Las ${REQUIRED_RPCS.length} funciones del flujo de cobro estan publicadas.`)
    }
  } catch (error) {
    warning('base', `No se pudo leer el catalogo de funciones: ${error.message}.`, {
      fix: ['Verificar que el service role pueda leer el spec de PostgREST (`GET /rest/v1/`).'],
    })
  }

  const missingTables = []
  for (const table of REQUIRED_TABLES) {
    const { error } = await admin.from(table).select('*', { count: 'exact', head: true })
    if (error) missingTables.push(`${table} (${error.message})`)
  }
  if (missingTables.length) {
    blocker('base', `Tablas inaccesibles: ${missingTables.join('; ')}.`, {
      code: 'SUPABASE_UNAVAILABLE',
      fix: ['Verificar migraciones y permisos del service role sobre esas tablas.'],
    })
  } else {
    ok('base', `Las ${REQUIRED_TABLES.length} tablas del ledger responden.`)
  }
}

// --- 4. Estado del ledger --------------------------------------------------

let summary = null
let health = null

if (admin) {
  const [summaryResult, healthResult] = await Promise.all([
    admin.rpc('get_payment_operations_summary'),
    admin.rpc('get_payment_system_health'),
  ])
  summary = summaryResult.data ?? null
  health = healthResult.data ?? null

  if (health?.healthy === false) {
    const detail = []
    if (health.athleteOrderDrift > 0) detail.push(`${health.athleteOrderDrift} orden(es) de atleta con estado distinto a sus pagos`)
    if (health.ticketOrderDrift > 0) detail.push(`${health.ticketOrderDrift} orden(es) de entradas con estado distinto a sus pagos`)
    if (health.staleEventLocks > 0) detail.push(`${health.staleEventLocks} webhook(s) con lock vencido`)
    if (health.staleReconciliationLocks > 0) detail.push(`${health.staleReconciliationLocks} conciliacion(es) con lock vencido`)
    if (health.exhaustedEvents > 0) detail.push(`${health.exhaustedEvents} webhook(s) con reintentos agotados`)
    blocker('ledger', `Integridad comprometida: ${detail.join('; ')}.`, {
      code: 'LEDGER_DRIFT',
      fix: [
        'Panel > Pagos > Recuperar operaciones libera locks vencidos y reprocesa lo pendiente.',
        'Si el drift persiste, comparar la orden con sus filas de athlete_payments antes de tocar estados a mano.',
      ],
    })
  } else if (health) {
    ok('ledger', `Integridad del ledger sin desvios (schema v${health.schemaVersion ?? '?'}).`)
  }

  const failedEvents = Number(summary?.events?.failed ?? 0)
  const pendingReconciliations = Number(summary?.attempts?.reconciliationPending ?? 0)
  const pastDue = Number(summary?.subscriptions?.pastDue ?? 0)

  if (failedEvents > 0) warning('ledger', `${failedEvents} webhook(s) en estado failed.`)
  else ok('ledger', 'Sin webhooks fallidos.')

  if (pendingReconciliations > 0) {
    warning('ledger', `${pendingReconciliations} pago(s) embebido(s) esperando conciliacion.`, {
      fix: ['El job de recovery los toma cada 60s; si no bajan, revisar el diagnostico de cada uno.'],
    })
  } else {
    ok('ledger', 'Sin conciliaciones pendientes.')
  }

  if (pastDue > 0) warning('ledger', `${pastDue} suscripcion(es) en mora.`)

  // Fallas concretas, agrupadas por causa: es lo que hay que arreglar.
  const { data: failures } = await admin
    .from('payment_integration_events')
    .select('id, resource_id, event_type, error, attempts_count, max_attempts, last_attempt_at')
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .limit(50)

  const grouped = new Map()
  for (const row of failures ?? []) {
    const diagnosis = diagnosePaymentFailure({ message: row.error ?? '' })
    const current = grouped.get(diagnosis.code) ?? { diagnosis, count: 0, samples: [] }
    current.count += 1
    if (current.samples.length < 3) {
      current.samples.push({
        eventId: row.id,
        paymentId: row.resource_id,
        attempts: `${row.attempts_count}/${row.max_attempts}`,
        error: row.error,
      })
    }
    grouped.set(diagnosis.code, current)
  }
  for (const entry of grouped.values()) {
    const level = entry.diagnosis.severity === 'blocker' ? 'blocker' : 'warning'
    add(level, 'fallas', `${entry.count} webhook(s): ${entry.diagnosis.title}.`, {
      ...entry.diagnosis,
      samples: entry.samples,
    })
  }

  // --- 5. Afiliaciones: pagado != activo -----------------------------------

  const { data: paidMembershipOrders } = await admin
    .from('athlete_payment_orders')
    .select('id, athlete_id, concept, status, updated_at')
    .eq('status', 'aprobado')
    .in('concept', ['membership', 'combo'])
    .order('updated_at', { ascending: false })
    .limit(200)

  if (paidMembershipOrders?.length) {
    const athleteIds = [...new Set(paidMembershipOrders.map((order) => order.athlete_id).filter(Boolean))]
    const { data: activeMemberships } = await admin
      .from('memberships')
      .select('athlete_id, status')
      .in('athlete_id', athleteIds)
      .eq('status', 'activa')
    const activos = new Set((activeMemberships ?? []).map((row) => row.athlete_id))
    const huerfanas = paidMembershipOrders.filter((order) => order.athlete_id && !activos.has(order.athlete_id))

    if (huerfanas.length) {
      blocker('afiliaciones', `${huerfanas.length} afiliacion(es) cobradas sin membresia activa.`, {
        code: 'MEMBERSHIP_NOT_ACTIVATED',
        fix: [
          'Revisar cada orden en Panel > Pagos: el pago entro pero la RPC de activacion no corrio.',
          'Reprocesar con Recuperar operaciones; si el pago ya esta aplicado, revisar apply_mercado_pago_payment.',
        ],
        samples: huerfanas.slice(0, 5).map((order) => ({ orderId: order.id, athleteId: order.athlete_id })),
      })
    } else {
      ok('afiliaciones', `Las ${paidMembershipOrders.length} afiliaciones cobradas recientes tienen membresia activa.`)
    }
  } else {
    ok('afiliaciones', 'No hay afiliaciones cobradas en el rango revisado.')
  }

  // --- 6. Bitacora reciente de fallas --------------------------------------

  const { data: auditFailures } = await admin
    .from('operational_event_logs')
    .select('action, entity_id, created_at, metadata')
    .eq('source', 'payment')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10)

  if (auditFailures?.length) {
    warning('bitacora', `${auditFailures.length} falla(s) de cobro registradas recientemente.`, {
      entries: auditFailures.map((entry) => {
        // El asiento es append-only: guarda el diagnostico vigente al momento
        // del incidente. Se re-diagnostica al leer para que un patron agregado
        // despues tambien explique las fallas viejas.
        const message =
          entry.metadata?.error?.message
          ?? (typeof entry.metadata?.error === 'string' ? entry.metadata.error : null)
          ?? entry.metadata?.errorCode
          ?? ''
        const stored = entry.metadata?.diagnosis ?? null
        const current = diagnosePaymentFailure({ message })
        const diagnosis = current.code === 'UNCLASSIFIED_PAYMENT_FAILURE' && stored ? stored : current
        return {
          action: entry.action,
          entityId: entry.entity_id,
          at: entry.created_at,
          stage: entry.metadata?.stage ?? null,
          requestId: entry.metadata?.requestId ?? null,
          code: diagnosis.code,
          severity: diagnosis.severity,
          fix: diagnosis.fix ?? null,
          // Primeras lineas del stack: alcanzan para ubicar el punto exacto.
          stackHead: String(entry.metadata?.error?.stack ?? '').split('\n').slice(0, 3).join(' | ') || null,
        }
      }),
    })
  } else {
    ok('bitacora', 'Sin fallas de cobro en la bitacora reciente.')
  }

  // Rechazos: no son fallas del sistema, pero el operador los tiene que poder
  // explicar cuando el atleta pregunta.
  const { data: rejected } = await admin
    .from('athlete_payments')
    .select('status_detail')
    .eq('status', 'rechazado')
    .order('created_at', { ascending: false })
    .limit(50)

  if (rejected?.length) {
    const byDetail = new Map()
    for (const row of rejected) {
      const key = row.status_detail ?? 'sin_detalle'
      byDetail.set(key, (byDetail.get(key) ?? 0) + 1)
    }
    warning('rechazos', `${rejected.length} pago(s) rechazados recientes.`, {
      breakdown: [...byDetail.entries()].map(([detail, count]) => ({
        detail,
        count,
        meaning: explainPaymentStatusDetail(detail),
      })),
    })
  }
}

// --- Salida ----------------------------------------------------------------

const blockers = findings.filter((item) => item.level === 'blocker')
const warnings = findings.filter((item) => item.level === 'warning')

if (asJson) {
  console.log(JSON.stringify({
    ok: blockers.length === 0,
    runtime,
    summary,
    health,
    findings,
  }, null, 2))
} else {
  const ICON = { ok: 'OK   ', warning: 'AVISO', blocker: 'FALLA' }
  console.log('\n=== Auditoria de cobros y afiliaciones · PLU ARG ===\n')
  let area = null
  for (const finding of findings) {
    if (finding.area !== area) {
      area = finding.area
      console.log(`\n[${area}]`)
    }
    console.log(`  ${ICON[finding.level]}  ${finding.message}`)
    if (finding.level === 'ok' || !finding.detail) continue
    if (finding.detail.cause) console.log(`         causa: ${finding.detail.cause}`)
    for (const step of finding.detail.fix ?? []) console.log(`         → ${step}`)
    for (const sample of finding.detail.samples ?? []) {
      console.log(`         ej: ${JSON.stringify(sample)}`)
    }
    for (const entry of finding.detail.entries ?? []) {
      console.log(`         ${entry.at} ${entry.action} ${entry.code ?? ''} requestId=${entry.requestId ?? '-'}`)
      if (entry.stackHead) console.log(`             ${entry.stackHead}`)
      for (const step of entry.fix ?? []) console.log(`             → ${step}`)
    }
    for (const item of finding.detail.breakdown ?? []) {
      console.log(`         ${item.count}× ${item.detail}: ${item.meaning}`)
    }
  }
  console.log(
    blockers.length === 0
      ? `\n=== Sin bloqueantes (${warnings.length} aviso/s) ===\n`
      : `\n=== ${blockers.length} bloqueante(s) y ${warnings.length} aviso(s) ===\n`,
  )
}

process.exitCode = blockers.length === 0 ? 0 : 1
