import { Router } from 'express'

export function createHealthRoutes({ getPrisma, getSupabaseAdmin } = {}) {
  const router = Router()
  router.get('/health', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'ok',
      service: 'plu-arg-api',
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    })
  })
  router.get('/ready', async (_req, res) => {
    const checks = { prisma: false, supabase: false }
    const errors = []

    try {
      const prisma = getPrisma?.()
      if (prisma) {
        await prisma.$queryRaw`SELECT 1`
        checks.prisma = true
      } else {
        errors.push('prisma: configuración ausente')
      }
    } catch (error) {
      errors.push(`prisma: ${error.message}`)
    }

    try {
      const supabase = getSupabaseAdmin?.()
      if (supabase) {
        const { error } = await supabase
          .from('events')
          .select('id', { head: true, count: 'exact' })
          .limit(1)
        if (error) throw error
        checks.supabase = true
      } else {
        errors.push('supabase: configuración ausente')
      }
    } catch (error) {
      errors.push(`supabase: ${error.message}`)
    }

    const ready = checks.prisma && checks.supabase
    res
      .set('Cache-Control', 'no-store')
      .status(ready ? 200 : 503)
      .json({
        status: ready ? 'ready' : 'not_ready',
        checks,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
        ...(errors.length ? { error: errors.join(' | ') } : {}),
      })
  })
  return router
}

export default createHealthRoutes()
