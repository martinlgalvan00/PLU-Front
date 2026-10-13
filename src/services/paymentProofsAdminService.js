import { env } from '../config/env.js'
import { apiGet, apiRequest } from '../lib/api.js'

/**
 * Archivo de comprobantes de Cobros: cuántos hay, descargarlos a la computadora,
 * la política que decide cuándo pasan a la papelera y la papelera misma
 * (restaurar o eliminar para siempre).
 *
 * El default es CONSERVAR: ante un dato ausente o raro nunca se asume que se
 * puede mover o borrar algo.
 */

export const PROOF_RETENTION_MODES = ['keep', 'after_export', 'after_days']
export const PROOF_RETENTION_DAYS = { min: 1, max: 3650, fallback: 30 }
export const PROOF_GRACE_DAYS = { min: 1, max: 3650, fallback: 30 }
export const PROOF_TRASH_PAGE = 20

function count(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function validDays(value, { min, max, fallback }) {
  const days = Number(value)
  return Number.isInteger(days) && days >= min && days <= max ? days : fallback
}

function mapForecast(forecast) {
  if (!forecast || typeof forecast !== 'object') return null
  const nextDueAt = forecast.nextDueAt ? new Date(forecast.nextDueAt) : null
  return {
    count: count(forecast.count),
    notDownloaded: count(forecast.notDownloaded),
    dueNow: count(forecast.dueNow),
    windowDays: count(forecast.windowDays),
    nextDueAt: nextDueAt && !Number.isNaN(nextDueAt.getTime()) ? nextDueAt.toISOString() : null,
  }
}

function mapSettings(settings) {
  const mode = PROOF_RETENTION_MODES.includes(settings?.mode) ? settings.mode : 'keep'
  return {
    mode,
    days: validDays(settings?.days, PROOF_RETENTION_DAYS),
    graceDays: validDays(settings?.graceDays, PROOF_GRACE_DAYS),
    updatedBy: settings?.updatedBy ?? null,
    updatedAt: settings?.updatedAt ?? null,
  }
}

function mapArchive(result) {
  return {
    summary: {
      onServer: count(result?.summary?.onServer),
      notDownloaded: count(result?.summary?.notDownloaded),
      downloaded: count(result?.summary?.downloaded),
      deleted: count(result?.summary?.deleted),
    },
    settings: mapSettings(result?.settings),
    forecast: mapForecast(result?.forecast),
    trash: {
      count: count(result?.trash?.count),
      dueForPurge: count(result?.trash?.dueForPurge),
      graceDays: validDays(result?.trash?.graceDays, PROOF_GRACE_DAYS),
    },
  }
}

export async function fetchProofArchive() {
  return mapArchive(await apiGet('/api/payment-proofs/summary'))
}

/**
 * Qué iría a la papelera con una política que todavía no se guardó. Sirve para
 * avisar del impacto antes de activarla.
 */
export async function fetchProofForecast({ mode, days }) {
  const query = new URLSearchParams({ mode, days: String(days) })
  const result = await apiGet(`/api/payment-proofs/forecast?${query}`)
  return mapForecast(result?.forecast)
}

/** `graceDays` ausente deja el período de la papelera como estaba. */
export async function saveProofRetention({ mode, days, graceDays }) {
  const result = await apiRequest('/api/payment-proofs/settings', {
    method: 'PUT',
    body: JSON.stringify({ mode, days, ...(graceDays != null ? { graceDays } : {}) }),
  })
  return mapSettings(result?.settings)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Se difiere: revocar en el mismo tick puede cancelar la descarga en Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Baja un ZIP con los comprobantes que todavía no se descargaron (o todos) y su
 * índice. Devuelve cuántos entraron y cuántos quedan para otra tanda.
 *
 * Con `scope: 'all'` el servidor no tiene qué marcar para saber por dónde va:
 * `after` es el cursor que devolvió la tanda anterior (`next`). Vacío = última.
 */
export async function downloadProofsZip(scope = 'pending', { after = null, batch = null } = {}) {
  const { blob, headers } = await apiRequest('/api/payment-proofs/export', {
    method: 'POST',
    body: JSON.stringify(after ? { scope, after } : { scope }),
    responseType: 'blob',
    timeoutMs: 180_000,
  })
  const stamp = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `comprobantes-${stamp}${batch ? `-tanda-${batch}` : ''}.zip`)
  return {
    count: count(headers.get('X-Export-Count')),
    remaining: count(headers.get('X-Export-Remaining')),
    next: headers.get('X-Export-Next') || null,
  }
}

// Tope de seguridad: 100 archivos por tanda alcanzan de sobra para este volumen.
const MAX_ALL_BATCHES = 200

/**
 * Vuelve a bajar TODOS los comprobantes del servidor (por si se perdió un ZIP),
 * encadenando tandas hasta que el servidor no devuelva cursor.
 * @param {{ onBatch?: (batch: number) => void }} [options]
 */
export async function downloadAllProofs({ onBatch } = {}) {
  let after = null
  let total = 0
  for (let batch = 1; batch <= MAX_ALL_BATCHES; batch += 1) {
    onBatch?.(batch)
    const result = await downloadProofsZip('all', { after, batch })
    total += result.count
    if (!result.next) return { count: total, batches: batch }
    after = result.next
  }
  throw new Error('Se alcanzó el tope de tandas. Volvé a intentar para seguir.')
}

/** Lista (CSV) de todas las transferencias y el estado de su comprobante, sin archivos. */
export async function downloadProofIndex() {
  const { blob } = await apiRequest('/api/payment-proofs/index.csv', {
    responseType: 'blob',
    timeoutMs: 60_000,
  })
  triggerDownload(blob, `comprobantes-indice-${new Date().toISOString().slice(0, 10)}.csv`)
}

// ---------------------------------------------------------------------------
// Papelera
// ---------------------------------------------------------------------------

function mapTrashItem(item) {
  return {
    id: String(item?.id ?? ''),
    source: ['athlete', 'ticket', 'shop'].includes(item?.source) ? item.source : 'athlete',
    reference: item?.reference ?? null,
    person: item?.person ?? null,
    reason: item?.reason ?? 'manual',
    deletedAt: item?.deletedAt ?? null,
    purgeAt: item?.purgeAt ?? null,
    exportedAt: item?.exportedAt ?? null,
    // Sin dato, no se ofrece restaurar: la base igual lo valida, pero no se promete.
    restorable: item?.restorable === true,
  }
}

/** Lo que hay en la papelera, lo más reciente primero. */
export async function fetchProofTrash({ limit = PROOF_TRASH_PAGE, offset = 0 } = {}) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const result = await apiGet(`/api/payment-proofs/trash?${query}`)
  const items = Array.isArray(result?.items) ? result.items.map(mapTrashItem) : []
  return {
    items: items.filter((item) => item.id),
    total: count(result?.total),
    graceDays: validDays(result?.graceDays, PROOF_GRACE_DAYS),
  }
}

/** Vuelve a dejar el archivo como comprobante vigente de su orden. */
export async function restoreProofFile(fileId) {
  const result = await apiRequest(`/api/payment-proofs/trash/${encodeURIComponent(fileId)}/restore`, {
    method: 'POST',
    body: '{}',
  })
  return { restored: result?.restored === true }
}

/** "Eliminar ahora": se borra del servidor sin esperar el período y no se recupera. */
export async function purgeProofFile(fileId) {
  await apiRequest(`/api/payment-proofs/trash/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

/** Vacía la papelera (irreversible; el servidor exige la confirmación explícita). */
export async function emptyProofTrash() {
  const result = await apiRequest('/api/payment-proofs/trash/empty', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
    timeoutMs: 120_000,
  })
  return { purged: count(result?.purged), failed: count(result?.failed) }
}

/**
 * Baja manual del comprobante vigente de una orden ya resuelta: sale de
 * circulación y queda en la papelera, restaurable hasta que se cumple su período.
 * @param {{ source: 'athlete' | 'ticket' | 'shop', orderId: string }} order
 */
export async function trashOrderProof({ source, orderId }) {
  const result = await apiRequest(
    `/api/payment-proofs/orders/${encodeURIComponent(source)}/${encodeURIComponent(orderId)}/trash`,
    { method: 'POST', body: '{}' },
  )
  return { trashed: result?.trashed === true }
}

/** Dirección para ver un archivo de la papelera en otra pestaña (usa la sesión). */
export function proofTrashFileUrl(fileId) {
  return `${env.apiUrl}/api/payment-proofs/trash/${encodeURIComponent(fileId)}/file`
}
