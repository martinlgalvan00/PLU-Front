import { Router } from 'express'
import { z } from 'zod'
import { assertSupabaseResult, requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'

const EDIT_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']
const VIEW_ROLES = [...EDIT_ROLES, 'viewer_plu_usa', 'seguridad_plu_arg']

// Forma de cada beneficio del catálogo de tickets (ver src/lib/ticketAddons.js
// normalizeTicketAddon): validada acá porque de acá sale directo a
// staff_upsert_event y despues alimenta create_ticket_order_v2 (precio real
// que le cobra la compra pública de entradas).
const ticketAddonSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  price: z.union([z.string(), z.number()]),
  redeemLabel: z.string().trim().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.union([z.string(), z.number()]).optional(),
})
// El resto de pricing (registration/membership/combo/ticketDay/...) queda
// con passthrough: son todos números sueltos que staff_upsert_event ya
// castea con coalesce(...)::int, sin riesgo si viene un campo de más.
const pricingSchema = z.object({
  ticketAddons: z.array(ticketAddonSchema).optional(),
}).passthrough()

// Un día del evento (event_days): reemplaza el supuesto fijo de "2 días".
const eventDaySchema = z.object({
  dayIndex: z.number().int().min(0),
  label: z.string().trim().min(1),
  date: z.string().trim().optional(),
})
// Un tipo de entrada (ticket_types): precio propio, cupo propio, qué día(s)
// cubre (por dayIndex) y qué addons del catálogo vienen incluidos sin cargo
// (el "pack", ej. Día 1 + choripán).
const ticketTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  price: z.number().min(0),
  quota: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  dayIndexes: z.array(z.number().int().min(0)).optional(),
  includedAddonIds: z.array(z.string()).optional(),
})

const eventSchema = z.object({
  slug: z.string().trim().min(2), title: z.string().trim().min(3), venue: z.string().trim().min(2),
  location: z.string().trim().min(2), startsAt: z.string().trim().min(8), endsAt: z.string().trim().min(8),
  status: z.enum(['proximamente', 'inscripcion_abierta', 'cupos_limitados', 'cerrado', 'finalizado']),
  published: z.boolean(), slots: z.union([z.string(), z.number()]), pricing: pricingSchema,
  featured: z.boolean().optional(),
  registrationOpensAt: z.string().optional(), registrationClosesAt: z.string().optional(),
  ticketSalesOpensAt: z.string().optional(), ticketSalesClosesAt: z.string().optional(),
  eventDays: z.array(eventDaySchema).optional(),
  ticketTypes: z.array(ticketTypeSchema).optional(),
  liveStreamUrl: z.string().optional(),
  liveStreamProvider: z.enum(['youtube', 'instagram', 'twitch']).optional(), liveStatus: z.enum(['offline', 'live', 'ended']).optional(),
})

export function createEventRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const editGuard = requireRole(EDIT_ROLES, { prisma })
  const viewGuard = requireRole(VIEW_ROLES, { prisma })
  router.get('/', ...viewGuard, staffLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = assertSupabaseResult(
        await client
          .from('events')
          .select(`
            *,
            capacityRules:event_capacity_rules(*),
            eventDays:event_days(*),
            ticketTypes:ticket_types(
              *,
              ticketTypeDays:ticket_type_days(event_day_id),
              includedAddons:ticket_type_included_addons(addon_id)
            )
          `)
          .order('starts_at'),
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
