import { createStore, del, get, keys, set } from 'idb-keyval'

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
const ALLOWLIST_META_KEY = (eventSlug) => `allowlist-meta:${eventSlug}`
const LOCAL_ADMITS_KEY = (eventSlug) => `local-admits:${eventSlug}`

// La última foto leída. El escaneo no vuelve a IndexedDB en cada QR.
const allowlistMemory = new Map()
const PENDING_KEY = 'pendingQueue'
const CONFLICTS_KEY = 'resolvedConflicts'
const JOURNAL_KEY = 'syncJournal'
const JOURNAL_MAX = 40
const DEVICE_ID_KEY = 'plu-checkin-device-id'
const SCAN_TELEMETRY_KEY = 'scanTelemetryQueue'
// Tope de la cola: sin señal por mucho tiempo, un escaneo repetido no puede
// crecer sin límite. Se descarta lo más viejo primero -- el detalle exacto de
// un escaneo de hace tres días importa menos que no perder los recientes.
const SCAN_TELEMETRY_MAX = 500

// Índice en memoria de la última foto leída. Se invalida al guardar de nuevo:
// un find() lineal por escaneo no escala con miles de entradas.
const allowlistIndex = new Map()

function invalidateAllowlistIndex(eventSlug) {
  if (eventSlug) allowlistIndex.delete(eventSlug)
  else allowlistIndex.clear()
}

function forgetAllowlist(eventSlug) {
  if (eventSlug) allowlistMemory.delete(eventSlug)
  else allowlistMemory.clear()
  invalidateAllowlistIndex(eventSlug)
}

function applyLocalAdmits(allowlist, admits) {
  if (!allowlist || !admits) return
  const tickets = new Set(admits.tickets ?? [])
  const registrations = new Set(admits.registrations ?? [])
  for (const item of allowlist.tickets ?? []) {
    if (item.qrToken && tickets.has(item.qrToken) && !item.checkedInAt) item.checkedInLocally = true
  }
  for (const item of allowlist.registrations ?? []) {
    const marked =
      (item.registrationId && registrations.has(item.registrationId)) ||
      (item.qrToken && tickets.has(item.qrToken))
    if (marked && !item.checkedInAt) item.checkedInLocally = true
  }
}

function targetKey(entry) {
  if (entry?.kind === 'registration') return `r:${entry.registrationId ?? ''}`
  return `t:${entry?.qrToken ?? ''}`
}

function buildAllowlistIndex(allowlist) {
  const ticketsByQr = new Map()
  const ticketsByCode = new Map()
  for (const item of allowlist.tickets ?? []) {
    if (item.qrToken) ticketsByQr.set(item.qrToken, item)
    const code = (item.ticketCode ?? '').toLowerCase()
    if (code) ticketsByCode.set(code, item)
  }

  const registrationsByCredential = new Map()
  const registrationsByQr = new Map()
  const registrationsByMember = new Map()
  for (const item of allowlist.registrations ?? []) {
    if (item.credentialToken) registrationsByCredential.set(item.credentialToken, item)
    if (item.qrToken) registrationsByQr.set(item.qrToken, item)
    const member = (item.memberCode ?? '').toLowerCase()
    if (member) registrationsByMember.set(member, item)
  }

  return {
    etag: allowlist.etag ?? null,
    revision: allowlist.revision ?? 0,
    ticketsByQr,
    ticketsByCode,
    registrationsByCredential,
    registrationsByQr,
    registrationsByMember,
  }
}

function indexFor(allowlist) {
  const cached = allowlistIndex.get(allowlist.eventSlug)
  // La hora de descarga no entra: un 304 solo mueve el reloj y la foto es la misma.
  if (
    cached &&
    cached.revision === (allowlist.revision ?? 0) &&
    (cached.etag ?? null) === (allowlist.etag ?? null)
  ) {
    return cached
  }
  const next = buildAllowlistIndex(allowlist)
  allowlistIndex.set(allowlist.eventSlug, next)
  return next
}

export function getDeviceId() {
  if (typeof window === 'undefined') return 'server'

  let id = window.localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    window.localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * Borra del dispositivo lo que identifica personas: las listas descargadas
 * (nombre y documento de cada entrada o inscripción) y el log de conflictos.
 * La cola de ingresos pendientes NO se toca: sólo lleva el código del QR y el
 * puesto, y borrarla perdería ingresos que todavía no llegaron al servidor.
 * Se llama al cerrar sesión: el teléfono de la puerta se presta y se pierde.
 */
export async function purgeOfflineCheckinData() {
  const stored = await keys(store)
  await Promise.all(
    stored
      .filter(
        (key) =>
          typeof key === 'string' &&
          (key.startsWith('allowlist:') ||
            key.startsWith('allowlist-meta:') ||
            key.startsWith('local-admits:')),
      )
      .map((key) => del(key, store)),
  )
  await del(CONFLICTS_KEY, store)
  await del(JOURNAL_KEY, store)
  forgetAllowlist()
}

/** Código corto para la lista del puesto. No guarda nombre ni documento. */
export function doorSyncLabel({ label, qrToken, registrationId } = {}) {
  const explicit = String(label ?? '').trim()
  if (explicit) return explicit
  const raw = String(qrToken || registrationId || '').trim()
  if (!raw) return '—'
  if (raw.length <= 12) return raw
  return `…${raw.slice(-6)}`
}

function mergeLocalAdmissions(nextItems, previousItems, idOf, admittedIds) {
  const pending = new Set(admittedIds ?? [])
  for (const item of previousItems ?? []) {
    if (!item?.checkedInLocally) continue
    const id = idOf(item)
    if (id) pending.add(id)
  }
  return (nextItems ?? []).map((item) => {
    const id = idOf(item)
    const keep = Boolean(id) && pending.has(id) && !item.checkedInAt
    return { ...item, checkedInLocally: keep }
  })
}

/** Guarda el snapshot descargado de un evento, reemplazando el anterior. */
export async function downloadAllowlist(eventSlug, data, { etag = null } = {}) {
  const previous = await get(ALLOWLIST_KEY(eventSlug), store)
  const admits = (await get(LOCAL_ADMITS_KEY(eventSlug), store)) ?? {}
  const downloadedAt = new Date().toISOString()
  const payload = {
    eventSlug,
    downloadedAt,
    revision: 0,
    etag,
    tickets: mergeLocalAdmissions(
      data.tickets,
      previous?.tickets,
      (item) => item.qrToken,
      admits.tickets,
    ),
    registrations: mergeLocalAdmissions(
      data.registrations,
      previous?.registrations,
      (item) => item.registrationId,
      admits.registrations,
    ),
  }
  await set(ALLOWLIST_KEY(eventSlug), payload, store)
  await set(ALLOWLIST_META_KEY(eventSlug), { downloadedAt, etag }, store)
  forgetAllowlist(eventSlug)
  return payload
}

/**
 * La lista no cambió (304). Solo se mueve la hora, sin reescribir miles de
 * entradas en IndexedDB. Los ingresos locales quedan donde estaban.
 */
export async function touchAllowlistDownload(eventSlug, etag = null) {
  const payload = await get(ALLOWLIST_KEY(eventSlug), store)
  if (!payload) return null
  const meta = {
    downloadedAt: new Date().toISOString(),
    etag: etag ?? payload.etag ?? null,
  }
  await set(ALLOWLIST_META_KEY(eventSlug), meta, store)
  const cached = allowlistMemory.get(eventSlug)
  if (cached) {
    cached.downloadedAt = meta.downloadedAt
    cached.etag = meta.etag
    return cached
  }
  return { ...payload, downloadedAt: meta.downloadedAt, etag: meta.etag }
}

export async function getAllowlist(eventSlug) {
  const cached = allowlistMemory.get(eventSlug)
  if (cached) return cached

  const payload = (await get(ALLOWLIST_KEY(eventSlug), store)) ?? null
  if (!payload) return null
  const [meta, admits] = await Promise.all([
    get(ALLOWLIST_META_KEY(eventSlug), store),
    get(LOCAL_ADMITS_KEY(eventSlug), store),
  ])
  const view = {
    ...payload,
    downloadedAt: meta?.downloadedAt ?? payload.downloadedAt,
    etag: meta?.etag ?? payload.etag ?? null,
  }
  applyLocalAdmits(view, admits)
  allowlistMemory.set(eventSlug, view)
  return view
}

/**
 * Busca un código (qrToken opaco, o el código/ticketCode legible para
 * pegado manual) en la allow-list descargada de un evento.
 */
export async function findInAllowlist(eventSlug, code) {
  const allowlist = await getAllowlist(eventSlug)
  if (!allowlist || !code) return null

  const index = indexFor(allowlist)
  const normalized = code.toLowerCase()

  const ticket = index.ticketsByQr.get(code) ?? index.ticketsByCode.get(normalized)
  if (ticket) return { kind: 'ticket', entry: ticket }

  // `credentialToken` es el QR del perfil (uno por persona); `qrToken`, la
  // credencial impresa de la membresía, que se sigue aceptando.
  const registration =
    index.registrationsByCredential.get(code) ??
    index.registrationsByQr.get(code) ??
    index.registrationsByMember.get(normalized)
  if (registration) return { kind: 'registration', entry: registration }

  return null
}

/**
 * Marca localmente una entrada como ya escaneada mientras seguimos
 * offline -- evita que ESTE dispositivo deje pasar dos veces el mismo QR
 * antes de poder sincronizar contra el servidor.
 */
export async function markCheckedInLocally(eventSlug, { qrToken, registrationId } = {}) {
  const admits = (await get(LOCAL_ADMITS_KEY(eventSlug), store)) ?? {
    tickets: [],
    registrations: [],
  }
  // Inscripciones por id: un atleta sin membresía no tiene `qrToken`, y
  // comparar `null === null` marcaba como ingresados a todos los que tampoco.
  if (qrToken && !admits.tickets.includes(qrToken)) admits.tickets.push(qrToken)
  if (registrationId && !admits.registrations.includes(registrationId)) {
    admits.registrations.push(registrationId)
  }
  await set(LOCAL_ADMITS_KEY(eventSlug), admits, store)

  const allowlist = allowlistMemory.get(eventSlug) ?? (await getAllowlist(eventSlug))
  applyLocalAdmits(allowlist, admits)
}

async function getPendingQueue() {
  return (await get(PENDING_KEY, store)) ?? []
}

async function setPendingQueue(queue) {
  await set(PENDING_KEY, queue, store)
}

/** Encola un check-in hecho sin conexión para sincronizar más tarde. */
export async function enqueueCheckin({ eventSlug, kind, qrToken, registrationId, gate, label }) {
  const queue = await getPendingQueue()
  const key = targetKey({ kind, qrToken, registrationId })
  const existing = queue.find((item) => targetKey(item) === key)
  if (existing) return existing

  const entry = {
    localId: crypto.randomUUID(),
    eventSlug,
    kind,
    qrToken,
    registrationId,
    gate: gate ?? null,
    label: doorSyncLabel({ label, qrToken, registrationId }),
    deviceId: getDeviceId(),
    queuedAt: new Date().toISOString(),
    attemptCount: 0,
    nextAttemptAt: null,
    status: 'pending',
  }
  await setPendingQueue([...queue, entry])
  await markCheckedInLocally(eventSlug, { qrToken, registrationId })
  await noteSyncJournal({ ...entry, status: 'pending' })
  return entry
}

/** Bitácora del puesto: qué QR quedó en el teléfono y en qué terminó. */
export async function noteSyncJournal(entry) {
  const journal = (await get(JOURNAL_KEY, store)) ?? []
  const next = {
    localId: entry.localId,
    label: doorSyncLabel(entry),
    gate: entry.gate ?? null,
    status: entry.status,
    reason: entry.reason ?? null,
    at: new Date().toISOString(),
  }
  await set(
    JOURNAL_KEY,
    [next, ...journal.filter((item) => item.localId !== next.localId)].slice(0, JOURNAL_MAX),
    store,
  )
}

export async function listSyncJournal() {
  return (await get(JOURNAL_KEY, store)) ?? []
}

/**
 * Lo que el puesto puede mirar. La cola manda mientras el ingreso no salió:
 * al sincronizar, queda la bitácora (registrado, ya ingresado, rechazado).
 */
export async function listDoorSyncStatus() {
  const [pending, journal] = await Promise.all([getPendingQueue(), listSyncJournal()])
  const pendingIds = new Set(pending.map((item) => item.localId))
  const open = pending.map((item) => ({
    localId: item.localId,
    label: doorSyncLabel(item),
    gate: item.gate ?? null,
    status: item.status === 'exhausted' ? 'exhausted' : 'pending',
    at: item.queuedAt,
  }))
  const closed = journal.filter((item) => !pendingIds.has(item.localId))
  return [...open, ...closed]
}

/** Actualiza intentos, backoff o el tope de una entrada que sigue en la cola. */
export async function updatePending(localId, patch) {
  const queue = await getPendingQueue()
  await setPendingQueue(
    queue.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
  )
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
  await set(
    CONFLICTS_KEY,
    [{ ...entry, resolvedAt: new Date().toISOString() }, ...conflicts].slice(0, 50),
    store,
  )
}

/**
 * Cola de telemetría de escaneo (`src/services/checkinTelemetry.js`) para
 * cuando `flush()` no tiene señal -- el mismo patrón que `pendingQueue`, pero
 * para intentos, no para check-ins reales. Se drena cuando vuelve la
 * conexión (`useOfflineCheckinSync.js`).
 */
export async function enqueueScanEvent(attempt) {
  const queue = (await get(SCAN_TELEMETRY_KEY, store)) ?? []
  const next = [...queue, attempt].slice(-SCAN_TELEMETRY_MAX)
  await set(SCAN_TELEMETRY_KEY, next, store)
}

export async function listPendingScanEvents() {
  return (await get(SCAN_TELEMETRY_KEY, store)) ?? []
}

/** Saca del disco sólo los intentos ya confirmados por el servidor. */
export async function clearScanEvents(clientIds) {
  const ids = new Set(clientIds)
  const queue = (await get(SCAN_TELEMETRY_KEY, store)) ?? []
  await set(
    SCAN_TELEMETRY_KEY,
    queue.filter((item) => !ids.has(item.clientId)),
    store,
  )
}
