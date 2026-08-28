#!/usr/bin/env node
/**
 * mercado-pago-orphan-payments.mjs — PLU ARG
 *
 * Contesta la pregunta que deja un webhook caido: "¿hay plata que entro y la
 * app nunca registro?".
 *
 * `payments-audit` mira el ledger local y `payments-trace` reconstruye una
 * orden concreta. Este toma el camino inverso: parte de los ids de pago que
 * Mercado Pago intento notificar y el webhook rechazo (quedan asentados en
 * `operational_event_logs`), le pregunta a la API de MP por cada uno, y cruza
 * el resultado contra `athlete_payments`.
 *
 * Un pago aprobado en MP que no esta en la base es una acreditacion perdida:
 * el atleta pago y no se le dio de alta.
 *
 * Uso:
 *   node scripts/mercado-pago-orphan-payments.mjs
 *   node scripts/mercado-pago-orphan-payments.mjs --days 30
 *   node scripts/mercado-pago-orphan-payments.mjs --json
 *
 * Credenciales: usa MP_PROD_ACCESS_TOKEN si esta definido y, si no,
 * MERCADO_PAGO_ACCESS_TOKEN. La distincion importa porque el `.env` de trabajo
 * suele apuntar a la cuenta de prueba, y contra sandbox este informe no dice
 * nada de la plata real.
 */

import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'

try {
  loadEnvFile()
} catch {
  // Las variables tambien pueden venir del entorno del proceso (CI).
}

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const days = Number(args[args.indexOf('--days') + 1]) || 14

const accessToken = process.env.MP_PROD_ACCESS_TOKEN ?? process.env.MERCADO_PAGO_ACCESS_TOKEN
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!accessToken) {
  console.error('Falta MP_PROD_ACCESS_TOKEN (o MERCADO_PAGO_ACCESS_TOKEN).')
  process.exit(1)
}
if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const usingProdToken = Boolean(process.env.MP_PROD_ACCESS_TOKEN)
const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

/** Los ids que MP quiso notificar y el intake rechazo, sin duplicar. */
async function rejectedPaymentIds() {
  const { data, error } = await client
    .from('operational_event_logs')
    .select('created_at, entity_id, metadata')
    .eq('source', 'payment')
    .eq('action', 'payment.webhook_failed')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error(`No se pudo leer la bitacora: ${error.message}`)

  const ids = new Map()
  for (const row of data ?? []) {
    if (!row.entity_id || row.entity_id === 'unknown') continue
    // Las merchant_order no son cobros: su id no es un payment id y la consulta
    // devolveria 404 por motivos que no tienen nada que ver con plata perdida.
    if (row.metadata?.notificationType && row.metadata.notificationType !== 'payment') continue
    if (!ids.has(row.entity_id)) ids.set(row.entity_id, row.created_at)
  }
  return ids
}

async function fetchProviderPayment(id) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (response.status === 404) return { notFound: true }
  if (!response.ok) {
    return { error: `${response.status} ${(await response.text()).slice(0, 160)}` }
  }
  return { payment: await response.json() }
}

const PROVIDER_STATUSES_WITH_MONEY = new Set([
  'approved',
  'authorized',
  'in_process',
  'in_mediation',
  'refunded',
  'charged_back',
])

const rejected = await rejectedPaymentIds()
const ids = [...rejected.keys()]

const { data: known } = await client
  .from('athlete_payments')
  .select('external_payment_id, order_id, status')
  .in('external_payment_id', ids.length ? ids : ['none'])
const knownIds = new Set((known ?? []).map((row) => String(row.external_payment_id)))

const orphans = []
const accountedFor = []
const unreadable = []

for (const id of ids) {
  if (knownIds.has(String(id))) {
    accountedFor.push(id)
    continue
  }
  const result = await fetchProviderPayment(id)
  if (result.error) {
    unreadable.push({ id, reason: result.error })
    continue
  }
  if (result.notFound) {
    // 404 con el token correcto significa que el pago es de otra cuenta: no es
    // plata nuestra. Con el token de prueba, en cambio, TODOS dan 404 y el
    // informe no vale — por eso el aviso del encabezado.
    unreadable.push({ id, reason: 'no existe para esta cuenta (404)' })
    continue
  }
  const payment = result.payment
  const hasMoney = PROVIDER_STATUSES_WITH_MONEY.has(String(payment.status))
  const row = {
    id: String(payment.id),
    status: payment.status,
    statusDetail: payment.status_detail,
    amount: payment.transaction_amount,
    currency: payment.currency_id,
    orderId: payment.external_reference ?? null,
    approvedAt: payment.date_approved ?? null,
    payerEmail: payment.payer?.email ?? null,
    notifiedAt: rejected.get(id),
  }
  if (hasMoney) orphans.push(row)
  else accountedFor.push(`${id} (${payment.status})`)
}

// Para cada huerfano, en que estado quedo la orden que deberia haberse cerrado.
for (const orphan of orphans) {
  if (!orphan.orderId) continue
  const { data: order } = await client
    .from('athlete_payment_orders')
    .select('id, concept, status, amount, athlete_id, cancellation_code')
    .eq('id', orphan.orderId)
    .maybeSingle()
  orphan.order = order ?? null
  if (order?.athlete_id) {
    const { data: athlete } = await client
      .from('athletes')
      .select('full_name, document_id, email')
      .eq('id', order.athlete_id)
      .maybeSingle()
    orphan.athlete = athlete ?? null
  }
}

if (asJson) {
  console.log(JSON.stringify({ orphans, accountedFor, unreadable, days, usingProdToken }, null, 2))
} else {
  console.log('\n=== Pagos notificados por Mercado Pago que el webhook rechazo ===')
  console.log(`Ventana: ultimos ${days} dias · ids distintos: ${ids.length}`)
  if (!usingProdToken) {
    console.log(
      '\n  AVISO: se esta usando MERCADO_PAGO_ACCESS_TOKEN. Si apunta a la cuenta\n' +
        '  de prueba, todos los pagos reales van a figurar como "no existe (404)"\n' +
        '  y este informe no dice nada. Defini MP_PROD_ACCESS_TOKEN.',
    )
  }

  console.log(`\n-- Ya registrados en la app: ${accountedFor.length}`)
  console.log(`-- No consultables: ${unreadable.length}`)
  for (const row of unreadable) console.log(`   ${row.id}: ${row.reason}`)

  console.log(`\n-- PLATA SIN ACREDITAR: ${orphans.length}`)
  for (const row of orphans) {
    console.log(
      `\n   pago ${row.id} · ${row.status}/${row.statusDetail} · $${row.amount} ${row.currency}` +
        `\n     acreditado en MP: ${row.approvedAt ?? '—'}` +
        `\n     orden ${row.orderId ?? 'SIN REFERENCIA'}` +
        (row.order
          ? ` · ${row.order.concept} · la app dice "${row.order.status}"` +
            (row.order.cancellation_code ? ` (${row.order.cancellation_code})` : '')
          : ' · la orden no existe en la base') +
        (row.athlete
          ? `\n     atleta ${row.athlete.full_name} · DNI ${row.athlete.document_id} · ${row.athlete.email}`
          : ''),
    )
  }
  if (orphans.length) {
    console.log(
      '\n   Para acreditarlas: Panel > Pagos > Recuperar operaciones sobre cada orden,\n' +
        '   o `npm run payments:trace -- <orderId>` para ver la vida completa primero.',
    )
  }
  console.log('')
}

process.exit(orphans.length ? 1 : 0)
