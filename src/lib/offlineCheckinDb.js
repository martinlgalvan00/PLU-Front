import { createStore, del, get, keys, set } from 'idb-keyval'
import { memberCodeLookupCandidates, spokenMemberCode } from '../../shared/spokenMemberCode.js'
import { credentialLookupKeys } from './credentialQr.js'
import { competitorAccessWindowKey, competitorCheckInCountsToday } from './ticketValidityPolicy.js'
import { normalizeGateCode } from './ticketGateCode.js'

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

function todayRegistrationIds(entries, now = new Date()) {
  const today = competitorAccessWindowKey(now)
  const ids = new Set()
  for (const entry of entries ?? []) {
    if (entry && typeof entry === 'object' && entry.registrationId && entry.windowKey === today) {
      ids.add(entry.registrationId)
    }
  }
  return ids
}

/** El ingreso de ayer no sigue bloqueando la credencial. */
function refreshCompetitorDay(allowlist, now = new Date()) {
  if (!allowlist) return false
  const today = competitorAccessWindowKey(now)
  if (!today || allowlist.competitorDay === today) return false
  allowlist.competitorDay = today
  let changed = false
  for (const item of allowlist.registrations ?? []) {
    if (
      item.checkedInAt &&
      item.checkedInAt !== 'offline' &&
      !competitorCheckInCountsToday(item.checkedInAt, item.accessWindowKey, now)
    ) {
      item.checkedInAt = null
      changed = true
    }
    if (item.checkedInLocally && item.localWindowKey !== today) {
      item.checkedInLocally = false
      changed = true
    }
  }
  if (changed) invalidateAllowlistIndex(allowlist.eventSlug)
  return changed
}

function applyLocalAdmits(allowlist, admits, now = new Date()) {
  if (!allowlist || !admits) return
  const tickets = new Set(admits.tickets ?? [])
  const registrations = todayRegistrationIds(admits.registrations, now)
  const today = competitorAccessWindowKey(now)
  for (const item of allowlist.tickets ?? []) {
    if (item.qrToken && tickets.has(item.qrToken) && !item.checkedInAt) item.checkedInLocally = true
  }
  for (const item of allowlist.registrations ?? []) {
    const marked =
      (item.registrationId && registrations.has(item.registrationId)) ||
      (item.qrToken && tickets.has(item.qrToken))
    if (marked && !item.checkedInAt) {
      item.checkedInLocally = true
      item.localWindowKey = today
    }
  }
}

function targetKey(entry) {
  if (entry?.kind === 'registration') return `r:${entry.registrationId ?? ''}`
  return `t:${entry?.qrToken ?? ''}`
}

function rememberMemberCode(map, memberCode, item) {
  const member = String(memberCode ?? '').trim().toLowerCase()
  if (!member) return
  map.set(member, item)
  const spoken = spokenMemberCode(memberCode)
  if (!spoken) return
  map.set(spoken.display.toLowerCase(), item)
  map.set(spoken.compact.toLowerCase(), item)
  for (const candidate of memberCodeLookupCandidates(spoken.display)) {
    map.set(candidate.toLowerCase(), item)
  }
}

function indexGateCode(ticketsByCode, item) {
  const gate = normalizeGateCode(item.gateCode)
  if (!gate) return
  ticketsByCode.set(gate.toLowerCase(), item)
  ticketsByCode.set(gate.replace('-', '').toLowerCase(), item)
}

function indexOpaqueToken(map, token, item) {
  for (const key of credentialLookupKeys(token)) map.set(key, item)
}

function readOpaqueToken(map, code) {
  for (const key of credentialLookupKeys(code)) {
    const found = map.get(key)
    if (found) return found
  }
  return undefined
}

function buildAllowlistIndex(allowlist) {
  const ticketsByQr = new Map()
  const ticketsByCode = new Map()
  for (const item of allowlist.tickets ?? []) {
    indexOpaqueToken(ticketsByQr, item.qrToken, item)
    const code = (item.ticketCode ?? '').toLowerCase()
    if (code) ticketsByCode.set(code, item)
    indexGateCode(ticketsByCode, item)
  }

  const registrationsByCredential = new Map()
  const registrationsByQr = new Map()
  const registrationsByMember = new Map()
  for (const item of allowlist.registrations ?? []) {
    indexOpaqueToken(registrationsByCredential, item.credentialToken, item)
    indexOpaqueToken(registrationsByQr, item.qrToken, item)
    rememberMemberCode(registrationsByMember, item.memberCode, item)
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
      (previous?.registrations ?? []).filter(
        (item) => item?.localWindowKey === competitorAccessWindowKey(),
      ),
      (item) => item.registrationId,
      [...todayRegistrationIds(admits.registrations)],
    ),
  }
  await set(ALLOWLIST_KEY(eventSlug), payload, store)
  await set(ALLOWLIST_META_KEY(eventSlug), { downloadedAt, etag }, store)
  // Se reemplaza la foto anterior recién cuando la nueva ya está en disco.
  // La vista es otra referencia: un 304 mueve la hora sin reescribir las entradas.
  const view = { ...payload }
  refreshCompetitorDay(view)
  invalidateAllowlistIndex(eventSlug)
  allowlistMemory.set(eventSlug, view)
  indexFor(view)
  return view
}

/**
 * La lista no cambió (304). Solo se mueve la hora, sin reescribir miles de
 * entradas en IndexedDB. Los ingresos locales quedan donde estaban.
 */
export async function touchAllowlistDownload(eventSlug, etag = null) {
  const cached = allowlistMemory.get(eventSlug)
  if (cached) {
    const meta = {
      downloadedAt: new Date().toISOString(),
      etag: etag ?? cached.etag ?? null,
    }
    await set(ALLOWLIST_META_KEY(eventSlug), meta, store)
    cached.downloadedAt = meta.downloadedAt
    cached.etag = meta.etag
    return cached
  }

  const payload = await get(ALLOWLIST_KEY(eventSlug), store)
  if (!payload) return null
  const meta = {
    downloadedAt: new Date().toISOString(),
    etag: etag ?? payload.etag ?? null,
  }
  await set(ALLOWLIST_META_KEY(eventSlug), meta, store)
  const view = { ...payload, downloadedAt: meta.downloadedAt, etag: meta.etag }
  allowlistMemory.set(eventSlug, view)
  indexFor(view)
  return view
}

export async function getAllowlist(eventSlug) {
  const cached = allowlistMemory.get(eventSlug)
  if (cached) {
    if (refreshCompetitorDay(cached)) indexFor(cached)
    return cached
  }

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
  refreshCompetitorDay(view)
  applyLocalAdmits(view, admits)
  allowlistMemory.set(eventSlug, view)
  indexFor(view)
  return view
}

/**
 * Busca un código (qrToken opaco, ticketCode o el XXX-XXX de puerta) en la
 * allow-list descargada de un evento.
 */
export async function findInAllowlist(eventSlug, code) {
  const allowlist = await getAllowlist(eventSlug)
  if (!allowlist || !code) return null

  const index = indexFor(allowlist)
  const normalized = code.toLowerCase()
  const gate = normalizeGateCode(code)
  const memberKeys = new Set([normalized, ...memberCodeLookupCandidates(code).map((item) => item.toLowerCase())])

  const ticket =
    readOpaqueToken(index.ticketsByQr, code) ??
    index.ticketsByCode.get(normalized) ??
    (gate ? index.ticketsByCode.get(gate.toLowerCase()) : undefined)
  if (ticket) return { kind: 'ticket', entry: ticket }

  // `credentialToken` es el QR del perfil (uno por persona); `qrToken`, la
  // credencial impresa de la membresía, que se sigue aceptando.
  let registration =
    readOpaqueToken(index.registrationsByCredential, code) ??
    readOpaqueToken(index.registrationsByQr, code) ??
    null
  if (!registration) {
    for (const key of memberKeys) {
      registration = index.registrationsByMember.get(key)
      if (registration) break
    }
  }
  if (registration) return { kind: 'registration', entry: registration }

  return null
}

/**
 * La misma búsqueda por código que `POST /checkin/lookup`, contra la lista
 * descargada: sin red el guardia tiene que poder tipear el número impreso o el
 * DNI igual. Devuelve la forma de coincidencia del servidor más `entry`, para
 * validar offline sin volver a buscar.
 */
export async function findMatchesInAllowlist(
  eventSlug,
  { ticketCode = null, dni = null } = {},
) {
  const allowlist = await getAllowlist(eventSlug)
  if (!allowlist) return null

  const code = (ticketCode ?? '').toLowerCase()
  const tickets = allowlist.tickets
    .filter((item) =>
      ticketCode
        ? (item.ticketCode ?? '').toLowerCase() === code
        : String(item.attendeeDni ?? '') === dni,
    )
    .map((entry) => ({
      kind: 'ticket',
      code: entry.qrToken,
      ticketCode: entry.ticketCode ?? null,
      gateCode: entry.gateCode ?? null,
      name: entry.attendeeName,
      document: entry.attendeeDni,
      label: entry.credentialLabel ?? entry.ticketTypeName ?? null,
      status: entry.status,
      entry,
    }))

  const registrations = dni
    ? allowlist.registrations
        .filter((item) => String(item.athleteDocument ?? '') === dni)
        .map((entry) => ({
          kind: 'registration',
          code: entry.qrToken,
          ticketCode: null,
          name: entry.athleteName,
          document: entry.athleteDocument,
          label: null,
          status: entry.status,
          entry,
        }))
    : []

  return [...tickets, ...registrations]
}

/**
 * Marca localmente una entrada como ya escaneada mientras seguimos
 * offline -- evita que ESTE dispositivo deje pasar dos veces el mismo QR
 * antes de poder sincronizar contra el servidor.
 */
export function markCheckedInLocally(eventSlug, { qrToken, registrationId } = {}) {
  return withStoreWrite(async () => {
  const admits = (await get(LOCAL_ADMITS_KEY(eventSlug), store)) ?? {
    tickets: [],
    registrations: [],
  }
  if (!Array.isArray(admits.registrations)) admits.registrations = []
  if (!Array.isArray(admits.tickets)) admits.tickets = []
  // Inscripciones por id: un atleta sin membresía no tiene `qrToken`, y
  // comparar `null === null` marcaba como ingresados a todos los que tampoco.
  if (qrToken && !admits.tickets.includes(qrToken)) admits.tickets.push(qrToken)
  const windowKey = competitorAccessWindowKey()
  const alreadyAdmitted = (admits.registrations ?? []).some(
    (entry) => entry?.registrationId === registrationId && entry?.windowKey === windowKey,
  )
  if (registrationId && !alreadyAdmitted) {
    admits.registrations.push({ registrationId, windowKey })
  }
  await set(LOCAL_ADMITS_KEY(eventSlug), admits, store)

  const allowlist = allowlistMemory.get(eventSlug) ?? (await getAllowlist(eventSlug))
  applyLocalAdmits(allowlist, admits)
  })
}

async function getPendingQueue() {
  return (await get(PENDING_KEY, store)) ?? []
}

async function setPendingQueue(queue) {
  await set(PENDING_KEY, queue, store)
}

// IndexedDB cede el hilo entre el get y el set. Sin esta cola, dos ingresos
// a la vez leen la misma foto y el último write pisa al otro.
let storeWrite = Promise.resolve()
let storeWriteDepth = 0

function withStoreWrite(task) {
  if (storeWriteDepth > 0) return task()
  const run = storeWrite.then(async () => {
    storeWriteDepth += 1
    try {
      return await task()
    } finally {
      storeWriteDepth -= 1
    }
  })
  storeWrite = run.then(
    () => {},
    () => {},
  )
  return run
}

function forcedEntry(force, reason) {
  if (force !== 'validity' && force !== 'zone') return null
  const trimmed = typeof reason === 'string' ? reason.trim() : ''
  if (trimmed.length < 8) return null
  return { force, reason: trimmed.slice(0, 500) }
}

/** Encola un check-in hecho sin conexión para sincronizar más tarde. */
export function enqueueCheckin({
  eventSlug,
  kind,
  qrToken,
  registrationId,
  gate,
  label,
  force = null,
  reason = null,
}) {
  return withStoreWrite(async () => {
  const queue = await getPendingQueue()
  const key = targetKey({ kind, qrToken, registrationId })
  const exception = forcedEntry(force, reason)
  const existing = queue.find((item) => targetKey(item) === key)
  if (existing) {
    if (!exception) return existing
    const patched = {
      ...existing,
      ...exception,
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: null,
    }
    await setPendingQueue(queue.map((item) => (item.localId === existing.localId ? patched : item)))
    return patched
  }

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
    ...(exception ?? {}),
  }
  await setPendingQueue([...queue, entry])
  await markCheckedInLocally(eventSlug, { qrToken, registrationId })
  await noteSyncJournal({ ...entry, status: 'pending' })
  return entry
  })
}

/** Bitácora del puesto: qué QR quedó en el teléfono y en qué terminó. */
export function noteSyncJournal(entry) {
  return withStoreWrite(async () => {
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
  })
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
export function updatePending(localId, patch) {
  return withStoreWrite(async () => {
  const queue = await getPendingQueue()
  await setPendingQueue(
    queue.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
  )
  })
}

export async function listPending() {
  return getPendingQueue()
}

/** Vuelve a dejar en cola los ingresos que ya fallaron tres veces. */
export function reopenExhaustedCheckins() {
  return withStoreWrite(async () => {
  const queue = await getPendingQueue()
  let reopened = 0
  const next = queue.map((item) => {
    if (item.status !== 'exhausted') return item
    reopened += 1
    return { ...item, status: 'pending', attemptCount: 0, nextAttemptAt: null }
  })
  if (reopened > 0) await setPendingQueue(next)
  return reopened
  })
}

export function removePending(localId) {
  return withStoreWrite(async () => {
  const queue = await getPendingQueue()
  await setPendingQueue(queue.filter((item) => item.localId !== localId))
  })
}

export async function listResolvedConflicts() {
  return (await get(CONFLICTS_KEY, store)) ?? []
}

/** Log corto de auditoría: check-ins offline que perdieron la carrera contra otro dispositivo. */
export function addResolvedConflict(entry) {
  return withStoreWrite(async () => {
  const conflicts = await listResolvedConflicts()
  await set(
    CONFLICTS_KEY,
    [{ ...entry, resolvedAt: new Date().toISOString() }, ...conflicts].slice(0, 50),
    store,
  )
  })
}

/**
 * Cola de telemetría de escaneo (`src/services/checkinTelemetry.js`) para
 * cuando `flush()` no tiene señal -- el mismo patrón que `pendingQueue`, pero
 * para intentos, no para check-ins reales. Se drena cuando vuelve la
 * conexión (`useOfflineCheckinSync.js`).
 */
export function enqueueScanEvent(attempt) {
  return withStoreWrite(async () => {
  const queue = (await get(SCAN_TELEMETRY_KEY, store)) ?? []
  const next = [...queue, attempt].slice(-SCAN_TELEMETRY_MAX)
  await set(SCAN_TELEMETRY_KEY, next, store)
  })
}

export async function listPendingScanEvents() {
  return (await get(SCAN_TELEMETRY_KEY, store)) ?? []
}

/** Saca del disco sólo los intentos ya confirmados por el servidor. */
export function clearScanEvents(clientIds) {
  return withStoreWrite(async () => {
  const ids = new Set(clientIds)
  const queue = (await get(SCAN_TELEMETRY_KEY, store)) ?? []
  await set(
    SCAN_TELEMETRY_KEY,
    queue.filter((item) => !ids.has(item.clientId)),
    store,
  )
  })
}
