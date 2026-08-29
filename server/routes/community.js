import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import {
  getCachedPublicVisibility,
  PUBLIC_PORTRAIT_CACHE_CONTROL,
  sendPortraitBinary,
  setCachedPublicVisibility,
} from '../lib/portraitBinaryCache.js'
import { isSafeStoragePhotoPath } from '../lib/publicPortraitUrl.js'
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

  const cached = getCachedPublicVisibility(path)
  if (cached === true) return path
  if (cached === false) return null

  // Una sola RPC (ciclo D). Si el entorno todavía no tiene la migración,
  // caemos al camino de 2–3 lecturas para no romper deploys a medias.
  let rpc = { data: null, error: { message: 'rpc unavailable' } }
  try {
    if (typeof client.rpc === 'function') {
      rpc = await client.rpc('is_athlete_portrait_public', { p_path: path })
    }
  } catch (error) {
    rpc = { data: null, error }
  }
  if (!rpc.error) {
    const allowed = Boolean(rpc.data)
    setCachedPublicVisibility(path, allowed)
    return allowed ? path : null
  }

  const athlete = await client.from('athletes').select('id').eq('photo_path', path).maybeSingle()
  if (athlete.error) {
    throw new HttpError(502, athlete.error.message || 'No se pudo validar el retrato.')
  }
  const athleteId = athlete.data?.id
  if (!athleteId) {
    setCachedPublicVisibility(path, false)
    return null
  }

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
  if (membership.data?.id) {
    setCachedPublicVisibility(path, true)
    return path
  }

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
  const allowed = Boolean(visible.data?.id)
  setCachedPublicVisibility(path, allowed)
  return allowed ? path : null
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
   * Binario del retrato ya exhibido en público. URL estable + ETag/LRU:
   * el CDN y el browser evitan re-bajar de Storage en cada visita.
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

      await sendPortraitBinary({
        req,
        res,
        client,
        path,
        cacheControl: PUBLIC_PORTRAIT_CACHE_CONTROL,
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}
