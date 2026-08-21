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
    // importe final de la compra; 'access' no toca el precio y sólo destraba el
    // combo restringido; 'offer' hace las dos cosas — es la oferta exclusiva
    // detrás de un código secreto ("afiliación + inscripción a $120.000").
    //
    // 'access' estaba implementado en la RPC y ofrecido en el panel desde
    // 20260901100000, pero este enum nunca lo incluyó: guardar un código de
    // acceso desde Administración fallaba con 400 antes de llegar a la base.
    kind: z.enum(['percent', 'fixed_price', 'access', 'offer']).default('percent'),
    // Tope en 99: un cupón nunca puede dejar una orden en $0 — Mercado Pago no
    // puede cobrar eso, y hoy no existe un flujo de confirmación para orden
    // gratuita. Ver apply_discount_code_to_order (rechaza descuento == importe).
    percentOff: z.coerce.number().int().min(1).max(99).optional(),
    // Importe final por Mercado Pago. El precio promocional pisa la diferencia
    // Mercado Pago / transferencia del catálogo.
    fixedPrice: money.optional(),
    // Importe final para transferencia y efectivo. Vacío = cobra lo mismo que
    // `fixedPrice` en cualquier canal. No se exige que sea menor: pactar el
    // mismo precio en los dos canales es un acuerdo válido, y cobrar más por
    // el canal manual también, si ese fue el acuerdo. Wise no participa: cotiza
    // en USD y su canal no admite cupones.
    fixedPriceManual: money.optional(),
    appliesTo: z.enum(['membership', 'registration', 'combo', 'both']),
    // A qué inscripción aplica el código. Vacío = cualquiera, que es como se
    // comportaban todos los códigos antes de 20260902100000. Obligatorio en
    // 'offer': la oferta se cotiza contra el combo de ese evento.
    eventId: z.string().uuid().optional(),
    maxRedemptions: z.coerce.number().int().positive().optional(),
    // Ventana de la promo. `startsAt` vacío = vigente desde que se enciende,
    // que es como se comportaban todas las promos antes de tener apertura.
    startsAt: optionalDateTime,
    expiresAt: optionalDateTime,
    active: z.boolean().default(true),
    // Exclusividad nominal: los emails habilitados a usar la promo. Lista vacía
    // = abierta (a quien tenga el código, o a todos si es pública). Con lista,
    // sólo esas direcciones. Es ortogonal a `audience`: una promo pública con
    // lista se aplica sola, pero únicamente a las personas invitadas.
    invitees: z
      .array(z.string().trim().toLowerCase().email().max(200))
      .max(500)
      .default([])
      .transform((emails) => [...new Set(emails)]),
    // Quien accede a la promo. 'code' es la de siempre: hay que tipear el
    // codigo. 'public' se aplica sola a todo el mundo, sin que nadie tipee
    // nada, resuelta en la misma transaccion que crea la orden
    // (plu_private.resolve_public_promo). Apagada = active false, en cualquiera
    // de las dos audiencias: cerrarla no borra si era publica o restringida.
    audience: z.enum(['public', 'code']).default('code'),
    // Opt-in por cupón y por canal: acá se listan los canales manuales que este
    // código destraba además de la pasarela. No reemplaza el interruptor
    // general de canal manual, lo salta puntualmente para quien use este
    // código. Lista vacía = ningún canal manual destrabado.
    manualChannels: z
      .array(z.enum(['bank_transfer', 'cash_pitbull']))
      .max(2)
      .default([])
      .transform((channels) => [...new Set(channels)]),
    // La otra mitad de la matriz (20260908100000): apagarlo cierra Mercado Pago
    // para este código puntual, para una oferta pactada a un precio que sólo
    // cierra por transferencia o en efectivo. Default true = comportamiento
    // histórico.
    mercadoPagoEnabled: z.boolean().default(true),
  })
  .superRefine((code, context) => {
    // Una promo que corre para todos y ademas abre transferencia o efectivo es
    // el interruptor de canal escondido en la pantalla de precios. Los canales
    // se abren en Acceso y habilitacion. Mismo check en la RPC.
    if (code.audience === 'public' && code.manualChannels.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualChannels'],
        message:
          'Una promocion publica no puede habilitar medios de pago manuales. Abrilos desde Acceso y habilitacion.',
      })
    }
    // Mismo criterio del otro lado: una promo publica se aplica sola a todas
    // las compras, asi que cerrarle la pasarela cierra el checkout entero desde
    // la pantalla de precios. Mismo check en la RPC y en el constraint
    // discount_codes_public_channel_check.
    if (code.audience === 'public' && !code.mercadoPagoEnabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mercadoPagoEnabled'],
        message:
          'Una promocion publica no puede cerrar Mercado Pago. Cerralo desde Acceso y habilitacion.',
      })
    }
    // Un codigo sin ningun canal es un codigo que nadie puede pagar: el atleta
    // lo canjea y la ficha no tiene un solo medio que ofrecerle.
    if (!code.mercadoPagoEnabled && code.manualChannels.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manualChannels'],
        message:
          'Si el codigo no acepta Mercado Pago, habilita al menos transferencia o efectivo.',
      })
    }
    // Mismo check que la RPC: una ventana que cierra antes de abrir es una
    // promo que nadie puede usar.
    if (
      code.startsAt &&
      code.expiresAt &&
      Date.parse(code.expiresAt) <= Date.parse(code.startsAt)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'El cierre de la promoción debe ser posterior a su apertura.',
      })
    }
    // Una afiliación es anual y no pertenece a ninguna inscripción.
    if (code.eventId && !['registration', 'combo'].includes(code.appliesTo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventId'],
        message: 'Sólo una inscripción o un combo pueden limitarse a un evento.',
      })
    }
    // Ver `discount_codes_public_event_check` en 20260902100000: el resolver de
    // promo pública no recibe el evento, así que una pública con alcance de
    // inscripción podría impedir que se aplique cualquier otra.
    if (code.eventId && code.audience === 'public') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eventId'],
        message:
          'Una promoción pública no puede limitarse a una inscripción. Repartila como código.',
      })
    }
    // 'percent' y 'access' no llevan importe: el precio manual sólo significa
    // algo cuando hay un precio promocional que desdoblar por canal.
    if (code.fixedPriceManual != null && !['fixed_price', 'offer'].includes(code.kind)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fixedPriceManual'],
        message:
          'El precio por transferencia o efectivo sólo aplica a una promoción de precio promocional.',
      })
    }
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
    // Un código de acceso no descuenta: sólo destraba el combo restringido, y
    // no hay nada que destrabar en una afiliación o una inscripción sueltas.
    if (code.kind === 'access') {
      if (code.appliesTo !== 'combo') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['appliesTo'],
          message: 'Un código de acceso sólo puede aplicarse al combo.',
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
    // La oferta exclusiva es el paquete completo detrás de un secreto: se aplica
    // al combo, se reparte como código y sabe a qué inscripción pertenece.
    if (code.kind === 'offer') {
      if (code.appliesTo !== 'combo') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['appliesTo'],
          message: 'Una oferta exclusiva se aplica al combo de afiliación e inscripción.',
        })
      }
      if (code.audience !== 'code') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['audience'],
          message: 'Una oferta exclusiva se reparte como código: no puede ser pública.',
        })
      }
      if (!code.eventId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['eventId'],
          message: 'Elegí a qué inscripción aplica la oferta exclusiva.',
        })
      }
      return
    }
    // Un mismo importe fijo no significa lo mismo aplicado a una afiliación
    // sola que a un combo: el precio promocional exige un alcance único.
    if (code.appliesTo === 'both') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['appliesTo'],
        message:
          'Un precio promocional necesita un alcance único: afiliación, inscripción o combo.',
      })
    }
  })
  .transform((code) => {
    // Los campos de la modalidad que no corresponde se descartan acá: así
    // editar un cupón de porcentaje a precio fijo (o al revés) no deja el valor
    // viejo colgado en la fila.
    if (code.kind === 'percent') {
      return { ...code, fixedPrice: undefined, fixedPriceManual: undefined }
    }
    if (code.kind === 'access') {
      return { ...code, percentOff: undefined, fixedPrice: undefined, fixedPriceManual: undefined }
    }
    return { ...code, percentOff: undefined }
  })

/**
 * Un solo endpoint para los tres estados de la promo. `audience` ausente
 * conserva la que ya tenia: asi apagar y volver a prender no la convierte en
 * publica por omision.
 */
const discountCodeStateSchema = z.object({
  active: z.boolean(),
  audience: z.enum(['public', 'code']).optional(),
})

export const comboOfferSchema = z
  .object({
    membershipPlanId: z.string().uuid(),
    price: money,
    manualPrice: money.optional(),
    active: z.boolean().default(false),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
    // Mismo eje que las promociones: 'public' lo ve cualquiera, 'code' sólo
    // quien tipea el código de acceso. Apagado sigue siendo `active: false`.
    audience: z.enum(['public', 'code', 'private']).default('public'),
    accessCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(32)
      .optional()
      .default('')
      .refine(
        (value) => !value || /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value),
        'Usá mayúsculas, números y guiones.',
      ),
  })
  .superRefine((offer, context) => {
    if (offer.startsAt && offer.endsAt && new Date(offer.endsAt) < new Date(offer.startsAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'El cierre debe ser posterior a la apertura.',
      })
    }
    // Un combo restringido sin código es un combo que nadie puede comprar.
    if (offer.audience === 'code' && offer.accessCode.length < 3) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accessCode'],
        message: 'Definí el código de acceso al combo (mínimo 3 caracteres).',
      })
    }
  })
  // Un combo público no conserva el código: volver a restringirlo tiene que
  // obligar a elegir uno nuevo en vez de revivir el que ya se repartió.
  .transform((offer) => (offer.audience === 'code' ? offer : { ...offer, accessCode: '' }))

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
      const [configuration, campaignAnalytics] = await Promise.all([
        repository().getConfiguration(),
        repository().getCampaignAnalytics(),
      ])
      const pricingAvailability = getFeatureAvailability(FEATURE_KEYS.pricingWrites, env)
      res.json({
        ...configuration,
        campaignAnalytics,
        availability: {
          editable: pricingAvailability.enabled,
          reason: pricingAvailability.reason,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  router.get(
    '/discount-codes/:codeId/simulation',
    ...readGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        const codeId = parseRouteParam(
          z.string().uuid(),
          req.params.codeId,
          'El identificador del código es inválido.',
        )
        const simulation = await repository().simulatePromotionCode(codeId)
        if (!simulation) throw new HttpError(404, 'Código no encontrado.')
        res.json({ simulation })
      } catch (error) {
        next(error)
      }
    },
  )

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

  router.delete('/events/:eventSlug/combo', ...writeGuard, staffLimiter, async (req, res, next) => {
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
      res.json(await repository().deleteComboOffer(eventSlug, actor(req)))
    } catch (error) {
      next(error)
    }
  })

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

  // `/status` se conserva como alias del contrato anterior (sólo `active`):
  // ambos caminos terminan en la misma RPC, que es la que sabe rechazar una
  // reactivación sin cupo en vez de escribir un `true` sin efecto.
  for (const path of ['/discount-codes/:codeId/state', '/discount-codes/:codeId/status']) {
    router.patch(
      path,
      ...writeGuard,
      staffLimiter,
      validateBody(discountCodeStateSchema),
      async (req, res, next) => {
        try {
          assertPricingWritesEnabled(env)
          const codeId = parseRouteParam(
            z.string().uuid(),
            req.params.codeId,
            'El identificador del código es inválido.',
          )
          const code = await repository().setDiscountCodeState(
            codeId,
            req.validatedBody.active,
            req.validatedBody.audience ?? null,
            actor(req),
          )
          res.json({ code })
        } catch (error) {
          next(error)
        }
      },
    )
  }

  return router
}
