import { auditFingerprint } from '../audit/operationalAuditWriter.js'

const TRAIL_LIMIT = 60

// Un intento "ready" es el veredicto de lectura del navegador, no un rechazo ni
// un ingreso: no suma al conteo de rechazos.
const NON_REJECTION_OUTCOMES = new Set(['checked_in', 'ready'])

/**
 * Resume el historial de escaneos de UN QR para quien lo tiene delante.
 *
 * Responde lo que la puerta necesita para distinguir un error de una copia: si
 * ya ingresó, cuándo y por qué puerta, y cuántas veces se intentó después. No
 * devuelve actor, dispositivo ni DNI: quien está en el puesto no necesita saber
 * quién escaneó antes, sólo dónde y cuándo.
 *
 * Es una función pura sobre filas de `checkin_scan_events` para poder probar
 * las reglas sin base.
 *
 * @param {Array<object>} rows Filas con `outcome`, `scanned_at`, `gate`, `zone_scope`.
 */
export function summarizeScanTrail(rows = []) {
  const ordered = [...rows].sort(
    (left, right) => new Date(left.scanned_at).getTime() - new Date(right.scanned_at).getTime(),
  )

  const admission = ordered.find((row) => row.outcome === 'checked_in') ?? null
  const rejections = ordered.filter((row) => !NON_REJECTION_OUTCOMES.has(row.outcome))
  // Sólo importan los rechazos posteriores al ingreso: antes de ingresar, un
  // rechazo (vencido, zona incorrecta) es parte del trámite, no una repetición.
  const afterAdmission = admission
    ? rejections.filter(
        (row) => new Date(row.scanned_at).getTime() > new Date(admission.scanned_at).getTime(),
      )
    : []
  const gates = [...new Set(ordered.map((row) => row.gate).filter(Boolean))]
  const last = rejections.at(-1) ?? null

  return {
    scans: ordered.length,
    firstAdmission: admission
      ? { scannedAt: admission.scanned_at, gate: admission.gate ?? null }
      : null,
    rejections: rejections.length,
    rejectionsAfterAdmission: afterAdmission.length,
    lastRejectedAt: last?.scanned_at ?? null,
    lastRejectedOutcome: last?.outcome ?? null,
    gates,
  }
}

/**
 * Historial de un QR dentro de un evento. El token se busca por fingerprint
 * (el rastro nunca guardó el valor crudo), con el mismo hash que usa el
 * registrador de escaneos.
 */
export async function fetchScanTrail(client, { eventId, qrToken }) {
  const fingerprint = auditFingerprint(qrToken)
  if (!client || !eventId || !fingerprint) return summarizeScanTrail([])

  const { data, error } = await client
    .from('checkin_scan_events')
    .select('outcome, scanned_at, gate, zone_scope')
    .eq('event_id', eventId)
    .eq('qr_fingerprint', fingerprint)
    .order('scanned_at', { ascending: false })
    .limit(TRAIL_LIMIT)

  if (error) throw error
  return summarizeScanTrail(data ?? [])
}
