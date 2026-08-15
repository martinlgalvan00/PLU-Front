import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createSupabaseAuditRepository } from '../modules/audit/supabaseAuditRepository.js'

/**
 * audit.js — PLU ARG
 *
 * La sección Auditoría del panel era un placeholder y el timeline del atleta
 * se armaba en el browser sobre localStorage. Acá se expone la bitácora real
 * de `operational_audit_events`, que unifica los efectos transaccionales de
 * dominio con las transiciones append-only de emails, webhooks y pagos.
 *
 * Solo lectura y detrás de `admin.audit.read`: la auditoría no se edita desde
 * ningún lado, ni siquiera con permisos totales.
 */

const listQuerySchema = z.object({
  action: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
  entityIds: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 50))
    .optional(),
  actorType: z.string().trim().min(1).max(40).optional(),
  source: z.enum(['domain', 'email', 'payment', 'identity']).optional(),
  status: z.string().trim().min(1).max(40).optional(),
  search: z
    .string()
    .trim()
    .min(1)
    .max(120)
    // El término entra en un `or(...ilike...)` de PostgREST, donde la coma y
    // el paréntesis son sintaxis del filtro, no texto.
    .transform((value) => value.replace(/[,()*]/g, ''))
    .refine((value) => value.length > 0)
    .optional(),
  before: z.string().datetime({ offset: true }).optional(),
  // Complemento del cursor: sin él, las filas que empatan `created_at` con el
  // último registro de la página (típico de una transacción que audita varios
  // efectos con el mismo `now()`) quedan fuera de la página siguiente.
  beforeId: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[\w-]+$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
})

export function createAuditRoutes({ getPrisma, getSupabaseAdmin, repository }) {
  const router = Router()
  const prisma = getPrisma()
  const auditGuard = requirePermission('admin.audit.read', { prisma })

  function repo() {
    if (repository) return repository
    const client = getSupabaseAdmin?.()
    if (!client) throw new HttpError(503, 'Supabase Admin no está configurado.')
    return createSupabaseAuditRepository(client)
  }

  router.get('/', ...auditGuard, staffLimiter, async (req, res, next) => {
    try {
      const parsed = listQuerySchema.safeParse(req.query)
      if (!parsed.success) throw new HttpError(400, 'Parámetros de auditoría inválidos.')
      const entries = await repo().list(parsed.data)
      const isFullPage = entries.length === parsed.data.limit
      res.json({
        entries,
        // El cursor sale del último registro devuelto: la UI lo reenvía como
        // `before`/`beforeId` para pedir la página siguiente.
        nextCursor: isFullPage ? entries[entries.length - 1].created_at : null,
        nextCursorId: isFullPage ? entries[entries.length - 1].id : null,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/facets', ...auditGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json(await repo().facets())
    } catch (error) {
      next(error)
    }
  })

  router.get('/overview', ...auditGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json(await repo().overview())
    } catch (error) {
      next(error)
    }
  })

  return router
}
