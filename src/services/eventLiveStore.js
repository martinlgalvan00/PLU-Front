import { fetchEventRegistrationSummary } from './eventRegistrationApi.js'
import { fetchTicketAvailability } from './ticketApi.js'

/**
 * eventLiveStore.js — cache compartida de los datos live de un evento
 * (cupos de inscripción y disponibilidad de entradas).
 *
 * Por qué existe: los dos datasets se leen desde varias superficies a la vez
 * (Home + Pitbull para cupos; Tickets, Shop y su drawer para entradas) y cada
 * hook disparaba su propio fetch. En la lista de Shop eso eran tres requests
 * al mismo endpoint en el mismo render, y después de comprar o inscribirse
 * nadie invalidaba nada: el número seguía siendo el de antes hasta recargar.
 *
 * Esta capa resuelve tres cosas y nada más:
 * - Un solo request en vuelo por clave (los suscriptores comparten la promesa).
 * - TTL: suscribirse con dato fresco no vuelve a pedir.
 * - `invalidate*`: después de una inscripción o una compra el próximo lector
 *   trae dato nuevo, y los que ya están montados se enteran en el momento.
 *
 * La autoridad del dato sigue siendo el backend: acá no se calcula ni se
 * corrige nada, solo se reparte la última respuesta.
 */

const REGISTRATION_TTL_MS = 15_000
const AVAILABILITY_TTL_MS = 15_000

function createLiveStore({ fetcher, ttlMs }) {
  /** key → { data, fetchedAt, inFlight, failed, refreshAfterFlight, listeners } */
  const entries = new Map()

  function entryFor(key) {
    let entry = entries.get(key)
    if (!entry) {
      entry = {
        data: null,
        fetchedAt: 0,
        inFlight: null,
        failed: false,
        // Una mutación puede llegar mientras la lectura anterior aún viaja.
        // En ese caso esa respuesta ya no es suficiente, aunque llegue luego.
        refreshAfterFlight: false,
        listeners: new Set(),
      }
      entries.set(key, entry)
    }
    return entry
  }

  function snapshotOf(entry) {
    return {
      data: entry.data,
      // `stale` no es "inválido": es dato viejo que sigue sirviendo para
      // pintar mientras llega el nuevo.
      stale: entry.fetchedAt === 0 || Date.now() - entry.fetchedAt > ttlMs,
      failed: entry.failed,
      loading: Boolean(entry.inFlight),
    }
  }

  function emit(key) {
    const entry = entries.get(key)
    if (!entry) return
    const snapshot = snapshotOf(entry)
    for (const listener of entry.listeners) listener(snapshot)
  }

  function read(key) {
    if (!key) return null
    const entry = entries.get(key)
    return entry ? snapshotOf(entry) : null
  }

  function load(key, { force = false } = {}) {
    if (!key) return Promise.resolve(null)
    const entry = entryFor(key)

    if (entry.inFlight) return entry.inFlight
    if (!force && entry.data && Date.now() - entry.fetchedAt <= ttlMs) {
      return Promise.resolve(entry.data)
    }

    entry.inFlight = fetcher(key)
      .then((data) => {
        entry.data = data
        entry.fetchedAt = Date.now()
        entry.failed = false
        return data
      })
      .catch((error) => {
        // Se conserva el último dato bueno: un error de red no debe
        // convertir un cupo real en "sin datos".
        entry.failed = true
        if (entry.fetchedAt === 0) entry.fetchedAt = 0
        throw error
      })
      .finally(() => {
        entry.inFlight = null
        emit(key)
        // No perder una invalidación que ocurrió mientras este request estaba
        // en vuelo. Sin esta segunda lectura, la landing podía volver a pintar
        // el contador anterior hasta el próximo polling.
        if (entry.refreshAfterFlight) {
          entry.refreshAfterFlight = false
          load(key, { force: true }).catch(() => {})
        }
        // Sin nadie escuchando y sin dato útil no vale la pena mantener la
        // entrada viva (evita que el Map crezca por slugs de una sola visita).
        if (entry.listeners.size === 0 && !entry.data) entries.delete(key)
      })

    emit(key)
    return entry.inFlight
  }

  function subscribe(key, listener) {
    if (!key) return () => {}
    const entry = entryFor(key)
    entry.listeners.add(listener)
    return () => {
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0 && !entry.inFlight && !entry.data) entries.delete(key)
    }
  }

  /**
   * Marca la clave como vencida. Con suscriptores activos se refetchea ya
   * mismo (el contador de la landing se mueve solo); sin suscriptores alcanza
   * con que el próximo lector no reuse la respuesta vieja.
   */
  function invalidate(key) {
    if (!key) return
    const entry = entries.get(key)
    if (!entry) return
    entry.fetchedAt = 0
    if (entry.inFlight) {
      entry.refreshAfterFlight = true
      emit(key)
      return
    }
    if (entry.listeners.size > 0) {
      load(key, { force: true }).catch(() => {})
      return
    }
    emit(key)
  }

  function invalidateAll() {
    for (const key of [...entries.keys()]) invalidate(key)
  }

  return { read, load, subscribe, invalidate, invalidateAll }
}

export const registrationSummaryStore = createLiveStore({
  fetcher: fetchEventRegistrationSummary,
  ttlMs: REGISTRATION_TTL_MS,
})

export const ticketAvailabilityStore = createLiveStore({
  fetcher: fetchTicketAvailability,
  ttlMs: AVAILABILITY_TTL_MS,
})

/** Después de crear una inscripción de atleta para ese evento. */
export function invalidateEventRegistrationSummary(eventSlug) {
  registrationSummaryStore.invalidate(eventSlug)
}

/** Después de crear una orden de entradas para ese evento. */
export function invalidateTicketAvailability(eventSlug) {
  ticketAvailabilityStore.invalidate(eventSlug)
}

/**
 * Un pago cambió de estado y no sabemos de qué evento era (webhook, retorno
 * de Mercado Pago, aprobación manual del panel): se vencen las dos caches.
 */
export function invalidateEventLiveData() {
  registrationSummaryStore.invalidateAll()
  ticketAvailabilityStore.invalidateAll()
}
