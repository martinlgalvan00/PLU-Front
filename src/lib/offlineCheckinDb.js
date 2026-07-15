import { createStore, get, set } from 'idb-keyval'

/**
 * offlineCheckinDb.js — PLU ARG
 *
 * Almacén local (IndexedDB) para que el scanner de seguridad siga
 * funcionando con conectividad inestable en la puerta del evento: una
 * "allow-list" descargada de antemano (get_event_checkin_allowlist) para
 * seguir validando sin conexión, y una cola de check-ins hechos offline
 * para sincronizar cuando vuelva la señal (ver offlineCheckinSync.js).
 *
 * IndexedDB en vez de localStorage: el límite de ~5MB y la API síncrona de
 * localStorage no son apropiados para una lista de todo un evento (podés
 * tener miles de entradas/inscripciones).
 */

const store = createStore('plu-checkin-offline', 'kv')

const ALLOWLIST_KEY = (eventSlug) => `allowlist:${eventSlug}`
const PENDING_KEY = 'pendingQueue'
const CONFLICTS_KEY = 'resolvedConflicts'
const DEVICE_ID_KEY = 'plu-checkin-device-id'

export function getDeviceId() {
  if (typeof window === 'undefined') return 'server'

  let id = window.localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/** Guarda el snapshot descargado de un evento, reemplazando el anterior. */
export async function downloadAllowlist(eventSlug, data) {
  const payload = {
    eventSlug,
    downloadedAt: new Date().toISOString(),
    tickets: (data.tickets ?? []).map((item) => ({ ...item, checkedInLocally: false })),
    registrations: (data.registrations ?? []).map((item) => ({ ...item, checkedInLocally: false })),
  }
  await set(ALLOWLIST_KEY(eventSlug), payload, store)
  return payload
}

export async function getAllowlist(eventSlug) {
  return (await get(ALLOWLIST_KEY(eventSlug), store)) ?? null
}

/**
 * Busca un código (qrToken opaco, o el código/ticketCode legible para
 * pegado manual) en la allow-list descargada de un evento.
 */
export async function findInAllowlist(eventSlug, code) {
  const allowlist = await getAllowlist(eventSlug)
  if (!allowlist) return null

  const normalized = (code ?? '').toLowerCase()

  const ticket = allowlist.tickets.find(
    (item) => item.qrToken === code || (item.ticketCode ?? '').toLowerCase() === normalized,
  )
  if (ticket) return { kind: 'ticket', entry: ticket }

  const registration = allowlist.registrations.find(
    (item) => item.qrToken === code || (item.memberCode ?? '').toLowerCase() === normalized,
  )
  if (registration) return { kind: 'registration', entry: registration }

  return null
}

/**
 * Marca localmente una entrada como ya escaneada mientras seguimos
 * offline -- evita que ESTE dispositivo deje pasar dos veces el mismo QR
 * antes de poder sincronizar contra el servidor.
 */
export async function markCheckedInLocally(eventSlug, qrToken) {
  const allowlist = await getAllowlist(eventSlug)
  if (!allowlist) return

  const patch = (item) => (item.qrToken === qrToken ? { ...item, checkedInLocally: true } : item)
  allowlist.tickets = allowlist.tickets.map(patch)
  allowlist.registrations = allowlist.registrations.map(patch)
  await set(ALLOWLIST_KEY(eventSlug), allowlist, store)
}

async function getPendingQueue() {
  return (await get(PENDING_KEY, store)) ?? []
}

async function setPendingQueue(queue) {
  await set(PENDING_KEY, queue, store)
}

/** Encola un check-in hecho sin conexión para sincronizar más tarde. */
export async function enqueueCheckin({ eventSlug, kind, qrToken, registrationId, gate }) {
  const queue = await getPendingQueue()
  const entry = {
    localId: crypto.randomUUID(),
    eventSlug,
    kind,
    qrToken,
    registrationId,
    gate: gate ?? null,
    deviceId: getDeviceId(),
    queuedAt: new Date().toISOString(),
    status: 'pending',
  }
  await setPendingQueue([...queue, entry])
  await markCheckedInLocally(eventSlug, qrToken)
  return entry
}

export async function listPending() {
  return getPendingQueue()
}

export async function removePending(localId) {
  const queue = await getPendingQueue()
  await setPendingQueue(queue.filter((item) => item.localId !== localId))
}

export async function listResolvedConflicts() {
  return (await get(CONFLICTS_KEY, store)) ?? []
}

/** Log corto de auditoría: check-ins offline que perdieron la carrera contra otro dispositivo. */
export async function addResolvedConflict(entry) {
  const conflicts = await listResolvedConflicts()
  await set(CONFLICTS_KEY, [{ ...entry, resolvedAt: new Date().toISOString() }, ...conflicts].slice(0, 50), store)
}
