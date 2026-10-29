import { CHECKIN_SYNC, nextRetryDelayMs } from '../lib/checkinSyncConfig.js'
import {
  addResolvedConflict,
  downloadAllowlist as saveAllowlist,
  getAllowlist,
  listPending,
  noteSyncJournal,
  removePending,
  touchAllowlistDownload,
  updatePending,
} from '../lib/offlineCheckinDb.js'
import { checkInRegistration, getEventCheckinAllowlist } from './athleteApi.js'
import { checkInTicket } from './ticketApi.js'
import { classifyCheckinFailure, isAlreadyAdmittedConflict } from './checkinFailure.js'

/**
 * offlineCheckinSync.js — PLU ARG
 *
 * Descarga la allow-list de un evento y drena la cola de check-ins hechos
 * sin conexión (offlineCheckinDb.js) contra el backend real, en orden
 * FIFO. La garantía de "no se puede dejar pasar dos veces" no se
 * reinventa acá: ya existe en el unique() de check_ins (ver
 * supabase/migrations/20260706030000_phase1_events_ticketing.sql) — el
 * primer check-in que llega al servidor gana, el segundo choca (PLU06,
 * status 409) y eso es lo que este módulo interpreta como "conflicto
 * resuelto", no como un error.
 */

function asAllowlistResponse(result) {
  if (result && Object.hasOwn(result, 'notModified')) return result
  return { notModified: false, etag: result?.etag ?? null, data: result }
}

export async function downloadAllowlist(eventSlug) {
  const cached = await getAllowlist(eventSlug)
  const result = asAllowlistResponse(
    await getEventCheckinAllowlist(eventSlug, { etag: cached?.etag ?? null }),
  )
  if (result.notModified) {
    return (await touchAllowlistDownload(eventSlug, result.etag)) ?? cached
  }
  return saveAllowlist(eventSlug, result.data ?? {}, { etag: result.etag ?? null })
}

function pendingKey(entry) {
  if (entry?.kind === 'registration') return `r:${entry.registrationId ?? ''}`
  return `t:${entry?.qrToken ?? ''}`
}

function isDue(entry, now) {
  if (entry.status === 'exhausted') return false
  if (!entry.nextAttemptAt) return true
  const at = Date.parse(entry.nextAttemptAt)
  return Number.isNaN(at) || at <= now
}

async function scheduleRetry(entry, failure, now) {
  const attemptCount = (entry.attemptCount ?? 0) + 1
  if (attemptCount >= CHECKIN_SYNC.maxAttempts) {
    await updatePending(entry.localId, {
      attemptCount,
      status: 'exhausted',
      nextAttemptAt: null,
      lastError: failure,
    })
    await noteSyncJournal({ ...entry, status: 'exhausted' })
    return { localId: entry.localId, outcome: 'exhausted', attemptCount }
  }

  const nextAttemptAt = new Date(now + nextRetryDelayMs(attemptCount)).toISOString()
  await updatePending(entry.localId, {
    attemptCount,
    status: 'pending',
    nextAttemptAt,
    lastError: failure,
  })
  return { localId: entry.localId, outcome: 'retry', nextAttemptAt, attemptCount }
}

async function syncEntry(entry, now) {
  try {
    if (entry.kind === 'ticket') {
      await checkInTicket(entry.qrToken, entry.gate)
    } else {
      await checkInRegistration(entry.registrationId, entry.gate)
    }
    await removePending(entry.localId)
    await noteSyncJournal({ ...entry, status: 'synced' })
    return { localId: entry.localId, outcome: 'ok' }
  } catch (error) {
    const failure = classifyCheckinFailure(error)

    if (failure === 'rejected') {
      await removePending(entry.localId)
      // Sólo PLU06 es la carrera entre dos dispositivos ("ya ingresó"). Un
      // vencido, no vigente, zona incorrecta o sin pago también llega como 409,
      // pero acá la persona ya pasó por la puerta con un veredicto local: se
      // guarda con su motivo para que Administración lo revise, no se descarta
      // como si nada.
      const reason = error?.body?.code ?? null
      const status = isAlreadyAdmittedConflict(error) ? 'conflict' : 'rejected'
      await addResolvedConflict({ ...entry, reason })
      await noteSyncJournal({ ...entry, status, reason })
      return {
        localId: entry.localId,
        outcome: status,
        reason,
      }
    }
    if (failure === 'not_found') {
      await removePending(entry.localId)
      await noteSyncJournal({ ...entry, status: 'not_found' })
      return { localId: entry.localId, outcome: 'not_found' }
    }
    // Sesión vencida o sin permiso: reintentar no lo arregla y el operador
    // tiene que saberlo. Queda en la cola, sin consumir intentos.
    if (failure === 'auth') return { localId: entry.localId, outcome: 'auth' }

    // Red caída, 429, 5xx u otro fallo transitorio: backoff y tope.
    return scheduleRetry(entry, failure, now)
  }
}

/**
 * Drena la cola contra el servidor. El orden de arranque es FIFO. A la vez
 * salen como máximo `concurrency` ingresos, y nunca dos del mismo QR.
 * Con la sesión vencida no se arrancan más: el resto recibiría lo mismo.
 * Lo que ya está en vuelo puede terminar.
 */
export async function syncPendingCheckins({
  now = Date.now(),
  concurrency = CHECKIN_SYNC.concurrency,
} = {}) {
  const queue = await listPending()
  const due = []
  const seen = new Set()
  for (const entry of queue) {
    if (!isDue(entry, now)) continue
    const key = pendingKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    due.push(entry)
  }

  if (due.length === 0) return []

  const results = []
  let cursor = 0
  let authStopped = false

  async function worker() {
    while (!authStopped) {
      const index = cursor
      cursor += 1
      if (index >= due.length) return
      const result = await syncEntry(due[index], now)
      results.push(result)
      if (result.outcome === 'auth') authStopped = true
    }
  }

  const width = Math.max(1, Math.min(concurrency, due.length))
  await Promise.all(Array.from({ length: width }, () => worker()))
  return results
}
