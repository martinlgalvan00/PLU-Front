import { Router } from 'express'
import { z } from 'zod'
import { assertSupabaseResult, requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'

const EDIT_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']
const VIEW_ROLES = [...EDIT_ROLES, 'viewer_plu_usa', 'seguridad_plu_arg']
const eventSchema = z.object({
  slug: z.string().trim().min(2), title: z.string().trim().min(3), venue: z.string().trim().min(2),
  location: z.string().trim().min(2), startsAt: z.string().trim().min(8), endsAt: z.string().trim().min(8),
  status: z.enum(['proximamente', 'inscripcion_abierta', 'cupos_limitados', 'cerrado', 'finalizado']),
  published: z.boolean(), slots: z.union([z.string(), z.number()]), pricing: z.record(z.unknown()),
  registrationOpensAt: z.string().optional(), registrationClosesAt: z.string().optional(),
  ticketSalesOpensAt: z.string().optional(), ticketSalesClosesAt: z.string().optional(),
  capacityDay1: z.union([z.string(), z.number()]).optional(), capacityDay2: z.union([z.string(), z.number()]).optional(),
  capacityBoth: z.union([z.string(), z.number()]).optional(), liveStreamUrl: z.string().optional(),
  liveStreamProvider: z.enum(['youtube', 'instagram', 'twitch']).optional(), liveStatus: z.enum(['offline', 'live', 'ended']).optional(),
}).passthrough()

export function createEventRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const editGuard = requireRole(EDIT_ROLES, { prisma })
  const viewGuard = requireRole(VIEW_ROLES, { prisma })
  router.get('/', ...viewGuard, staffLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = assertSupabaseResult(
        await client.from('events').select('*, capacityRules:event_capacity_rules(*)').order('starts_at'),
        'No se pudieron leer los eventos.',
      )
      res.json({ events })
    } catch (error) { next(error) }
  })
  router.post('/upsert', ...editGuard, staffLimiter, validateBody(eventSchema), async (req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const event = assertSupabaseResult(await client.rpc('staff_upsert_event', {
        p_event: req.validatedBody,
        p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
      }), 'No se pudo guardar el evento.')
      res.json({ event })
    } catch (error) { next(error) }
  })
  return router
}
