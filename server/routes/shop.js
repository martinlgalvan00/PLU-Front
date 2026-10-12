import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { publicReadCache, PUBLIC_CACHE_SECONDS } from '../lib/http.js'
import { validateBody } from '../lib/validate.js'
import { requirePermission } from '../middleware/auth.js'
import { publicReadLimiter, staffLimiter } from '../middleware/rateLimit.js'
import { createSupabaseShopRepository } from '../modules/shop/supabaseShopRepository.js'

const CATEGORIES = ['apparel', 'accessories', 'exclusive', 'course']
const MODALITIES = ['presencial', 'online', 'hibrido']
const STATUSES = ['draft', 'published', 'archived']

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const sizeSchema = z.object({
  label: z.string().trim().min(1).max(20),
  stock: z.number().int().min(0).max(100000),
})

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null)

const productSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    category: z.enum(CATEGORIES),
    description: z.string().trim().max(4000).optional().default(''),
    price: z.number().int().min(0).max(100_000_000),
    imagePaths: z
      .array(z.string().regex(/^products\/[A-Za-z0-9._()+ -]+$/))
      .max(8)
      .optional()
      .default([]),
    sizes: z.array(sizeSchema).max(20).optional().default([]),
    stock: z.number().int().min(0).max(100000).optional().default(0),
    eventId: z.string().uuid().optional().nullable(),
    editionNote: optionalText(120),
    courseStartsAt: z.string().datetime({ offset: true }).optional().nullable(),
    courseModality: z.enum(MODALITIES).optional().nullable(),
    courseLocation: optionalText(160),
    courseCapacity: z.number().int().min(0).max(100000).optional().nullable(),
    status: z.enum(STATUSES).optional().default('draft'),
    featured: z.boolean().optional().default(false),
    sortOrder: z.number().int().min(-1000).max(1000).optional().default(0),
  })
  .superRefine((product, ctx) => {
    const labels = product.sizes.map((size) => size.label.toLowerCase())
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Hay talles repetidos.' })
    }
    // Un curso es una inscripción, no una prenda: no lleva talles ni stock y,
    // para publicarse, necesita fecha y modalidad.
    if (product.category === 'course') {
      if (product.sizes.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['sizes'], message: 'Un curso no lleva talles.' })
      }
      if (product.status === 'published' && (!product.courseStartsAt || !product.courseModality)) {
        ctx.addIssue({
          code: 'custom',
          path: ['courseStartsAt'],
          message: 'Para publicar un curso cargá fecha y modalidad.',
        })
      }
    }
    if (product.category === 'exclusive' && product.status === 'published' && !product.eventId) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventId'],
        message: 'Una exclusiva de torneo necesita el torneo asociado.',
      })
    }
  })

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
})

/**
 * Catálogo de la tienda. Lectura pública (solo publicado, sin cifras de stock)
 * y administración con `admin.shop.read` / `admin.shop.write`.
 *
 * No cobra nada: el pago de la tienda es una etapa aparte porque exige un tipo
 * de orden propio en el motor de pagos.
 */
export function createShopRoutes(deps = {}) {
  const router = Router()
  const prisma = typeof deps.getPrisma === 'function' ? deps.getPrisma() : deps.prisma
  const readGuard = requirePermission('admin.shop.read', { prisma })
  const writeGuard = requirePermission('admin.shop.write', { prisma })

  const repo = () => {
    if (deps.repository) return deps.repository
    return createSupabaseShopRepository(deps.getSupabaseAdmin?.())
  }
  const actorLabel = (req) => `${req.auth.user.id}:${req.auth.user.email}`
  const idParam = (req) => {
    const parsed = z.string().uuid().safeParse(req.params.productId)
    if (!parsed.success) throw new HttpError(400, 'Producto inválido.')
    return parsed.data
  }
  const toRpcPayload = (data) => ({ ...data, slug: slugify(data.title) || 'producto' })

  router.get('/products', publicReadLimiter, async (_req, res, next) => {
    try {
      const products = await repo().listPublicProducts()
      res.set('Cache-Control', publicReadCache(PUBLIC_CACHE_SECONDS.CATALOG))
      res.json({ products })
    } catch (error) {
      next(error)
    }
  })

  router.get('/admin/products', ...readGuard, staffLimiter, async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'private, no-store')
      res.json({ products: await repo().listAdminProducts() })
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/admin/products',
    ...writeGuard,
    staffLimiter,
    validateBody(productSchema),
    async (req, res, next) => {
      try {
        const product = await repo().saveProduct(
          null,
          toRpcPayload(req.validatedBody),
          actorLabel(req),
        )
        res.status(201).json({ product })
      } catch (error) {
        next(error)
      }
    },
  )

  router.patch(
    '/admin/products/:productId',
    ...writeGuard,
    staffLimiter,
    validateBody(productSchema),
    async (req, res, next) => {
      try {
        const product = await repo().saveProduct(
          idParam(req),
          toRpcPayload(req.validatedBody),
          actorLabel(req),
        )
        res.json({ product })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete(
    '/admin/products/:productId',
    ...writeGuard,
    staffLimiter,
    async (req, res, next) => {
      try {
        res.json(await repo().deleteProduct(idParam(req), actorLabel(req)))
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/admin/images/upload-url',
    ...writeGuard,
    staffLimiter,
    validateBody(uploadSchema),
    async (req, res, next) => {
      try {
        res.json(await repo().createImageUpload(req.validatedBody.fileName))
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}

export { productSchema as shopProductSchema, slugify as shopSlugify }
