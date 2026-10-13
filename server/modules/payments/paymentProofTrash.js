import { HttpError } from '../../lib/errors.js'
import { assertSupabaseResult } from '../../lib/supabaseRpc.js'

/**
 * Papelera de comprobantes (borrado lógico en dos etapas).
 *
 * Un archivo no se borra de Storage cuando "se elimina": primero pasa a la
 * papelera (`deleted_at`, restaurable) y recién cuando vence el período de
 * gracia se purga del bucket. El estado vive en `payment_proof_files`
 * (20261214110000) y lo cambian RPC atómicas; acá queda lo que SQL no alcanza,
 * que es hablar con Storage.
 *
 * Orden de la purga: primero se saca el objeto del bucket y después se marca
 * `purged_at`. Si se corta en el medio, la fila sigue en la papelera y la
 * próxima corrida repite el borrado (que es idempotente): nunca queda un
 * "purgado" cuyo archivo siga existiendo.
 */

export const TRASH_REASONS = Object.freeze([
  'retention',
  'manual',
  'superseded',
  'athlete_deleted',
  'orphan',
])
export const PROOF_SOURCE_KEYS = Object.freeze(['athlete', 'ticket', 'shop'])

/** `storage.remove` acepta varios paths; se parte para no armar pedidos enormes. */
const REMOVE_CHUNK = 100
const FILE_COLUMNS =
  'id, source, order_id, bucket, path, uploaded_at, exported_at, superseded_at, deleted_at, deleted_by, deleted_reason, purged_at'

const DAY_MS = 24 * 60 * 60 * 1000

export async function trashOrderProof(client, { source, orderId, actor = null }) {
  const result = assertSupabaseResult(
    await client.rpc('proof_trash', { p_source: source, p_order_id: orderId, p_actor: actor }),
    'No se pudo mover el comprobante a la papelera.',
  )
  return { trashed: Boolean(result?.trashed), fileId: result?.fileId ?? null }
}

export async function restoreProofFile(client, { fileId, actor = null }) {
  const result = assertSupabaseResult(
    await client.rpc('proof_restore', { p_file_id: fileId, p_actor: actor }),
    'No se pudo restaurar el comprobante.',
  )
  return {
    restored: Boolean(result?.restored),
    fileId: result?.fileId ?? fileId,
    source: result?.source ?? null,
    orderId: result?.orderId ?? null,
  }
}

/**
 * Los archivos de órdenes que van a dejar de existir (baja de un atleta) pasan
 * a la papelera en vez de borrarse: durante la gracia todavía se pueden bajar.
 */
export async function trashFilesOfOrders(
  client,
  { orderIds, actor = null, reason = 'athlete_deleted' },
) {
  if (!orderIds?.length) return 0
  const count = assertSupabaseResult(
    await client.rpc('proof_trash_order_files', {
      p_order_ids: orderIds,
      p_reason: reason,
      p_actor: actor,
    }),
    'No se pudieron mover los comprobantes a la papelera.',
  )
  return Number(count) || 0
}

/** Lo que identifica a cada archivo de la papelera frente a quien lo revisa. */
async function describeOrders(client, files) {
  const idsBySource = { athlete: [], ticket: [], shop: [] }
  for (const file of files) {
    if (file.order_id && idsBySource[file.source]) idsBySource[file.source].push(file.order_id)
  }
  const found = new Map()
  const read = async (source, table, columns, describe) => {
    const ids = [...new Set(idsBySource[source])]
    if (ids.length === 0) return
    const { data, error } = await client.from(table).select(columns).in('id', ids)
    if (error) throw error
    for (const row of data ?? []) found.set(`${source}:${row.id}`, describe(row))
  }
  await Promise.all([
    read(
      'athlete',
      'athlete_payment_orders',
      'id, reference, amount, currency, status, athlete:athletes(full_name)',
      (row) => ({
        reference: row.reference,
        person: row.athlete?.full_name ?? null,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
      }),
    ),
    read(
      'ticket',
      'ticket_orders',
      'id, reference, amount, currency, status, buyer_name',
      (row) => ({
        reference: row.reference,
        person: row.buyer_name ?? null,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
      }),
    ),
    read('shop', 'shop_orders', 'id, amount, currency, status, buyer_name', (row) => ({
      reference: null,
      person: row.buyer_name ?? null,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
    })),
  ])
  return found
}

/**
 * Lo que hay en la papelera, lo más reciente primero. `purgeAt` es cuándo lo
 * borra el job; `restorable` es falso si la orden ya no existe o si el período
 * de gracia ya venció (la base igual lo vuelve a validar al restaurar).
 */
export async function listTrash(
  client,
  { limit = 50, offset = 0, graceDays, now = new Date() } = {},
) {
  const { data, error, count } = await client
    .from('payment_proof_files')
    .select(FILE_COLUMNS, { count: 'exact' })
    .not('deleted_at', 'is', null)
    .is('purged_at', null)
    .order('deleted_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error

  const files = data ?? []
  const orders = await describeOrders(client, files)
  const items = files.map((file) => {
    const order = orders.get(`${file.source}:${file.order_id}`) ?? null
    const purgeAt = new Date(new Date(file.deleted_at).getTime() + graceDays * DAY_MS)
    return {
      id: file.id,
      source: file.source,
      orderId: file.order_id,
      reference: order?.reference ?? null,
      person: order?.person ?? null,
      amount: order?.amount ?? null,
      currency: order?.currency ?? null,
      orderStatus: order?.status ?? null,
      reason: file.deleted_reason,
      deletedAt: file.deleted_at,
      deletedBy: file.deleted_by,
      uploadedAt: file.uploaded_at,
      exportedAt: file.exported_at,
      purgeAt: purgeAt.toISOString(),
      restorable: order != null && purgeAt.getTime() > now.getTime(),
    }
  })
  return { items, total: count ?? items.length }
}

export async function readTrashedFile(client, fileId) {
  const { data, error } = await client
    .from('payment_proof_files')
    .select(FILE_COLUMNS)
    .eq('id', fileId)
    .not('deleted_at', 'is', null)
    .is('purged_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'El archivo no está en la papelera.')
  return data
}

/**
 * Borra de Storage y marca purgado. Devuelve cuántos se purgaron y cuántos
 * fallaron; un fallo de Storage deja el archivo en la papelera para reintentar.
 * @param {Array<{ id: string, bucket: string, path: string }>} files
 */
export async function purgeFiles(client, files) {
  const byBucket = new Map()
  for (const file of files) {
    if (!byBucket.has(file.bucket)) byBucket.set(file.bucket, [])
    byBucket.get(file.bucket).push(file)
  }

  const removedIds = []
  const errors = []
  let failed = 0
  for (const [bucket, bucketFiles] of byBucket) {
    for (let start = 0; start < bucketFiles.length; start += REMOVE_CHUNK) {
      const chunk = bucketFiles.slice(start, start + REMOVE_CHUNK)
      try {
        // Un objeto que ya no está no es error: `remove` solo informa los que borró.
        const { error } = await client.storage.from(bucket).remove(chunk.map((file) => file.path))
        if (error) throw error
        removedIds.push(...chunk.map((file) => file.id))
      } catch (error) {
        failed += chunk.length
        errors.push({ bucket, message: error?.message ?? String(error) })
      }
    }
  }

  let purged = 0
  if (removedIds.length > 0) {
    purged = Number(
      assertSupabaseResult(
        await client.rpc('proof_mark_purged', { p_file_ids: removedIds }),
        'No se pudo registrar la purga de comprobantes.',
      ),
    )
    if (!Number.isFinite(purged)) purged = removedIds.length
  }
  return { purged, failed, errors: errors.slice(0, 5) }
}

/** Purga lo que ya pasó el período de gracia en la papelera. */
export async function purgeExpiredTrash(client, { graceDays, now = new Date(), limit = 200 } = {}) {
  const cutoff = new Date(now.getTime() - graceDays * DAY_MS).toISOString()
  const { data, error } = await client
    .from('payment_proof_files')
    .select('id, bucket, path')
    .not('deleted_at', 'is', null)
    .is('purged_at', null)
    .lte('deleted_at', cutoff)
    .order('deleted_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  const files = data ?? []
  if (files.length === 0) return { purged: 0, failed: 0, errors: [] }
  return purgeFiles(client, files)
}

/** "Eliminar ahora" de un archivo de la papelera (sin esperar la gracia). */
export async function purgeTrashedFile(client, fileId) {
  const file = await readTrashedFile(client, fileId)
  const result = await purgeFiles(client, [file])
  if (result.failed > 0) {
    throw new HttpError(502, 'No se pudo eliminar el archivo del almacenamiento. Probá de nuevo.')
  }
  return result
}

/** Vaciar la papelera: en tandas, hasta que no quede nada o ya no avance. */
export async function emptyTrash(client, { batch = 100, maxBatches = 20 } = {}) {
  const total = { purged: 0, failed: 0, errors: [] }
  for (let round = 0; round < maxBatches; round += 1) {
    const { data, error } = await client
      .from('payment_proof_files')
      .select('id, bucket, path')
      .not('deleted_at', 'is', null)
      .is('purged_at', null)
      .order('deleted_at', { ascending: true })
      .limit(batch)
    if (error) throw error
    const files = data ?? []
    if (files.length === 0) break
    const result = await purgeFiles(client, files)
    total.purged += result.purged
    total.failed += result.failed
    total.errors.push(...result.errors)
    // Si nada se pudo purgar en esta tanda, repetir sería un loop.
    if (result.purged === 0) break
  }
  total.errors = total.errors.slice(0, 5)
  return total
}

/** Subidas que nadie registró: entran a la papelera y salen por la purga normal. */
export async function sweepOrphans(client) {
  const count = assertSupabaseResult(
    await client.rpc('proof_register_orphans'),
    'No se pudieron revisar los archivos huérfanos.',
  )
  return Number(count) || 0
}
