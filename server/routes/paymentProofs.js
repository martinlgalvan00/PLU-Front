import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { recordOperationalAuditEvent } from '../modules/audit/operationalAuditWriter.js'
import { buildProofIndexCsv, exportProofs } from '../modules/payments/paymentProofArchive.js'
import {
  RETENTION_DAYS_LIMITS,
  RETENTION_MODES,
  TRASH_GRACE_LIMITS,
  getProofOverview,
  readProofRetentionSettings,
  saveProofRetentionSettings,
} from '../modules/payments/paymentProofRetention.js'
import {
  PROOF_SOURCE_KEYS,
  emptyTrash,
  listTrash,
  purgeTrashedFile,
  readTrashedFile,
  restoreProofFile,
  trashOrderProof,
} from '../modules/payments/paymentProofTrash.js'

export const proofSettingsSchema = z.object({
  mode: z.enum(RETENTION_MODES),
  days: z
    .number()
    .int()
    .min(RETENTION_DAYS_LIMITS.min, `El plazo mínimo es ${RETENTION_DAYS_LIMITS.min} día.`)
    .max(RETENTION_DAYS_LIMITS.max, `El plazo máximo es ${RETENTION_DAYS_LIMITS.max} días.`),
  // Opcional: si no viene, el período de la papelera queda como estaba.
  graceDays: z
    .number()
    .int()
    .min(TRASH_GRACE_LIMITS.min, `La papelera guarda como mínimo ${TRASH_GRACE_LIMITS.min} día.`)
    .max(TRASH_GRACE_LIMITS.max, `La papelera guarda como máximo ${TRASH_GRACE_LIMITS.max} días.`)
    .optional(),
})

export const proofForecastQuerySchema = z.object({
  mode: z.enum(RETENTION_MODES),
  days: z.coerce.number().int().min(RETENTION_DAYS_LIMITS.min).max(RETENTION_DAYS_LIMITS.max),
})

export const proofExportSchema = z.object({
  scope: z.enum(['pending', 'all']).default('pending'),
  // Cursor de la tanda anterior (X-Export-Next): una fecha ISO.
  after: z
    .string()
    .max(64)
    .refine((value) => !Number.isNaN(Date.parse(value)), 'El cursor no es una fecha válida.')
    .nullish(),
})

export const trashListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
})

const uuidParam = z.string().uuid()
const trashOrderParams = z.object({ source: z.enum(PROOF_SOURCE_KEYS), orderId: uuidParam })
// Vaciar la papelera es irreversible: el cuerpo tiene que decirlo explícitamente.
const emptyTrashSchema = z.object({ confirm: z.literal(true) })

function stamp(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function parseOr400(schema, value, message) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || message)
  return parsed.data
}

/**
 * Archivo de comprobantes, desde Cobros: ver cuántos hay, llevárselos a la
 * computadora, decidir cuándo van a la papelera y recuperarlos de ella.
 *
 * Leer y descargar piden `admin.payments.read` (es la misma evidencia que ya se
 * ve en la bandeja). Cambiar la política, restaurar, dar de baja o eliminar
 * definitivamente piden `admin.payments.approve`: son decisiones sobre datos que
 * después de la purga no se pueden recuperar.
 */
export function createPaymentProofRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.payments.read', { prisma })
  const writeGuard = requirePermission('admin.payments.approve', { prisma })

  function supabase() {
    const client = getSupabaseAdmin?.()
    if (!client) throw new HttpError(503, 'Supabase no está configurado en el servidor.')
    return client
  }

  const actorOf = (req) => `${req.auth.user.id}:${req.auth.user.email}`

  function audit(client, req, { action, entityId, severity = 'info', metadata = {} }) {
    return recordOperationalAuditEvent(client, {
      source: 'payment',
      action,
      entityType: 'payment_proof_files',
      entityId,
      actorType: 'staff',
      actorId: req.auth.user.id,
      status: 'succeeded',
      severity,
      metadata,
    })
  }

  router.get('/summary', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      const client = supabase()
      const settings = await readProofRetentionSettings(client)
      const { summary, forecast, trash } = await getProofOverview(client, settings)
      res.json({ summary, settings, forecast, trash })
    } catch (error) {
      next(error)
    }
  })

  // Qué iría a la papelera con una política que todavía no se guardó, para avisar antes.
  router.get('/forecast', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const parsed = proofForecastQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new HttpError(400, 'Política inválida.')
      const { forecast } = await getProofOverview(supabase(), parsed.data)
      res.json({ forecast })
    } catch (error) {
      next(error)
    }
  })

  router.put('/settings', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const data = parseOr400(proofSettingsSchema, req.body, 'Datos inválidos.')
      const client = supabase()
      const before = await readProofRetentionSettings(client)
      const overview = await getProofOverview(client, data).catch(() => null)
      await saveProofRetentionSettings(client, { ...data, actor: actorOf(req) })
      await recordOperationalAuditEvent(client, {
        source: 'payment',
        action: 'payment_proofs.retention_updated',
        entityType: 'payment_proof_settings',
        entityId: 'primary',
        actorType: 'staff',
        actorId: req.auth.user.id,
        status: 'succeeded',
        severity: data.mode === 'keep' ? 'info' : 'warning',
        metadata: {
          before: { mode: before.mode, days: before.days, graceDays: before.graceDays },
          after: { ...data, graceDays: data.graceDays ?? before.graceDays },
          // Cuánto quedaba en juego al activar la retención, y cuánto sin copia.
          atStake: overview
            ? { count: overview.forecast.count, notDownloaded: overview.forecast.notDownloaded }
            : null,
        },
      })
      res.json({ settings: await readProofRetentionSettings(client) })
    } catch (error) {
      next(error)
    }
  })

  // POST y no GET: marca los comprobantes como descargados, así que pasa por el
  // mismo control de origen que el resto de las mutaciones.
  router.post('/export', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const { scope, after } = parseOr400(proofExportSchema, req.body ?? {}, 'Datos inválidos.')
      const result = await exportProofs(supabase(), { scope, after: after ?? null })
      if (result.count === 0) {
        throw new HttpError(404, 'No hay comprobantes para descargar.')
      }
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="comprobantes-${stamp()}.zip"`,
        'Content-Length': String(result.zip.length),
        'Cache-Control': 'no-store',
        'X-Export-Count': String(result.count),
        'X-Export-Remaining': String(result.remaining),
        // Con `all`, desde dónde seguir para bajar el resto; vacío si ya no queda nada.
        'X-Export-Next': result.next ?? '',
      })
      res.send(result.zip)
    } catch (error) {
      next(error)
    }
  })

  router.get('/index.csv', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      const csv = await buildProofIndexCsv(supabase())
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="comprobantes-indice-${stamp()}.csv"`,
        'Cache-Control': 'no-store',
      })
      res.send(csv)
    } catch (error) {
      next(error)
    }
  })

  // ---------------------------------------------------------------------
  // Papelera
  // ---------------------------------------------------------------------

  router.get('/trash', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const { limit, offset } = parseOr400(trashListQuerySchema, req.query, 'Paginación inválida.')
      const client = supabase()
      const { graceDays } = await readProofRetentionSettings(client)
      const result = await listTrash(client, { limit, offset, graceDays })
      res.json({ ...result, graceDays })
    } catch (error) {
      next(error)
    }
  })

  // Ver o bajar un archivo que está en la papelera (para decidir si se restaura).
  router.get('/trash/:fileId/file', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const fileId = parseOr400(uuidParam, req.params.fileId, 'Archivo inválido.')
      const client = supabase()
      const file = await readTrashedFile(client, fileId)
      const { data: blob, error } = await client.storage.from(file.bucket).download(file.path)
      if (error || !blob) throw new HttpError(404, 'El archivo ya no está en el almacenamiento.')
      const body = Buffer.from(await blob.arrayBuffer())
      res.set({
        'Content-Type': blob.type || 'application/octet-stream',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.send(body)
    } catch (error) {
      next(error)
    }
  })

  router.post('/trash/:fileId/restore', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const fileId = parseOr400(uuidParam, req.params.fileId, 'Archivo inválido.')
      const client = supabase()
      const result = await restoreProofFile(client, { fileId, actor: actorOf(req) })
      if (result.restored) {
        await audit(client, req, {
          action: 'payment_proofs.restored',
          entityId: fileId,
          metadata: { source: result.source, orderId: result.orderId },
        })
      }
      res.json({ restored: result.restored })
    } catch (error) {
      next(error)
    }
  })

  // "Eliminar ahora": saca el archivo de Storage sin esperar el período de gracia.
  router.delete('/trash/:fileId', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const fileId = parseOr400(uuidParam, req.params.fileId, 'Archivo inválido.')
      const client = supabase()
      const file = await readTrashedFile(client, fileId)
      await purgeTrashedFile(client, fileId)
      await audit(client, req, {
        action: 'payment_proofs.purged',
        entityId: fileId,
        severity: 'warning',
        metadata: { source: file.source, orderId: file.order_id, reason: file.deleted_reason },
      })
      res.json({ purged: true })
    } catch (error) {
      next(error)
    }
  })

  router.post('/trash/empty', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      parseOr400(emptyTrashSchema, req.body ?? {}, 'Confirmá que querés vaciar la papelera.')
      const client = supabase()
      const result = await emptyTrash(client)
      await audit(client, req, {
        action: 'payment_proofs.trash_emptied',
        entityId: 'trash',
        severity: 'warning',
        metadata: { purged: result.purged, failed: result.failed },
      })
      res.json({ purged: result.purged, failed: result.failed })
    } catch (error) {
      next(error)
    }
  })

  // Baja manual del comprobante vigente de una orden ya resuelta.
  router.post(
    '/orders/:source/:orderId/trash',
    ...writeGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const { source, orderId } = parseOr400(trashOrderParams, req.params, 'Orden inválida.')
        const client = supabase()
        const result = await trashOrderProof(client, { source, orderId, actor: actorOf(req) })
        if (result.trashed) {
          await audit(client, req, {
            action: 'payment_proofs.trashed',
            entityId: result.fileId,
            metadata: { source, orderId },
          })
        }
        res.json({ trashed: result.trashed })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
