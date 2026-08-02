import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { assertSupabaseResult, requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'

const EVENT_SELECT = `
  *,
  capacityRules:event_capacity_rules(*),
  eventRegistrations:event_registrations(count),
  eventDays:event_days(*),
  ticketTypes:ticket_types(
    *,
    ticketTypeDays:ticket_type_days(event_day_id),
    includedAddons:ticket_type_included_addons(addon_id)
  )
`

const boundedMoney = z.coerce.number().finite().int().min(0).max(10_000_000)
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Fecha inválida.')
const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '')
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'Fecha y hora inválidas.')

const ticketAddonSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  description: z.string().trim().max(240).optional(),
  price: boundedMoney,
  redeemLabel: z.string().trim().max(160).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
})

const pricingSchema = z
  .object({
    membership: boundedMoney,
    registration: boundedMoney,
    combo: boundedMoney,
    ticketsEnabled: z.boolean().optional(),
    ticketAddons: z.array(ticketAddonSchema).max(30).optional(),
  })
  .passthrough()

const eventDaySchema = z.object({
  dayIndex: z.coerce.number().int().min(0).max(30),
  label: z.string().trim().min(1).max(80),
  date: optionalDate,
})

const nullableQuota = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.coerce.number().int().min(0).max(100_000).nullable(),
)

const ticketTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  price: boundedMoney,
  quota: nullableQuota.optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
  dayIndexes: z.array(z.coerce.number().int().min(0).max(30)).max(31).optional(),
  includedAddonIds: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
})

export const eventSchema = z
  .object({
    id: z.string().uuid().optional(),
    expectedUpdatedAt: optionalDateTime,
    slug: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido.'),
    title: z.string().trim().min(3).max(120),
    venue: z.string().trim().min(2).max(120),
    location: z.string().trim().min(2).max(120),
    startsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Inicio inválido.'),
    endsAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Fin inválido.'),
    status: z.enum([
      'proximamente',
      'inscripcion_abierta',
      'cupos_limitados',
      'cerrado',
      'finalizado',
    ]),
    published: z.boolean(),
    requiresMembership: z.boolean().default(true),
    slots: z.coerce.number().int().min(1).max(5000),
    pricing: pricingSchema,
    featured: z.boolean().optional(),
    registrationOpensAt: optionalDateTime,
    registrationClosesAt: optionalDateTime,
    ticketSalesOpensAt: optionalDateTime,
    ticketSalesClosesAt: optionalDateTime,
    eventDays: z.array(eventDaySchema).max(31).optional(),
    ticketTypes: z.array(ticketTypeSchema).max(50).optional(),
    liveStreamUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        'La URL del stream debe comenzar con http:// o https://.',
      ),
    liveStreamProvider: z.enum(['youtube', 'instagram', 'twitch']).optional(),
    liveStatus: z.enum(['offline', 'live', 'ended']).optional(),
  })
  .superRefine((event, context) => {
    if (new Date(event.endsAt) < new Date(event.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'El fin debe ser posterior al inicio.',
      })
    }

    const orderedWindows = [
      ['registrationOpensAt', 'registrationClosesAt'],
      ['ticketSalesOpensAt', 'ticketSalesClosesAt'],
    ]
    for (const [opensKey, closesKey] of orderedWindows) {
      if (
        event[opensKey] &&
        event[closesKey] &&
        new Date(event[closesKey]) < new Date(event[opensKey])
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [closesKey],
          message: 'La fecha de cierre debe ser posterior a la apertura.',
        })
      }
    }

    const dayIndexes = new Set()
    for (const [index, day] of (event.eventDays ?? []).entries()) {
      if (dayIndexes.has(day.dayIndex)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventDays', index, 'dayIndex'],
          message: 'No puede haber dos jornadas con el mismo orden.',
        })
      }
      dayIndexes.add(day.dayIndex)
    }

    const addonIds = new Set((event.pricing.ticketAddons ?? []).map((addon) => addon.id))
    for (const [index, ticketType] of (event.ticketTypes ?? []).entries()) {
      if ((ticketType.dayIndexes ?? []).some((dayIndex) => !dayIndexes.has(dayIndex))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'dayIndexes'],
          message: 'El tipo de entrada referencia una jornada inexistente.',
        })
      }
      if ((ticketType.includedAddonIds ?? []).some((addonId) => !addonIds.has(addonId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ticketTypes', index, 'includedAddonIds'],
          message: 'El tipo de entrada referencia un beneficio inexistente.',
        })
      }
    }
  })

async function readEvents(client) {
  return assertSupabaseResult(
    await client.from('events').select(EVENT_SELECT).order('starts_at'),
    'No se pudieron leer los eventos.',
  )
}

export function createEventRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const editGuard = requirePermission('admin.events.write', { prisma })
  const viewGuard = requirePermission('admin.events.read', { prisma })

  router.get('/', ...viewGuard, staffLimiter, async (_req, res, next) => {
    try {
      const client = requireSupabaseClient(getSupabaseAdmin())
      const events = await readEvents(client)
      res.json({ events })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/upsert',
    ...editGuard,
    staffLimiter,
    validateBody(eventSchema),
    async (req, res, next) => {
      try {
        const client = requireSupabaseClient(getSupabaseAdmin())
        const mode = req.validatedBody.id ? 'updated' : 'created'
        const savedEvent = assertSupabaseResult(
          await client.rpc('staff_save_event', {
            p_event: req.validatedBody,
            p_actor: `${req.auth.user.id}:${req.auth.user.email}`,
          }),
          'No se pudo guardar el evento.',
        )
        const events = await readEvents(client)
        const event = events.find((candidate) => candidate.id === savedEvent.id)
        if (!event) {
          throw new HttpError(503, 'El evento se guardó, pero no se pudo volver a leer.')
        }

        res.status(mode === 'created' ? 201 : 200).json({ event, events, mode })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
