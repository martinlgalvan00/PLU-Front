import { ApiError } from '../lib/api.js'
import { getDeviceId, enqueueScanEvent, listPendingScanEvents, clearScanEvents } from '../lib/offlineCheckinDb.js'
import { reportScanTelemetry } from './ticketApi.js'

/**
 * checkinTelemetry.js — PLU ARG
 *
 * Reporta al servidor cada veredicto que el navegador resolvió al escanear,
 * haya terminado o no en un ingreso confirmado. Para un rechazo (vencido,
 * zona incorrecta, no encontrado…) esta es la ÚNICA fila que va a existir,
 * porque nunca llega a `checkInTicket`. Para un escaneo listo que después sí
 * se confirma, el servidor además escribe su propia fila autoritativa al
 * hacer el check-in real -- tener las dos no es redundante: una es "a esto
 * apuntó la cámara" y la otra es "esto se admitió". Fire-and-forget: nunca
 * bloquea el escaneo siguiente ni rompe el flujo si el reporte falla, y
 * nunca lanza hacia el caller.
 *
 * Se buffer-ea en memoria (no una llamada por escaneo) y se manda en lotes
 * cortos: la puerta escanea seguido y un POST por escaneo sería la mitad del
 * tráfico de red del puesto para un dato que sólo importa agregado.
 */

const FLUSH_DEBOUNCE_MS = 2000
const FLUSH_MAX_BATCH = 20

let buffer = []
let flushTimer = null
let currentEventSlug = null

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushNow()
  }, FLUSH_DEBOUNCE_MS)
}

async function sendBatch(eventSlug, attempts) {
  if (!attempts.length) return true
  try {
    await reportScanTelemetry({ eventSlug, deviceId: getDeviceId(), attempts })
    return true
  } catch (error) {
    // Sin conexión (o el servidor 5xx): no se pierde, se encola para el
    // próximo sync -- mismo criterio que el check-in real offline.
    if (error instanceof ApiError || error?.name === 'TypeError') {
      await Promise.all(attempts.map((attempt) => enqueueScanEvent({ eventSlug, ...attempt })))
    }
    return false
  }
}

/** Manda lo que haya en el buffer ahora mismo, sin esperar el debounce. */
export async function flushNow() {
  if (!buffer.length || !currentEventSlug) return
  const eventSlug = currentEventSlug
  const attempts = buffer
  buffer = []
  await sendBatch(eventSlug, attempts)
}

/**
 * Encola un intento para reportar. `outcome` ya viene clasificado por
 * `checkinScanService.js` -- acá no se reinterpreta nada, sólo se arma la
 * fila y se decide cuándo mandarla.
 */
export function reportScanAttempt({ eventSlug, kind = 'unknown', outcome, qrToken = null, offline = false }) {
  if (!eventSlug || !outcome) return

  if (currentEventSlug && currentEventSlug !== eventSlug) {
    // Cambio de evento (ej. el operador pasó de un puesto a otro): lo que
    // quedaba en el buffer se manda antes de empezar el nuevo, para no
    // atribuirle al evento nuevo intentos del anterior.
    void flushNow()
  }
  currentEventSlug = eventSlug

  buffer.push({
    clientId: crypto.randomUUID(),
    scannedAt: new Date().toISOString(),
    kind,
    outcome,
    qrToken: kind === 'ticket' ? qrToken : undefined,
    offline,
  })

  if (buffer.length >= FLUSH_MAX_BATCH) {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    void flushNow()
    return
  }
  scheduleFlush()
}

/** Drena la cola persistida cuando vuelve la conexión (useOfflineCheckinSync.js). */
export async function syncPendingScanEvents(eventSlug) {
  const pending = await listPendingScanEvents()
  const forThisEvent = pending.filter((item) => item.eventSlug === eventSlug)
  if (!forThisEvent.length) return

  const attempts = forThisEvent.map(({ eventSlug: _eventSlug, ...attempt }) => attempt)
  const ok = await sendBatch(eventSlug, attempts)
  if (ok) {
    await clearScanEvents(attempts.map((attempt) => attempt.clientId))
  }
}

if (typeof window !== 'undefined') {
  // Última oportunidad antes de que se cierre la pestaña o se apague la
  // pantalla -- `beforeunload` no es confiable en mobile, `pagehide` sí.
  window.addEventListener('pagehide', () => {
    void flushNow()
  })
}
