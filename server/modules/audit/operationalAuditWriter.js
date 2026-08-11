import { createHash } from 'node:crypto'
import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'

const ALLOWED_SOURCES = new Set(['identity', 'payment'])
const ALLOWED_SEVERITIES = new Set(['info', 'success', 'warning', 'danger'])

export function auditFingerprint(value) {
  if (!value) return null
  return createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex')
}

export function requestAuditMetadata(req, metadata = {}) {
  return {
    ...metadata,
    ipHash: auditFingerprint(req?.ip),
    userAgent: req?.get?.('user-agent')?.slice(0, 240) ?? null,
  }
}

/**
 * Registra telemetria append-only sin convertir una falla de observabilidad
 * en una falla de login/checkout. Nunca recibe passwords, tokens de tarjeta
 * ni cookies; los identificadores anonimos se guardan como fingerprint.
 */
export async function recordOperationalAuditEvent(
  client,
  {
    source,
    action,
    entityType,
    entityId,
    actorType,
    actorId = null,
    status = null,
    severity = 'info',
    metadata = {},
    organizationId = PRIMARY_ORGANIZATION_ID,
  },
) {
  if (!client || typeof client.from !== 'function') return false
  if (!ALLOWED_SOURCES.has(source) || !ALLOWED_SEVERITIES.has(severity)) return false

  try {
    const result = await client.from('operational_event_logs').insert({
      organization_id: organizationId,
      source,
      action: String(action).slice(0, 80),
      entity_type: String(entityType).slice(0, 60),
      entity_id: String(entityId).slice(0, 160),
      actor_type: String(actorType).slice(0, 40),
      actor_id: actorId ? String(actorId).slice(0, 160) : null,
      status: status ? String(status).slice(0, 40) : null,
      severity,
      metadata,
    })
    if (result?.error) throw result.error
    return true
  } catch (error) {
    console.warn('[audit] no se pudo registrar el evento operativo', {
      source,
      action,
      message: error?.message ?? String(error),
    })
    return false
  }
}

export function anonymousIdentityId(kind, value) {
  return `${kind}:${auditFingerprint(value) ?? 'unknown'}`
}
