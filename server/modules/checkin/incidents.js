import { HttpError } from '../../lib/errors.js'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { auditFingerprint } from '../audit/operationalAuditWriter.js'

/**
 * Tipos de incidente que puede cargar el staff. Cerrado a propósito (la tabla
 * tiene el mismo check): el parte se agrupa y se cuenta por tipo en el panel.
 */
export const INCIDENT_KINDS = [
  'duplicate_qr',
  'unknown_qr',
  'no_credential',
  'identity_mismatch',
  'wrong_zone_attempt',
  'other',
]

const COLUMNS =
  'id, kind, note, status, gate, zone_scope, ticket_id, reported_by, reported_at, resolved_by, resolved_at, resolution_note'

/**
 * Fila lista para insertar. Quién reporta, desde qué puesto y en qué evento sale
 * SIEMPRE de la cuenta autenticada, nunca del cuerpo: si lo mandara el
 * dispositivo, cualquiera podría atribuirle un parte a otra persona o a otra
 * puerta. Del QR sólo se guarda el fingerprint.
 */
export function buildIncidentRow({
  eventId,
  kind,
  note = null,
  gate = null,
  zoneScope = null,
  ticketId = null,
  qrToken = null,
  reportedBy,
  organizationId = PRIMARY_ORGANIZATION_ID,
}) {
  if (!eventId || !INCIDENT_KINDS.includes(kind) || !reportedBy) return null
  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, 300) : ''
  return {
    organization_id: organizationId,
    event_id: eventId,
    kind,
    note: trimmedNote || null,
    gate: gate ? String(gate).slice(0, 80) : null,
    zone_scope: zoneScope ? String(zoneScope).slice(0, 80) : null,
    ticket_id: ticketId,
    qr_fingerprint: qrToken ? auditFingerprint(qrToken) : null,
    reported_by: String(reportedBy).slice(0, 200),
  }
}

/**
 * Lo que ve el panel. `reported_by` es `id:email`: se deja sólo el email, que es
 * lo que el organizador reconoce.
 */
export function mapIncident(row) {
  const label = (value) => (value ? String(value).split(':').slice(1).join(':') || value : null)
  return {
    id: row.id,
    kind: row.kind,
    note: row.note ?? null,
    status: row.status,
    gate: row.gate ?? null,
    zoneScope: row.zone_scope ?? null,
    ticketId: row.ticket_id ?? null,
    reportedBy: label(row.reported_by),
    reportedAt: row.reported_at,
    resolvedBy: label(row.resolved_by),
    resolvedAt: row.resolved_at ?? null,
    resolutionNote: row.resolution_note ?? null,
  }
}

export function createCheckinIncidentRepository(client) {
  if (!client) throw new HttpError(503, 'Supabase Admin no esta configurado.')

  return {
    async report(input) {
      const row = buildIncidentRow(input)
      if (!row) throw new HttpError(400, 'Incidente inválido.')
      const { data, error } = await client
        .from('checkin_incidents')
        .insert(row)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return mapIncident(data)
    },

    async listForEvent(eventId, { status = null, limit = 100 } = {}) {
      let query = client
        .from('checkin_incidents')
        .select(COLUMNS)
        .eq('event_id', eventId)
        .order('reported_at', { ascending: false })
        .limit(Math.min(Math.max(Number(limit) || 100, 1), 200))
      if (status) query = query.eq('status', status)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []).map(mapIncident)
    },

    /** Cierra un incidente abierto de ESTE evento; uno ya cerrado no se reabre. */
    async resolve(eventId, incidentId, { resolvedBy, resolutionNote = null }) {
      const note = typeof resolutionNote === 'string' ? resolutionNote.trim().slice(0, 300) : ''
      const { data, error } = await client
        .from('checkin_incidents')
        .update({
          status: 'resolved',
          resolved_by: String(resolvedBy).slice(0, 200),
          resolved_at: new Date().toISOString(),
          resolution_note: note || null,
        })
        .eq('id', incidentId)
        .eq('event_id', eventId)
        .eq('status', 'open')
        .select(COLUMNS)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new HttpError(404, 'Incidente no encontrado o ya cerrado.')
      return mapIncident(data)
    },
  }
}
