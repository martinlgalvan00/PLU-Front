import { PRIMARY_ORGANIZATION_ID } from '../../lib/organizations.js'
import { assertSupabaseResult } from '../../lib/supabaseRpc.js'
import { purgeExpiredTrash, sweepOrphans } from './paymentProofTrash.js'

/**
 * Retención de comprobantes en Storage.
 *
 * Qué se mueve a la papelera y cuándo lo decide el staff desde Cobros
 * (`payment_proof_settings`), no una variable de entorno. Por defecto no se
 * mueve nada: ningún modo borra de Storage directamente.
 *
 * Modos (qué hace falta para que un comprobante vaya a la papelera):
 *  - `keep`          nada (default y valor ante cualquier duda).
 *  - `after_export`  `days` días después de que el staff lo descargó.
 *  - `after_days`    `days` días después de aprobar/rechazar la orden.
 *
 * Nunca toca órdenes pendientes: sólo aprobadas o rechazadas. El reloj de
 * `after_days` arranca en approved_at / rejected_at.
 *
 * Una corrida tiene tres etapas independientes (la falla de una no frena las
 * otras):
 *  1. vencidos -> papelera (RPC `proof_retention_trash`, atómica, en SQL);
 *  2. papelera -> purga física, pasado `trash_grace_days` (borra de Storage);
 *  3. huérfanos (objetos que ninguna orden conoce) -> papelera.
 * La etapa 2 corre también con `keep`: la papelera se alimenta además de
 * reemplazos, bajas manuales y atletas eliminados, y el período de gracia es el
 * que decide cuándo se libera el espacio.
 */

export const SETTLED_PROOF_STATUSES = Object.freeze(['aprobado', 'rechazado'])

export const ATHLETE_PROOF_BUCKET = 'athlete-payment-proofs'
export const TICKET_PROOF_BUCKET = 'ticket-payment-proofs'

/** Las dos tablas con retención y descarga: atletas y entradas. */
export const PROOF_SOURCES = Object.freeze([
  Object.freeze({ key: 'athlete', table: 'athlete_payment_orders', bucket: ATHLETE_PROOF_BUCKET }),
  Object.freeze({ key: 'ticket', table: 'ticket_orders', bucket: TICKET_PROOF_BUCKET }),
])

/** Con cuántos días de anticipación se avisa qué está por ir a la papelera. */
export const FORECAST_WINDOW_DAYS = 7

export const RETENTION_MODES = Object.freeze(['keep', 'after_export', 'after_days'])
export const DEFAULT_RETENTION_DAYS = 30
export const RETENTION_DAYS_LIMITS = Object.freeze({ min: 1, max: 3650 })
export const DEFAULT_TRASH_GRACE_DAYS = 30
export const TRASH_GRACE_LIMITS = Object.freeze({ min: 1, max: 3650 })

const DAY_MS = 24 * 60 * 60 * 1000

/** Interruptor de emergencia por entorno: `false` apaga el job sin tocar la base. */
export function isPaymentProofRetentionJobEnabled(env = process.env) {
  return env.PAYMENT_PROOF_RETENTION_JOB_ENABLED !== 'false'
}

function inRange(value, { min, max }) {
  return Number.isInteger(value) && value >= min && value <= max
}

/**
 * Lee la política vigente. Ante cualquier falla (tabla ausente, red, valor
 * raro) devuelve `keep`: no poder leer la política nunca debe significar mover
 * archivos.
 */
export async function readProofRetentionSettings(client) {
  const fallback = {
    mode: 'keep',
    days: DEFAULT_RETENTION_DAYS,
    graceDays: DEFAULT_TRASH_GRACE_DAYS,
    updatedAt: null,
    updatedBy: null,
  }
  if (!client) return fallback
  try {
    const { data, error } = await client
      .from('payment_proof_settings')
      .select('retention_mode, retention_days, trash_grace_days, updated_at, updated_by')
      .eq('organization_id', PRIMARY_ORGANIZATION_ID)
      .maybeSingle()
    if (error || !data) return fallback
    const mode = RETENTION_MODES.includes(data.retention_mode) ? data.retention_mode : 'keep'
    const days = Number(data.retention_days)
    const graceDays = Number(data.trash_grace_days)
    return {
      mode,
      days: inRange(days, RETENTION_DAYS_LIMITS) ? days : DEFAULT_RETENTION_DAYS,
      // Un plazo raro vuelve al default (más largo es lo seguro: se borra después).
      graceDays: inRange(graceDays, TRASH_GRACE_LIMITS) ? graceDays : DEFAULT_TRASH_GRACE_DAYS,
      updatedAt: data.updated_at ?? null,
      updatedBy: data.updated_by ?? null,
    }
  } catch {
    return fallback
  }
}

/** `graceDays` ausente deja el valor guardado como está. */
export async function saveProofRetentionSettings(client, { mode, days, graceDays, actor }) {
  const { error } = await client.from('payment_proof_settings').upsert(
    {
      organization_id: PRIMARY_ORGANIZATION_ID,
      retention_mode: mode,
      retention_days: days,
      ...(graceDays != null ? { trash_grace_days: graceDays } : {}),
      updated_by: actor ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  )
  if (error) throw error
}

/**
 * Ancla de retención: cuándo se cerró la decisión operativa.
 *
 * Las tres funciones de abajo son la especificación ejecutable de la regla de
 * vencimiento: la base la aplica en `plu_private.proof_candidates`
 * (20261214110000) y los tests las usan para fijar el contrato. El job ya no
 * las llama.
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

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Cuándo vence el comprobante según la política, o `null` si no corre reloj
 * (conservar, pendiente, sin archivo, ya borrado, o sin la fecha ancla).
 * @param {object} order
 * @param {{ mode: string, days: number }} policy
 * @returns {Date | null}
 */
export function proofPurgeDueAt(order, { mode, days } = {}) {
  if (mode !== 'after_days' && mode !== 'after_export') return null
  const path = order?.payment_proof_path ?? order?.paymentProofPath ?? null
  if (!path || typeof path !== 'string' || !path.trim()) return null
  if (order?.payment_proof_purged_at ?? order?.paymentProofPurgedAt) return null
  if (!SETTLED_PROOF_STATUSES.includes(order?.status)) return null

  const anchor =
    mode === 'after_export'
      ? parseDate(order?.payment_proof_exported_at ?? order?.paymentProofExportedAt ?? null)
      : proofDecisionAt(order)
  if (!anchor) return null
  return new Date(anchor.getTime() + days * DAY_MS)
}

/**
 * ¿Corresponde mover este comprobante a la papelera según la política?
 * @param {object} order
 * @param {{ mode: string, days: number, now?: Date }} policy
 */
export function isProofEligibleForPurge(order, { mode, days, now = new Date() } = {}) {
  const dueAt = proofPurgeDueAt(order, { mode, days })
  return dueAt != null && now.getTime() >= dueAt.getTime()
}

export async function touchProofAccessed(client, { table, orderId, now = new Date() }) {
  const { error } = await client
    .from(table)
    .update({ payment_proof_accessed_at: now.toISOString() })
    .eq('id', orderId)
  if (error) throw error
}

const count = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Resumen, pronóstico y papelera calculados en la base, en una sola pasada y
 * sin topes de filas (`payment_proof_overview`). Con una política sin guardar
 * (`mode`/`days` del borrador) sirve de vista previa.
 *
 * `forecast.count` son los que vencen dentro de la ventana (incluye los ya
 * vencidos, que se van en la próxima corrida); `notDownloaded` los que además
 * no tienen copia.
 */
export async function getProofOverview(
  client,
  { mode, days, windowDays = FORECAST_WINDOW_DAYS } = {},
) {
  const result = assertSupabaseResult(
    await client.rpc('payment_proof_overview', {
      p_mode: mode,
      p_days: days,
      p_window_days: windowDays,
    }),
    'No se pudo leer el estado de los comprobantes.',
  )
  const onServer = count(result?.summary?.onServer)
  const notDownloaded = count(result?.summary?.notDownloaded)
  return {
    summary: {
      onServer,
      notDownloaded,
      downloaded: Math.max(onServer - notDownloaded, 0),
      deleted: count(result?.summary?.deleted),
    },
    forecast: {
      mode,
      days,
      windowDays,
      count: count(result?.forecast?.count),
      notDownloaded: count(result?.forecast?.notDownloaded),
      dueNow: count(result?.forecast?.dueNow),
      nextDueAt: result?.forecast?.nextDueAt ?? null,
    },
    trash: {
      count: count(result?.trash?.count),
      oldestDeletedAt: result?.trash?.oldestDeletedAt ?? null,
      graceDays: count(result?.trash?.graceDays) || DEFAULT_TRASH_GRACE_DAYS,
      dueForPurge: count(result?.trash?.dueForPurge),
    },
  }
}

/** Ejecuta una etapa y devuelve su resultado o el error, sin frenar a las otras. */
async function stage(run, fallback) {
  try {
    return await run()
  } catch (error) {
    return { ...fallback, error: error?.message ?? String(error) }
  }
}

/**
 * Una corrida completa según la política guardada.
 * @returns {Promise<{ disabled?: boolean, mode: string, days: number, graceDays: number, trashed: object|null, purged: object|null, orphans: object|null }>}
 */
export async function runPaymentProofRetention({
  client,
  env = process.env,
  now = new Date(),
  limit = 200,
} = {}) {
  if (!client) throw new Error('Supabase no está configurado para retención de comprobantes.')
  // Última barrera: cualquier camino que llegue acá (job residente, cron,
  // script) respeta el interruptor de entorno.
  if (!isPaymentProofRetentionJobEnabled(env)) {
    return {
      disabled: true,
      mode: 'keep',
      days: DEFAULT_RETENTION_DAYS,
      graceDays: DEFAULT_TRASH_GRACE_DAYS,
      trashed: null,
      purged: null,
      orphans: null,
    }
  }
  const { mode, days, graceDays } = await readProofRetentionSettings(client)

  const trashed =
    mode === 'keep'
      ? { athlete: 0, ticket: 0 }
      : await stage(
          async () => {
            const result = assertSupabaseResult(
              await client.rpc('proof_retention_trash', {
                p_mode: mode,
                p_days: days,
                p_limit: limit,
              }),
              'No se pudo aplicar la retención de comprobantes.',
            )
            return { athlete: count(result?.athlete), ticket: count(result?.ticket) }
          },
          { athlete: 0, ticket: 0 },
        )

  const purged = await stage(() => purgeExpiredTrash(client, { graceDays, now, limit }), {
    purged: 0,
    failed: 0,
    errors: [],
  })
  const orphans = await stage(async () => ({ registered: await sweepOrphans(client) }), {
    registered: 0,
  })

  return { mode, days, graceDays, trashed, purged, orphans }
}
