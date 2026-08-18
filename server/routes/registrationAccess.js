import { Router } from 'express'
import { z } from 'zod'
import { hashPassword } from '../services/passwordService.js'
import { HttpError } from '../lib/errors.js'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createSupabaseRegistrationAccessRepository } from '../modules/registrationAccess/supabaseRegistrationAccessRepository.js'

const emptyStringToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .default('')
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Fecha inválida.')

export const registrationAccessGateSchema = z
  .object({
    scope: z.enum(['membership', 'registration']),
    eventSlug: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(1).max(120).optional(),
    ),
    label: z.string().trim().min(2).max(80),
    active: z.boolean().default(true),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    code: z.preprocess(
      emptyStringToUndefined,
      z.string().min(10, 'El código debe tener al menos 10 caracteres.').max(72).optional(),
    ),
  })
  .superRefine((value, context) => {
    if (value.scope === 'registration' && !value.eventSlug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventSlug'],
        message: 'Elegí el torneo.',
      })
    }
    if (value.scope === 'membership' && value.eventSlug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventSlug'],
        message: 'La afiliación no lleva torneo.',
      })
    }
    if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'El cierre debe ser posterior a la apertura.',
      })
    }
  })

function actor(req) {
  return `${req.auth.user.id}:${req.auth.user.email}`
}

export function createRegistrationAccessRoutes({ getPrisma, getSupabaseAdmin, repository }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.registration_access.read', { prisma })
  const writeGuard = requirePermission('admin.registration_access.write', { prisma })
  const repo = () =>
    repository ??
    createSupabaseRegistrationAccessRepository(requireSupabaseClient(getSupabaseAdmin()))

  router.get('/', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.json(await repo().list())
    } catch (error) {
      next(error)
    }
  })

  router.put(
    '/',
    ...writeGuard,
    staffLimiter,
    validateBody(registrationAccessGateSchema),
    async (req, res, next) => {
      try {
        const { code, ...gate } = req.validatedBody
        const saved = await repo().save(
          {
            ...gate,
            codeHash: code ? await hashPassword(code) : null,
          },
          actor(req),
        )
        res.json({ gate: saved })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete('/:gateId', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      const parsedId = z.string().uuid().safeParse(req.params.gateId)
      if (!parsedId.success) throw new HttpError(400, 'El identificador de la tanda es inválido.')
      const deletedGate = await repo().remove(parsedId.data, actor(req))
      res.json({ deletedGate })
    } catch (error) {
      next(error)
    }
  })

  return router
}
