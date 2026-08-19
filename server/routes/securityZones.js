import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'

/**
 * Zonas de seguridad del evento — PLU ARG
 *
 * El equipo de seguridad de un meet era una lista plana de cuentas colgadas del
 * evento: todas con el mismo alcance y sin horario, así que el link personal de
 * quien controlaba la puerta servía igual para leer credenciales en el pesaje.
 * Una zona agrupa a esas cuentas y les fija alcance de escaneo y turno.
 *
 * Las zonas viven en Prisma porque las cuentas de seguridad viven en Prisma
 * (`User.eventId` / `User.eventSlug`). El evento en sí sigue siendo Supabase:
 * acá `eventId` es esa referencia, sin FK, igual que en `User`.
 */

export const ZONE_SCOPES = ['gate_tickets', 'athletes_only', 'athletes_coaches', 'staff_only']

/**
 * Zonas de un meet estándar. No es una plantilla estética: es el reparto que
 * ya se hace a mano en cada evento, y tenerlo en un botón es la diferencia
 * entre armar el operativo en un minuto o en veinte.
 */
export const ZONE_PRESET = [
  { name: 'Puerta principal', scope: 'gate_tickets', sortOrder: 0 },
  { name: 'Pesaje', scope: 'athletes_only', sortOrder: 1 },
  { name: 'Calentamiento', scope: 'athletes_coaches', sortOrder: 2 },
  { name: 'Plataforma', scope: 'staff_only', sortOrder: 3 },
]

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value || '')
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'Fecha inválida.')
  .transform((value) => (value ? new Date(value) : null))

const zoneBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Poné un nombre de zona.').max(60, 'Nombre demasiado largo.'),
    scope: z.enum(ZONE_SCOPES),
    shiftStart: optionalDateTime,
    shiftEnd: optionalDateTime,
    sortOrder: z.coerce.number().int().min(0).max(200).optional(),
  })
  .superRefine((value, context) => {
    if (value.shiftStart && value.shiftEnd && value.shiftEnd <= value.shiftStart) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shiftEnd'],
        message: 'El fin del turno tiene que ser posterior al inicio.',
      })
    }
  })

export const createSecurityZoneSchema = z
  .object({
    eventId: z.string().trim().min(1, 'Falta el evento.'),
    eventSlug: z.string().trim().min(1, 'Falta el evento.'),
  })
  .and(zoneBodySchema)

export const updateSecurityZoneSchema = zoneBodySchema

export const presetSecurityZonesSchema = z.object({
  eventId: z.string().trim().min(1, 'Falta el evento.'),
  eventSlug: z.string().trim().min(1, 'Falta el evento.'),
})

export const assignSecurityZoneSchema = z.object({
  // null saca a la persona de su zona sin borrar la cuenta: sigue siendo del
  // evento, queda pendiente de asignar.
  zoneId: z.string().trim().min(1).nullable(),
})

function serializeZone(zone) {
  return {
    id: zone.id,
    eventId: zone.eventId,
    eventSlug: zone.eventSlug,
    name: zone.name,
    scope: zone.scope,
    shiftStart: zone.shiftStart?.toISOString() ?? null,
    shiftEnd: zone.shiftEnd?.toISOString() ?? null,
    sortOrder: zone.sortOrder,
    memberCount: zone._count?.members ?? 0,
  }
}

export function createSecurityZoneRoutes({ getPrisma }) {
  const router = Router()
  // Mismo permiso que el alta de cuentas de seguridad: quien puede crear el
  // equipo es quien puede organizarlo.
  const guard = requirePermission('admin.users.write', { prisma: getPrisma() })

  async function listZones(eventId) {
    const zones = await getPrisma().eventSecurityZone.findMany({
      where: { eventId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return zones.map(serializeZone)
  }

  async function requireZone(zoneId) {
    const zone = await getPrisma().eventSecurityZone.findUnique({ where: { id: zoneId } })
    if (!zone) throw new HttpError(404, 'La zona no existe.')
    return zone
  }

  router.get('/', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const eventId = String(req.query.eventId ?? '')
      if (!eventId) throw new HttpError(400, 'Falta eventId.')
      res.json({ zones: await listZones(eventId) })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/',
    ...guard,
    staffLimiter,
    validateBody(createSecurityZoneSchema),
    async (req, res, next) => {
      try {
        const { eventId, eventSlug, name, scope, shiftStart, shiftEnd, sortOrder } =
          req.validatedBody

        const existing = await getPrisma().eventSecurityZone.count({ where: { eventId } })
        if (existing >= 20) {
          throw new HttpError(400, 'El evento ya tiene 20 zonas: es el máximo.')
        }

        const zone = await getPrisma().eventSecurityZone.create({
          data: {
            eventId,
            eventSlug,
            name,
            scope,
            shiftStart,
            shiftEnd,
            sortOrder: sortOrder ?? existing,
          },
          include: { _count: { select: { members: true } } },
        })

        res.status(201).json({ zone: serializeZone(zone), zones: await listZones(eventId) })
      } catch (error) {
        // Dos zonas con el mismo nombre en un evento se leen igual en la lista
        // y en el mail del acceso: el índice único lo impide y acá se explica.
        if (error?.code === 'P2002') {
          next(new HttpError(409, 'Ya hay una zona con ese nombre en este evento.'))
          return
        }
        next(error)
      }
    },
  )

  router.patch(
    '/:zoneId',
    ...guard,
    staffLimiter,
    validateBody(updateSecurityZoneSchema),
    async (req, res, next) => {
      try {
        const zone = await requireZone(req.params.zoneId)
        const { name, scope, shiftStart, shiftEnd, sortOrder } = req.validatedBody

        await getPrisma().eventSecurityZone.update({
          where: { id: zone.id },
          data: { name, scope, shiftStart, shiftEnd, ...(sortOrder == null ? {} : { sortOrder }) },
        })

        res.json({ zones: await listZones(zone.eventId) })
      } catch (error) {
        if (error?.code === 'P2002') {
          next(new HttpError(409, 'Ya hay una zona con ese nombre en este evento.'))
          return
        }
        next(error)
      }
    },
  )

  router.delete('/:zoneId', ...guard, staffLimiter, async (req, res, next) => {
    try {
      const zone = await requireZone(req.params.zoneId)
      // La FK es ON DELETE SET NULL: las cuentas asignadas no se borran, quedan
      // pendientes de zona. Borrar una zona nunca puede dejar sin acceso a
      // alguien que ya está en la puerta.
      await getPrisma().eventSecurityZone.delete({ where: { id: zone.id } })
      res.json({ zones: await listZones(zone.eventId) })
    } catch (error) {
      next(error)
    }
  })

  /** Alta de las zonas de un meet estándar. Idempotente: saltea las que ya están. */
  router.post(
    '/preset',
    ...guard,
    staffLimiter,
    validateBody(presetSecurityZonesSchema),
    async (req, res, next) => {
      try {
        const { eventId, eventSlug } = req.validatedBody
        const current = await getPrisma().eventSecurityZone.findMany({
          where: { eventId },
          select: { name: true },
        })
        const taken = new Set(current.map((zone) => zone.name.toLowerCase()))
        const missing = ZONE_PRESET.filter((zone) => !taken.has(zone.name.toLowerCase()))

        if (missing.length) {
          await getPrisma().eventSecurityZone.createMany({
            data: missing.map((zone) => ({ ...zone, eventId, eventSlug })),
          })
        }

        res.status(201).json({ created: missing.length, zones: await listZones(eventId) })
      } catch (error) {
        next(error)
      }
    },
  )

  /** Asigna (o desasigna) una cuenta de seguridad a una zona del mismo evento. */
  router.patch(
    '/members/:userId',
    ...guard,
    staffLimiter,
    validateBody(assignSecurityZoneSchema),
    async (req, res, next) => {
      try {
        const user = await getPrisma().user.findUnique({ where: { id: req.params.userId } })
        if (!user || user.role !== 'seguridad_plu_arg') {
          throw new HttpError(404, 'Usuario de seguridad no encontrado.')
        }

        const { zoneId } = req.validatedBody
        if (zoneId) {
          const zone = await requireZone(zoneId)
          // Una cuenta de seguridad está scopeada a un evento: mandarla a la
          // zona de otro le daría acceso a un meet que no es el suyo.
          if (zone.eventId !== user.eventId) {
            throw new HttpError(400, 'La zona pertenece a otro evento.')
          }
        }

        await getPrisma().user.update({ where: { id: user.id }, data: { securityZoneId: zoneId } })

        res.json({ zones: await listZones(user.eventId) })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
