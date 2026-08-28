import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import {
  ATHLETE_PHOTO_BUCKET,
  PUBLIC_PORTRAIT_CACHE_CONTROL,
  isSafeStoragePhotoPath,
} from '../lib/publicPortraitUrl.js'
import { publicReadLimiter } from '../middleware/rateLimit.js'
import { createSupabaseCommunityRepository } from '../modules/community/supabaseCommunityRepository.js'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
})

const portraitQuerySchema = z.object({
  p: z.string().trim().min(3).max(300),
})

async function findPublicPortraitPath(client, path) {
  if (!isSafeStoragePhotoPath(path)) return null

  const athlete = await client.from('athletes').select('id').eq('photo_path', path).maybeSingle()
  if (athlete.error) {
    throw new HttpError(502, athlete.error.message || 'No se pudo validar el retrato.')
  }
  const athleteId = athlete.data?.id
  if (!athleteId) return null

  const membership = await client
    .from('memberships')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('status', 'activa')
    .limit(1)
    .maybeSingle()
  if (membership.error) {
    throw new HttpError(502, membership.error.message || 'No se pudo validar el retrato.')
  }
  if (membership.data?.id) return path

  const visible = await client
    .from('event_registrations')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('public_visible', true)
    .limit(1)
    .maybeSingle()
  if (visible.error) {
    throw new HttpError(502, visible.error.message || 'No se pudo validar el retrato.')
  }
  return visible.data?.id ? path : null
}

async function readStorageBody(data) {
  if (!data) return Buffer.alloc(0)
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) return Buffer.from(data)
  if (typeof data.arrayBuffer === 'function') {
    return Buffer.from(await data.arrayBuffer())
  }
  return Buffer.from(data)
}

export function createCommunityRoutes(deps = {}) {
  const router = Router()
  const getSupabaseAdmin = deps.getSupabaseAdmin
  const repository =
    deps.communityRepository ??
    createSupabaseCommunityRepository({
      getSupabaseAdmin,
    })

  router.get('/spotlight', publicReadLimiter, async (req, res, next) => {
    try {
      const parsed = querySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: 'Parámetros inválidos.' })
        return
      }
      const spotlight = await repository.getSpotlight(parsed.data.limit)
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
      res.json(spotlight)
    } catch (error) {
      next(error)
    }
  })

  /**
   * Binario del retrato ya exhibido en público. La URL no lleva token: el
   * CDN puede cachearla y el browser no re-descarga cuando el JSON del
   * spotlight se refresca.
   */
  router.get('/portrait', publicReadLimiter, async (req, res, next) => {
    try {
      const parsed = portraitQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: 'Retrato inválido.' })
        return
      }

      const client = getSupabaseAdmin?.()
      if (!client) {
        throw new HttpError(503, 'Supabase no está configurado en el servidor.')
      }

      const path = await findPublicPortraitPath(client, parsed.data.p)
      if (!path) {
        res.status(404).end()
        return
      }

      const downloaded = await client.storage.from(ATHLETE_PHOTO_BUCKET).download(path)
      if (downloaded.error || !downloaded.data) {
        res.status(404).end()
        return
      }

      const body = await readStorageBody(downloaded.data)
      res.set('Cache-Control', PUBLIC_PORTRAIT_CACHE_CONTROL)
      res.set('Content-Type', downloaded.data.type || 'image/webp')
      res.send(body)
    } catch (error) {
      next(error)
    }
  })

  return router
}
