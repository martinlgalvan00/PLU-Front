/**
 * Retención de comprobantes en Storage (opción B).
 *
 * Solo órdenes ya decididas (aprobado / rechazado). El reloj arranca en
 * approved_at o rejected_at. Pasadas `retentionHours`, el job borra el
 * objeto del bucket y marca purged_at + limpia payment_proof_path.
 */

export const SETTLED_PROOF_STATUSES = Object.freeze(['aprobado', 'rechazado'])

export const ATHLETE_PROOF_BUCKET = 'athlete-payment-proofs'
export const TICKET_PROOF_BUCKET = 'ticket-payment-proofs'

export function resolveProofRetentionHours(env = process.env) {
  const raw = Number(env.PROOF_RETENTION_HOURS)
  if (Number.isFinite(raw) && raw >= 1) return Math.min(raw, 24 * 30)
  return 24
}

export function isPaymentProofRetentionJobEnabled(env = process.env) {
  return env.PAYMENT_PROOF_RETENTION_JOB_ENABLED !== 'false'
}

/**
 * Ancla de retención: cuándo se cerró la decisión operativa.
 * @returns {Date | null}
 */
export function proofDecisionAt(order) {
  const approved = order?.approved_at ?? order?.approvedAt ?? null
  const rejected = order?.rejected_at ?? order?.rejectedAt ?? null
  const status = order?.status
  if (status === 'aprobado' && approved) {
    const d = new Date(approved)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (status === 'rechazado' && rejected) {
    const d = new Date(rejected)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // Fallback: status terminal sin timestamp (histórico).
  if (SETTLED_PROOF_STATUSES.includes(status)) {
    const updated = order?.updated_at ?? order?.updatedAt ?? null
    if (updated) {
      const d = new Date(updated)
      return Number.isNaN(d.getTime()) ? null : d
    }
  }
  return null
}

/**
 * @param {object} order
 * @param {{ now?: Date, retentionHours?: number }} opts
 */
export function isProofEligibleForPurge(order, { now = new Date(), retentionHours = 24 } = {}) {
  const path = order?.payment_proof_path ?? order?.paymentProofPath ?? null
  if (!path || typeof path !== 'string' || !path.trim()) return false
  if (order?.payment_proof_purged_at ?? order?.paymentProofPurgedAt) return false
  if (!SETTLED_PROOF_STATUSES.includes(order?.status)) return false
  const decidedAt = proofDecisionAt(order)
  if (!decidedAt) return false
  const cutoffMs = retentionHours * 60 * 60 * 1000
  return now.getTime() - decidedAt.getTime() >= cutoffMs
}

/**
 * Lista candidatos vía PostgREST y filtra en memoria (timestamps ancla).
 */
export async function listProofPurgeCandidates(client, {
  table,
  retentionHours,
  limit = 40,
  now = new Date(),
} = {}) {
  const { data, error } = await client
    .from(table)
    .select(
      'id, status, payment_proof_path, payment_proof_purged_at, approved_at, rejected_at, updated_at',
    )
    .in('status', [...SETTLED_PROOF_STATUSES])
    .not('payment_proof_path', 'is', null)
    .is('payment_proof_purged_at', null)
    .order('updated_at', { ascending: true })
    .limit(Math.max(limit * 3, 60))

  if (error) throw error

  return (data ?? [])
    .filter((row) => isProofEligibleForPurge(row, { now, retentionHours }))
    .slice(0, limit)
}

export async function purgeProofObject(client, { bucket, path }) {
  const { error } = await client.storage.from(bucket).remove([path])
  if (!error) return
  const message = String(error.message ?? error.error ?? '')
  // Ya no está: igual se marca purged_at para no reintentar eternamente.
  if (/not found|not_found|404|No such file/i.test(message)) return
  throw error
}

/**
 * Marca purga en DB. Limpia path para que la UI no ofrezca descarga rota.
 */
export async function markProofPurged(client, { table, orderId, now = new Date() }) {
  const { error } = await client
    .from(table)
    .update({
      payment_proof_path: null,
      payment_proof_purged_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', orderId)
    .is('payment_proof_purged_at', null)
    .not('payment_proof_path', 'is', null)

  if (error) throw error
}

export async function touchProofAccessed(client, { table, orderId, now = new Date() }) {
  const { error } = await client
    .from(table)
    .update({ payment_proof_accessed_at: now.toISOString() })
    .eq('id', orderId)
  if (error) throw error
}

/**
 * Una corrida completa sobre atletas + tickets.
 * @returns {Promise<{ retentionHours: number, athlete: object, ticket: object }>}
 */
export async function runPaymentProofRetention({
  client,
  env = process.env,
  now = new Date(),
  limit = 40,
} = {}) {
  if (!client) throw new Error('Supabase no está configurado para retención de comprobantes.')

  const retentionHours = resolveProofRetentionHours(env)
  const athlete = await purgeProofBatch(client, {
    table: 'athlete_payment_orders',
    bucket: ATHLETE_PROOF_BUCKET,
    retentionHours,
    limit,
    now,
  })
  const ticket = await purgeProofBatch(client, {
    table: 'ticket_orders',
    bucket: TICKET_PROOF_BUCKET,
    retentionHours,
    limit,
    now,
  })

  return { retentionHours, athlete, ticket }
}

async function purgeProofBatch(client, { table, bucket, retentionHours, limit, now }) {
  const candidates = await listProofPurgeCandidates(client, {
    table,
    retentionHours,
    limit,
    now,
  })

  let purged = 0
  let failed = 0
  const errors = []

  for (const row of candidates) {
    const path = row.payment_proof_path
    try {
      await purgeProofObject(client, { bucket, path })
      await markProofPurged(client, { table, orderId: row.id, now })
      purged += 1
    } catch (error) {
      failed += 1
      errors.push({
        orderId: row.id,
        message: error?.message ?? String(error),
      })
    }
  }

  return {
    table,
    bucket,
    candidates: candidates.length,
    purged,
    failed,
    errors: errors.slice(0, 5),
  }
}
