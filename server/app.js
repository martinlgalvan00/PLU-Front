import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { createHealthRoutes } from './routes/health.js'
import { createPaymentRoutes } from './routes/payments.js'
import { createEmailRoutes } from './routes/emails.js'
import { createAuthRoutes } from './routes/auth.js'
import { createUserRoutes } from './routes/users.js'
import { createAccessControlRoutes } from './routes/accessControl.js'
import { createTicketRoutes } from './routes/tickets.js'
import { createAthleteRoutes } from './routes/athletes.js'
import { createAnalyticsRoutes } from './routes/analytics.js'
import { createAuditRoutes } from './routes/audit.js'
import { createEventRoutes } from './routes/events.js'
import { createPricingRoutes } from './routes/pricing.js'
import { createCommunityRoutes } from './routes/community.js'
import { createLaunchInterestRoutes } from './routes/launchInterest.js'
import { createInternalJobRoutes } from './routes/internalJobs.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { getPrisma } from './lib/prisma.js'
import { corsOrigin, requireTrustedMutation } from './lib/security.js'
import { createOptionalAuth0JwtCheck } from './modules/auth/auth0.js'
import { getSupabaseAdmin } from './lib/supabaseAdmin.js'

export function createApp(deps = {}) {
  const app = express()
  // Los tests unitarios montan la app con dobles parciales. Nunca deben caer
  // por omisión al cliente admin configurado en el .env local, porque un login
  // de fixture terminaría creando usuarios o auditoría en Supabase real.
  const resolveSupabaseAdmin = () => {
    if (Object.prototype.hasOwnProperty.call(deps, 'supabaseAdmin')) {
      return deps.supabaseAdmin
    }
    return process.env.NODE_ENV === 'test' ? null : getSupabaseAdmin()
  }

  app.disable('x-powered-by')
  // Detras del proxy de Vercel, req.ip es la IP interna del edge salvo que se
  // habilite trust proxy: sin esto todos los clientes comparten una sola clave
  // de rate limit y el ipHash que guardamos en sessions/athlete_sessions no
  // identifica a nadie. Se limita al primer hop -- confiar en toda la cadena
  // de X-Forwarded-For la volveria spoofeable por el cliente.
  // En local (sin proxy) queda apagado para que express-rate-limit no rechace
  // un X-Forwarded-For inesperado.
  const trustedProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (process.env.VERCEL ? 1 : 0))
  if (trustedProxyHops > 0) app.set('trust proxy', trustedProxyHops)
  // CSP del documento lo define vercel.json (incluye OpenFreeMap / MapLibre).
  // Helmet no debe emitir otra política: si se combinan, el browser intersecta
  // y puede bloquear tiles aunque vercel.json los permita.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  )
  app.use(cors({ origin: corsOrigin, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(requireTrustedMutation)
  const healthRoutes = () => createHealthRoutes({
    getPrisma: () => deps.prisma ?? getPrisma(),
    getSupabaseAdmin: resolveSupabaseAdmin,
  })
  app.use(healthRoutes())
  app.use('/api', healthRoutes())
  app.use(
    '/api/internal',
    createInternalJobRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      getSupabaseAdmin: resolveSupabaseAdmin,
      env: deps.env ?? process.env,
      runners: deps.jobRunners,
    }),
  )
  app.use(
    '/api/auth',
    createAuthRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      getSupabaseAdmin: resolveSupabaseAdmin,
      auth0JwtCheck: deps.auth0JwtCheck ?? createOptionalAuth0JwtCheck(),
      brevo: deps.brevo,
      notificationRepository: deps.notificationRepository,
      env: deps.env,
    }),
  )
  app.use(
    '/api/users',
    createUserRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      getSupabaseAdmin: resolveSupabaseAdmin,
      brevo: deps.brevo,
      notificationRepository: deps.notificationRepository,
      env: deps.env,
    }),
  )
  app.use(
    '/api/access-control/roles',
    createAccessControlRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
    }),
  )
  app.use(
    '/api/payments',
    createPaymentRoutes({
      supabaseAdmin: resolveSupabaseAdmin(),
      repository: deps.paymentRepository,
      mercadoPago: deps.mercadoPago,
      notificationRepository: deps.notificationRepository,
      brevo: deps.brevo,
      notifyPaymentApplied: deps.notifyPaymentApplied,
      getPrisma: () => deps.prisma ?? getPrisma(),
      env: deps.env,
    }),
  )
  app.use(
    '/api/emails',
    createEmailRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      supabaseAdmin: resolveSupabaseAdmin(),
      repository: deps.notificationRepository,
      brevo: deps.brevo,
      env: deps.env,
    }),
  )
  app.use(
    '/api/athletes',
    createAthleteRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      getSupabaseAdmin: resolveSupabaseAdmin,
      repository: deps.athleteRepository,
      env: deps.env,
      brevo: deps.brevo,
    }),
  )
  app.use('/api/tickets', createTicketRoutes({
    getPrisma: () => deps.prisma ?? getPrisma(),
    getSupabaseAdmin: resolveSupabaseAdmin,
    repository: deps.ticketRepository,
    athleteRepository: deps.athleteRepository,
    env: deps.env ?? process.env,
  }))
  app.use('/api/audit', createAuditRoutes({
    getPrisma: () => deps.prisma ?? getPrisma(),
    getSupabaseAdmin: resolveSupabaseAdmin,
    repository: deps.auditRepository,
  }))
  app.use('/api/analytics', createAnalyticsRoutes({
    getPrisma: () => deps.prisma ?? getPrisma(),
    getSupabaseAdmin: resolveSupabaseAdmin,
    repository: deps.analyticsRepository,
    env: deps.env ?? process.env,
  }))
  app.use('/api/events', createEventRoutes({
    getPrisma: () => deps.prisma ?? getPrisma(),
    getSupabaseAdmin: resolveSupabaseAdmin,
  }))
  app.use('/api/pricing', createPricingRoutes({
    getPrisma: () => deps.prisma ?? getPrisma(),
    getSupabaseAdmin: resolveSupabaseAdmin,
    env: deps.env ?? process.env,
  }))
  app.use(
    '/api/community',
    createCommunityRoutes({
      getSupabaseAdmin: resolveSupabaseAdmin,
      communityRepository: deps.communityRepository,
    }),
  )
  app.use(
    '/api/launch-interest',
    createLaunchInterestRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      getSupabaseAdmin: resolveSupabaseAdmin,
      launchInterestRepository: deps.launchInterestRepository,
      brevo: deps.brevo,
      env: deps.env ?? process.env,
    }),
  )
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
