import { ApiError } from '../lib/api.js'
import {
  addResolvedConflict,
  downloadAllowlist as saveAllowlist,
  listPending,
  removePending,
} from '../lib/offlineCheckinDb.js'
import { checkInRegistration, getEventCheckinAllowlist } from './athleteApi.js'
import { checkInTicket } from './ticketApi.js'

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

export async function downloadAllowlist(eventSlug) {
  const data = await getEventCheckinAllowlist(eventSlug)
  return saveAllowlist(eventSlug, data)
}

async function syncEntry(entry) {
  try {
    if (entry.kind === 'ticket') {
      await checkInTicket(entry.qrToken, entry.gate)
    } else {
      await checkInRegistration(entry.registrationId, entry.gate)
    }
    await removePending(entry.localId)
    return { localId: entry.localId, outcome: 'ok' }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await removePending(entry.localId)
      await addResolvedConflict(entry)
      return { localId: entry.localId, outcome: 'conflict' }
    }
    if (error instanceof ApiError && error.status === 404) {
      await removePending(entry.localId)
      return { localId: entry.localId, outcome: 'not_found' }
    }
    // Error de red (o el servidor sigue sin responder) -- se deja en la
    // cola, el próximo ciclo de sync lo reintenta.
    return { localId: entry.localId, outcome: 'retry' }
  }
}

/** Recorre la cola pendiente en orden FIFO y la sincroniza contra el servidor. */
export async function syncPendingCheckins() {
  const queue = await listPending()
  const results = []
  for (const entry of queue) {
    // eslint-disable-next-line no-await-in-loop -- FIFO intencional, no en paralelo
    results.push(await syncEntry(entry))
  }
  return results
}
