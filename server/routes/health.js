import { Router } from 'express'

export function createHealthRoutes({ getPrisma, getSupabaseAdmin } = {}) {
  const router = Router()
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'plu-arg-api', timestamp: new Date().toISOString() })
  })
  router.get('/ready', async (_req, res) => {
    const checks = { prisma: false, supabase: false }
    const errors = []

    try {
      const prisma = getPrisma?.()
      if (prisma) {
        await prisma.$queryRaw`SELECT 1`
        checks.prisma = true
      }
    } catch (error) {
      errors.push(`prisma: ${error.message}`)
    }

    try {
      const supabase = getSupabaseAdmin?.()
      if (supabase) {
        const { error } = await supabase.from('events').select('id', { head: true, count: 'exact' }).limit(1)
        if (error) throw error
        checks.supabase = true
      }
    } catch (error) {
      errors.push(`supabase: ${error.message}`)
    }

    const ready = checks.prisma && checks.supabase
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      ...(errors.length ? { error: errors.join(' | ') } : {}),
    })
  })
  return router
}

export default createHealthRoutes()
