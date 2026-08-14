/**
 * Puente de sincronización entre pestañas del mismo navegador.
 *
 * No transporta datos de atletas, pagos ni afiliaciones: sólo señales para
 * que cada pestaña vuelva a consultar su endpoint autorizado. De esta forma
 * una compra o aprobación hecha en otra pestaña se refleja enseguida sin
 * ampliar la superficie pública de datos.
 */
const CHANNEL_NAME = 'plu-arg-live-sync-v1'
const listeners = new Set()
let channel = null

function isMessage(value) {
  return value && typeof value === 'object' && typeof value.type === 'string'
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return channel

  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = ({ data }) => {
    if (!isMessage(data)) return
    for (const listener of listeners) listener(data)
  }
  return channel
}

/** Publica una señal opaca a las demás pestañas abiertas. */
export function publishLiveSync(message) {
  if (!isMessage(message)) return
  ensureChannel()?.postMessage(message)
}

/** Escucha señales emitidas desde otra pestaña. */
export function subscribeLiveSync(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  ensureChannel()
  return () => listeners.delete(listener)
}

export function publishEventRegistrationInvalidation(eventSlug) {
  if (!eventSlug) return
  publishLiveSync({ type: 'event-registration-invalidated', eventSlug })
}

export function publishEventLiveDataInvalidation() {
  publishLiveSync({ type: 'event-live-data-invalidated' })
}

export function publishAthleteSnapshotInvalidation() {
  publishLiveSync({ type: 'athlete-snapshot-invalidated' })
}
