import { createZip } from '../../lib/zipStore.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { PROOF_SOURCES } from './paymentProofRetention.js'

/**
 * Archivo de comprobantes (atletas y entradas): resumen, descarga por lote y lista.
 *
 * La idea es sacar los comprobantes de Supabase sin perder ninguno: el staff
 * los baja a su computadora (ZIP + índice) y recién entonces, si así lo decidió
 * en Cobros, el servidor puede borrarlos. `payment_proof_exported_at` es la
 * prueba de que ya se descargaron. La purga alcanza a las dos tablas, así que
 * la descarga también.
 */

const [ATHLETE_SOURCE, TICKET_SOURCE] = PROOF_SOURCES
/** Un ZIP se arma en memoria: se acota por cantidad y por peso. */
export const EXPORT_MAX_FILES = 100
export const EXPORT_MAX_BYTES = 120 * 1024 * 1024
const DOWNLOAD_CONCURRENCY = 5

const CONCEPT_LABELS = { membership: 'Afiliación', registration: 'Inscripción', combo: 'Combo' }
const CHANNEL_LABELS = {
  bank_transfer: 'Transferencia',
  wise_transfer: 'Wise',
  cash_pitbull: 'Efectivo en Pitbull',
}
const FILE_STATE_LABELS = {
  server: 'Solo en el servidor',
  downloaded: 'Descargado',
  trash: 'En la papelera',
  deleted: 'Eliminado del servidor',
  none: 'Sin comprobante',
}

export function proofFileState(order) {
  if (order.payment_proof_path) return order.payment_proof_exported_at ? 'downloaded' : 'server'
  if (order.payment_proof_trashed_at) return 'trash'
  if (order.payment_proof_purged_at) return 'deleted'
  return 'none'
}

const isTicket = (order) => order.source === TICKET_SOURCE.key
const personOf = (order) => (isTicket(order) ? order.buyer_name : order.athlete?.full_name)

function slug(value) {
  return (
    String(value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'sin-nombre'
  )
}

const day = (value) => (value ? String(value).slice(0, 10) : '')

/** Nombre del archivo dentro del ZIP: ordenable por fecha y reconocible a simple vista. */
export function proofFileName(order) {
  const path = String(order.payment_proof_path ?? '')
  const ext = /\.([a-zA-Z0-9]{2,5})$/.exec(path)?.[1]?.toLowerCase() ?? 'bin'
  const date = day(order.approved_at ?? order.created_at) || 'sin-fecha'
  const ref = String(order.reference ?? order.id).slice(-12)
  const who = slug(personOf(order))
  return `comprobantes/${isTicket(order) ? 'entradas' : 'atletas'}/${date}_${who}_${ref}.${ext}`
}

function csvCell(value) {
  const s = value == null ? '' : String(value)
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV con BOM y `;` para que Excel en español lo abra con las columnas bien. */
function toCsv(header, rows) {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'))
  return `﻿${lines.join('\r\n')}\r\n`
}

const INDEX_HEADER = [
  'Origen',
  'Referencia',
  'Fecha de la orden',
  'Atleta o comprador',
  'DNI',
  'Concepto',
  'Monto',
  'Moneda',
  'Canal',
  'Estado de la orden',
  'Decidida el',
  'Comprobante subido el',
  'Descargado el',
  'Eliminado del servidor el',
  'Comprobante',
  'Archivo dentro del ZIP',
]

function indexRow(order, fileName = '') {
  const ticket = isTicket(order)
  return [
    ticket ? 'Entrada' : 'Atleta',
    order.reference,
    day(order.created_at),
    personOf(order),
    ticket ? '' : order.athlete?.document_id,
    ticket ? 'Entradas' : (CONCEPT_LABELS[order.concept] ?? order.concept),
    order.amount,
    order.currency,
    CHANNEL_LABELS[order.manual_payment_channel] ??
      order.manual_payment_channel ??
      order.method ??
      order.provider,
    order.status,
    day(order.approved_at ?? order.rejected_at),
    day(order.payment_proof_uploaded_at),
    day(order.payment_proof_exported_at),
    day(order.payment_proof_purged_at),
    FILE_STATE_LABELS[proofFileState(order)],
    fileName,
  ]
}

const PROOF_FIELDS =
  'id, reference, amount, currency, manual_payment_channel, status, created_at, approved_at, rejected_at, payment_proof_path, payment_proof_uploaded_at, payment_proof_exported_at, payment_proof_purged_at, payment_proof_trashed_at'

/** Qué se lee de cada tabla y cómo se identifica a quien pagó. */
const SOURCE_QUERY = {
  [ATHLETE_SOURCE.key]: `${PROOF_FIELDS}, concept, method, athlete:athletes(full_name, document_id)`,
  [TICKET_SOURCE.key]: `${PROOF_FIELDS}, provider, buyer_name`,
}

const tag = (source, rows) => (rows ?? []).map((row) => ({ ...row, source: source.key }))

async function count(client, source, build) {
  let query = client.from(source.table).select('id', { count: 'exact', head: true })
  // Sólo atletas guarda organización; las entradas son de una única organización.
  if (source === ATHLETE_SOURCE) query = query.eq('organization_id', PRIMARY_ORGANIZATION_ID)
  const { count: total, error } = await build(query)
  if (error) throw error
  return total ?? 0
}

async function countPending(client) {
  const totals = await Promise.all(
    PROOF_SOURCES.map((source) =>
      count(client, source, (q) =>
        q.not('payment_proof_path', 'is', null).is('payment_proof_exported_at', null),
      ),
    ),
  )
  return totals.reduce((sum, value) => sum + value, 0)
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

/**
 * Arma un ZIP con los comprobantes todavía en el servidor y su índice, y marca
 * como descargados únicamente los que entraron (nunca uno que no se pudo leer).
 *
 * @param {'pending' | 'all'} scope `pending` salta los ya descargados; `all` vuelve a
 *   bajar también los que ya se descargaron (por si se perdió un ZIP).
 * @param {string | null} after Cursor (`created_at` del último procesado): sigue desde ahí.
 *   Con `all` es lo que permite recorrer todo en tandas, porque no hay marca que avance sola.
 */
export async function exportProofs(
  client,
  { scope = 'pending', after = null, now = new Date() } = {},
) {
  const fetched = await Promise.all(
    PROOF_SOURCES.map(async (source) => {
      let query = client
        .from(source.table)
        .select(SOURCE_QUERY[source.key])
        .not('payment_proof_path', 'is', null)
      if (source === ATHLETE_SOURCE) query = query.eq('organization_id', PRIMARY_ORGANIZATION_ID)
      if (scope === 'pending') query = query.is('payment_proof_exported_at', null)
      if (after) query = query.gt('created_at', after)
      const { data, error } = await query
        .order('created_at', { ascending: true })
        .limit(EXPORT_MAX_FILES + 1)
      if (error) throw error
      return tag(source, data)
    }),
  )

  // Atletas y entradas se bajan juntos, de la más vieja a la más nueva.
  const candidates = fetched
    .flat()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const batch = candidates.slice(0, EXPORT_MAX_FILES)
  const bucketOf = Object.fromEntries(PROOF_SOURCES.map((source) => [source.key, source.bucket]))

  const downloads = await mapLimit(batch, DOWNLOAD_CONCURRENCY, async (order) => {
    try {
      const { data: blob, error: downloadError } = await client.storage
        .from(bucketOf[order.source])
        .download(order.payment_proof_path)
      if (downloadError || !blob) return { order, buffer: null }
      return { order, buffer: Buffer.from(await blob.arrayBuffer()) }
    } catch {
      return { order, buffer: null }
    }
  })

  const included = []
  let bytes = 0
  const failed = []
  // Cuántos se resolvieron (entraron o no se pudieron leer): de ahí sigue la próxima tanda.
  let processed = 0
  for (const item of downloads) {
    if (item.buffer) {
      if (bytes + item.buffer.length > EXPORT_MAX_BYTES && included.length > 0) break
      bytes += item.buffer.length
      included.push(item)
    } else {
      failed.push(item.order)
    }
    processed += 1
  }
  const next =
    processed > 0 && candidates.length > processed ? batch[processed - 1].created_at : null

  const names = new Set()
  const entries = included.map(({ order, buffer }) => {
    let name = proofFileName(order)
    for (let n = 2; names.has(name); n += 1) name = name.replace(/(\.[a-z0-9]+)$/i, `-${n}$1`)
    names.add(name)
    return { name, data: buffer, date: new Date(order.payment_proof_uploaded_at ?? now) }
  })

  const index = toCsv(
    INDEX_HEADER,
    included.map(({ order }, i) => indexRow(order, entries[i].name)),
  )
  entries.push({ name: 'indice.csv', data: Buffer.from(index, 'utf8'), date: now })

  // Se marca como descargado únicamente lo que entró al ZIP.
  for (const source of PROOF_SOURCES) {
    const ids = included
      .filter(({ order }) => order.source === source.key)
      .map(({ order }) => order.id)
    if (ids.length === 0) continue
    const { error: markError } = await client
      .from(source.table)
      .update({ payment_proof_exported_at: now.toISOString() })
      .in('id', ids)
      .is('payment_proof_exported_at', null)
    if (markError) throw markError
  }

  // Cuántos quedan sin bajar (por tope de cantidad/peso o por no poder leerse).
  let remaining
  try {
    remaining = await countPending(client)
  } catch {
    remaining = candidates.length - included.length
  }

  return {
    zip: createZip(entries),
    count: included.length,
    remaining,
    // Con `all` no hay marca que avance sola: este cursor es lo que sigue a lo ya procesado.
    next,
    failed: failed.length,
    bytes,
  }
}

/** Filas por página al armar el índice: PostgREST corta cada lectura. */
const INDEX_PAGE_SIZE = 1000
/** Tope de seguridad (no de datos): evita un loop si la lectura nunca termina. */
const INDEX_MAX_ROWS = 200_000

/** Lee todas las páginas de una consulta ordenada de forma estable. */
async function readAllPages(build) {
  const rows = []
  for (let from = 0; from < INDEX_MAX_ROWS; from += INDEX_PAGE_SIZE) {
    const { data, error } = await build().range(from, from + INDEX_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < INDEX_PAGE_SIZE) break
  }
  return rows
}

/** Lista de todas las transferencias con su comprobante (o la falta de él), sin archivos. */
export async function buildProofIndexCsv(client) {
  const [athletes, tickets] = await Promise.all([
    readAllPages(() =>
      client
        .from(ATHLETE_SOURCE.table)
        .select(SOURCE_QUERY[ATHLETE_SOURCE.key])
        .eq('organization_id', PRIMARY_ORGANIZATION_ID)
        .eq('method', 'manual_link')
        .neq('manual_payment_channel', 'cash_pitbull')
        .order('created_at', { ascending: false })
        .order('id'),
    ),
    readAllPages(() =>
      client
        .from(TICKET_SOURCE.table)
        .select(SOURCE_QUERY[TICKET_SOURCE.key])
        .eq('provider', 'manual')
        .neq('manual_payment_channel', 'cash_pitbull')
        .order('created_at', { ascending: false })
        .order('id'),
    ),
  ])

  const orders = [...tag(ATHLETE_SOURCE, athletes), ...tag(TICKET_SOURCE, tickets)].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  )
  return toCsv(
    INDEX_HEADER.slice(0, -1),
    orders.map((order) => indexRow(order).slice(0, -1)),
  )
}
