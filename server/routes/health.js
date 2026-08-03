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
  // El detalle del fallo va al log del servidor, nunca al cuerpo de la
  // respuesta: /ready es publico y sin auth, y los errores de conexion de
  // Prisma suelen traer host, puerto y nombre de base. El cliente solo necesita
  // saber que componente esta caido para decidir si rutea trafico o no.
  router.get('/ready', async (_req, res) => {
    const checks = { prisma: false, supabase: false }
    const failures = []

    try {
      const prisma = getPrisma?.()
      if (prisma) {
        await prisma.$queryRaw`SELECT 1`
        checks.prisma = true
      } else {
        failures.push('prisma')
        console.warn('[ready] prisma: configuración ausente')
      }
    } catch (error) {
      failures.push('prisma')
      console.error('[ready] prisma:', error?.message ?? error)
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
        failures.push('supabase')
        console.warn('[ready] supabase: configuración ausente')
      }
    } catch (error) {
      failures.push('supabase')
      console.error('[ready] supabase:', error?.message ?? error)
    }

    const ready = checks.prisma && checks.supabase
    res
      .set('Cache-Control', 'no-store')
      .status(ready ? 200 : 503)
      .json({
        status: ready ? 'ready' : 'not_ready',
        checks,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
        ...(failures.length ? { failing: failures } : {}),
      })
  })
  return router
}

export default createHealthRoutes()
