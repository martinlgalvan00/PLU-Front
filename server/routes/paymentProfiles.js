import { Router } from 'express'
import { z } from 'zod'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'
import { validateBody } from '../lib/validate.js'
import { requireSupabaseClient } from '../lib/supabaseRpc.js'
import { createSupabasePaymentProfileRepository } from '../modules/payments/supabasePaymentProfileRepository.js'
import { isPaymentProfileSecretsKeyConfigured } from '../modules/payments/paymentProfileSecrets.js'

const bankConfigSchema = z.object({
  alias: z.string().trim().max(120).optional().default(''),
  cbu: z.string().trim().max(30).optional().default(''),
  holder: z.string().trim().max(160).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
})

const mpConfigSchema = z.object({
  publicKey: z.string().trim().min(8).max(120),
  collectorId: z.string().trim().max(40).optional().default(''),
  notes: z.string().trim().max(500).optional().default(''),
})

const mpSecretsSchema = z.object({
  accessToken: z.string().trim().min(10).max(256),
  webhookSecret: z.string().trim().min(8).max(256),
})

const createSchema = z.discriminatedUnion('kind', [
  z.object({
    name: z.string().trim().min(2).max(120),
    kind: z.literal('bank_transfer'),
    config: bankConfigSchema.default({}),
  }),
  z.object({
    name: z.string().trim().min(2).max(120),
    kind: z.literal('mercado_pago'),
    config: mpConfigSchema,
    secrets: mpSecretsSchema,
  }),
])

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: mpSecretsSchema.optional(),
  active: z.boolean().optional(),
})

export function createPaymentProfileRoutes({ getPrisma, getSupabaseAdmin, env = process.env }) {
  const router = Router()
  const prisma = getPrisma()
  const readGuard = requirePermission('admin.events.read', { prisma })
  const writeGuard = requirePermission('admin.events.write', { prisma })
  const repo = () =>
    createSupabasePaymentProfileRepository(requireSupabaseClient(getSupabaseAdmin), { env })

  router.get('/', ...readGuard, staffLimiter, async (req, res, next) => {
    try {
      const kind = String(req.query?.kind ?? '').trim() || null
      const profiles = await repo().list({
        kind: kind || undefined,
        activeOnly: req.query?.includeArchived !== 'true',
      })
      res.json({
        profiles,
        secretsKeyConfigured: isPaymentProfileSecretsKeyConfigured(env),
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/', ...writeGuard, staffLimiter, validateBody(createSchema), async (req, res, next) => {
    try {
      const profile = await repo().create(req.validatedBody)
      res.status(201).json({ profile })
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/:profileId',
    ...writeGuard,
    staffLimiter,
    validateBody(updateSchema),
    async (req, res, next) => {
      try {
        const profile = await repo().update(req.params.profileId, req.validatedBody)
        res.json({ profile })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
