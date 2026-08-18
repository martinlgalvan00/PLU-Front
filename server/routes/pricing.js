import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import {
  FEATURE_KEYS,
  assertPricingWritesEnabled,
  getFeatureAvailability,
} from '../lib/featureAvailability.js'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { createSupabasePricingRepository } from '../modules/pricing/supabasePricingRepository.js'

const money = z.coerce.number().int().positive().max(10_000_000)
const optionalDateTime = z
  .string()
  .trim()
  .optional()
  .default('')
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Fecha inválida.')

export const membershipPlanVersionSchema = z.object({
  sourcePlanId: z.string().uuid().optional(),
  familyCode: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usá letras minúsculas, números y guiones.'),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(400).optional().default(''),
  price: money,
  // Precio para transferencia/efectivo. Vacío = cobra igual que `price` en
  // cualquier canal.
  manualPrice: money.optional(),
  currency: z.literal('ARS').default('ARS'),
  billingFrequency: z.enum(['monthly', 'annual']),
  collectionMode: z.enum(['one_time', 'recurring']),
  intervalCount: z.coerce.number().int().min(1).max(24),
  graceDays: z.coerce.number().int().min(0).max(90),
  effectiveFrom: optionalDateTime,
  retiresAt: optionalDateTime,
})

const planStatusSchema = z.object({ active: z.boolean() })
const planRetirementSchema = z.object({ retiresAt: optionalDateTime })

export const discountCodeSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(32)
      .regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, 'Usá letras mayúsculas, números y guiones.'),
    description: z.string().trim().max(200).optional().default(''),
    // 'percent' descuenta sobre el precio vigente; 'fixed_price' fija el
    // importe final de la compra ("afiliación + inscripción a $120.000").
    kind: z.enum(['percent', 'fixed_price']).default('percent'),
    // Tope en 99: un cupón nunca puede dejar una orden en $0 — Mercado Pago no
    // puede cobrar eso, y hoy no existe un flujo de confirmación para orden
    // gratuita. Ver apply_discount_code_to_order (rechaza descuento == importe).
    percentOff: z.coerce.number().int().min(1).max(99).optional(),
    // Mismo importe en todos los canales de pago: el precio promocional pisa
    // la diferencia Mercado Pago / transferencia del catálogo.
    fixedPrice: money.optional(),
    appliesTo: z.enum(['membership', 'registration', 'combo', 'both']),
    maxRedemptions: z.coerce.number().int().positive().optional(),
    expiresAt: optionalDateTime,
    active: z.boolean().default(true),
    // Opt-in por cupón y por canal: Mercado Pago siempre está disponible, y
    // acá se listan los canales manuales que este código destraba además. No
    // reemplaza el interruptor general de canal manual, lo salta puntualmente
    // para quien use este código. Lista vacía = sólo Mercado Pago.
    manualChannels: z
      .array(z.enum(['bank_transfer', 'cash_pitbull']))
      .max(2)
      .default([])
      .transform((channels) => [...new Set(channels)]),
  })
  .superRefine((code, context) => {
    if (code.kind === 'percent') {
      if (code.percentOff == null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['percentOff'],
          message: 'Indicá el porcentaje de descuento.',
        })
      }
      return
    }
    if (code.fixedPrice == null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fixedPrice'],
        message: 'Indicá el precio promocional.',
      })
    }
    // Un mismo importe fijo no significa lo mismo aplicado a una afiliación
    // sola que a un combo: el precio promocional exige un alcance único.
    if (code.appliesTo === 'both') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appliesTo'],
        message: 'Un precio promocional necesita un alcance único: afiliación, inscripción o combo.',
      })
    }
  })
  .transform((code) =>
    // El campo de la modalidad que no corresponde se descarta acá: así editar
    // un cupón de porcentaje a precio fijo (o al revés) no deja el valor viejo
    // colgado en la fila.
    code.kind === 'percent'
      ? { ...code, fixedPrice: undefined }
      : { ...code, percentOff: undefined },
  )

const discountCodeStatusSchema = z.object({ active: z.boolean() })

export const comboOfferSchema = z
  .object({
    membershipPlanId: z.string().uuid(),
    price: money,
    manualPrice: money.optional(),
    active: z.boolean().default(false),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
  })
  .superRefine((offer, context) => {
    if (offer.startsAt && offer.endsAt && new Date(offer.endsAt) < new Date(offer.startsAt)) {
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

function parseRouteParam(schema, value, message) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HttpError(400, message)
  return parsed.data
}

export function createPricingRoutes({ getPrisma, getSupabaseAdmin, env = process.env }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.pricing.read', { prisma })
  const writeGuard = requirePermission('admin.pricing.write', { prisma })
  const repository = () =>
    createSupabasePricingRepository(requireSupabaseClient(getSupabaseAdmin()))

  router.get('/', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      const configuration = await repository().getConfiguration()
      const pricingAvailability = getFeatureAvailability(FEATURE_KEYS.pricingWrites, env)
      res.json({
        ...configuration,
        availability: {
          editable: pricingAvailability.enabled,
          reason: pricingAvailability.reason,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/membership-plans/versions',
    ...writeGuard,
    staffLimiter,
    validateBody(membershipPlanVersionSchema),
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const plan = await repository().createPlanVersion(req.validatedBody, actor(req))
        res.status(201).json({ plan })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/membership-plans/:planId/status',
    ...writeGuard,
    staffLimiter,
    validateBody(planStatusSchema),
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const planId = parseRouteParam(
          z.string().uuid(),
          req.params.planId,
          'El identificador del plan es inválido.',
        )
        const plan = await repository().setPlanActive(planId, req.validatedBody.active, actor(req))
        res.json({ plan })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete(
    '/membership-plans/:planId',
    ...writeGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const planId = parseRouteParam(
          z.string().uuid(),
          req.params.planId,
          'El identificador del plan es invÃ¡lido.',
        )
        const result = await repository().deletePlan(planId, actor(req))
        res.json(result)
      } catch (error) {
        next(error)
      }
    },
  )

  router.put(
    '/events/:eventSlug/combo',
    ...writeGuard,
    staffLimiter,
    validateBody(comboOfferSchema),
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const eventSlug = parseRouteParam(
          z
            .string()
            .trim()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          req.params.eventSlug,
          'El identificador del evento es inválido.',
        )
        const offer = await repository().upsertComboOffer(eventSlug, req.validatedBody, actor(req))
        res.json({ offer })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/membership-plans/:planId/retirement',
    ...writeGuard,
    staffLimiter,
    validateBody(planRetirementSchema),
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const planId = parseRouteParam(
          z.string().uuid(),
          req.params.planId,
          'El identificador del plan es inválido.',
        )
        const plan = await repository().setPlanRetirement(
          planId,
          req.validatedBody.retiresAt || null,
          actor(req),
        )
        res.json({ plan })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/discount-codes',
    ...writeGuard,
    staffLimiter,
    validateBody(discountCodeSchema),
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const code = await repository().upsertDiscountCode(req.validatedBody, actor(req))
        res.status(201).json({ code })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete('/discount-codes/:codeId', ...writeGuard, staffLimiter, async (req, res, next) => {
    try {
      assertPricingWritesEnabled(env)
      const codeId = parseRouteParam(
        z.string().uuid(),
        req.params.codeId,
        'El identificador del código es inválido.',
      )
      const result = await repository().deleteDiscountCode(codeId, actor(req))
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/discount-codes/:codeId/status',
    ...writeGuard,
    staffLimiter,
    validateBody(discountCodeStatusSchema),
    async (req, res, next) => {
      try {
        assertPricingWritesEnabled(env)
        const codeId = parseRouteParam(
          z.string().uuid(),
          req.params.codeId,
          'El identificador del código es inválido.',
        )
        const code = await repository().setDiscountCodeActive(
          codeId,
          req.validatedBody.active,
          actor(req),
        )
        res.json({ code })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
