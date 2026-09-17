import { auditFingerprint } from '../audit/operationalAuditWriter.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'

const VALID_OUTCOMES = new Set([
  'checked_in',
  'ready',
  'already_used',
  'not_ready',
  'not_found',
  'invalid',
  'wrong_zone',
  'not_yet_valid',
  'expired',
  'no_registration',
])
const VALID_KINDS = new Set(['ticket', 'registration', 'unknown'])

// Reloj del dispositivo, no del servidor: se acota antes de insertar. Un
// timestamp futuro rompería el histograma por hora del informe; uno viejo es
// casi siempre un reloj mal puesto, no un escaneo real de hace una semana.
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const MAX_PAST_SKEW_MS = 7 * 24 * 60 * 60 * 1000

function clampScannedAt(value) {
  const now = Date.now()
  const parsed = value ? new Date(value).getTime() : NaN
  if (!Number.isFinite(parsed)) return new Date(now).toISOString()
  if (parsed > now + MAX_FUTURE_SKEW_MS) return new Date(now).toISOString()
  if (parsed < now - MAX_PAST_SKEW_MS) return new Date(now).toISOString()
  return new Date(parsed).toISOString()
}

/**
 * Fila lista para insertar en `checkin_scan_events`. Nunca guarda el token
 * crudo del QR (es una credencial al portador) ni nombre/DNI -- sólo el
 * fingerprint y los FKs, en la misma lógica que dejó de exponer DNI en la
 * proyección pública del QR (checkinScanService.js).
 */
export function buildScanEventRow({
  eventId,
  outcome,
  kind = 'unknown',
  evidence,
  ticketId = null,
  registrationId = null,
  qrToken = null,
  gate = null,
  zoneScope = null,
  actorLabel = null,
  deviceId = null,
  clientId = null,
  offline = false,
  errorCode = null,
  scannedAt = null,
  organizationId = PRIMARY_ORGANIZATION_ID,
} = {}) {
  if (!eventId || !VALID_OUTCOMES.has(outcome) || (evidence !== 'server' && evidence !== 'operator')) {
    return null
  }
  return {
    organization_id: organizationId,
    event_id: eventId,
    outcome,
    kind: VALID_KINDS.has(kind) ? kind : 'unknown',
    evidence,
    ticket_id: ticketId,
    registration_id: registrationId,
    qr_fingerprint: qrToken ? auditFingerprint(qrToken) : null,
    gate: gate ? String(gate).slice(0, 80) : null,
    zone_scope: zoneScope ? String(zoneScope).slice(0, 80) : null,
    actor_label: actorLabel ? String(actorLabel).slice(0, 200) : null,
    device_id: deviceId ? String(deviceId).slice(0, 120) : null,
    client_id: clientId || null,
    offline: Boolean(offline),
    error_code: errorCode ? String(errorCode).slice(0, 20) : null,
    scanned_at: clampScannedAt(scannedAt),
  }
}

/**
 * Inserta filas de telemetría de escaneo. Nunca lanza -- un rastro de puerta
 * perdido es un incidente observable (queda en el log), no un motivo para
 * fallar el check-in real o la respuesta al operador.
 */
export async function recordScanEvents(client, rows) {
  const built = (rows ?? []).map(buildScanEventRow).filter(Boolean)
  if (!client || typeof client.from !== 'function' || built.length === 0) return false

  try {
    // upsert + ignoreDuplicates en vez de insert: un lote reenviado por el
    // dispositivo (perdió la respuesta 202, reintenta) no duplica filas --
    // `checkin_scan_events_device_client_idx` es el target de ON CONFLICT.
    // Las filas server-autoritativas van con device_id/client_id nulos, y en
    // Postgres cada NULL es distinto de cualquier otro: nunca chocan entre sí.
    const result = await client
      .from('checkin_scan_events')
      .upsert(built, { onConflict: 'device_id,client_id', ignoreDuplicates: true })
      .select('id')
    if (result?.error) throw result.error
    return true
  } catch (error) {
    console.error('[checkin] no se pudo registrar la telemetría de escaneo', {
      count: built.length,
      message: error?.message ?? String(error),
    })
    return false
  }
}

export async function recordScanEvent(client, row) {
  return recordScanEvents(client, [row])
}
