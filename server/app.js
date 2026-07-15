import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import healthRoutes from './routes/health.js'
import { createPaymentRoutes } from './routes/payments.js'
import { createEmailRoutes } from './routes/emails.js'
import { createAuthRoutes } from './routes/auth.js'
import { createTicketRoutes } from './routes/tickets.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { getPrisma } from './lib/prisma.js'
import { corsOrigin, requireTrustedMutation } from './lib/security.js'
import { createOptionalAuth0JwtCheck } from './modules/auth/auth0.js'

export function createApp(deps = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: corsOrigin, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(requireTrustedMutation)
  app.use(healthRoutes)
  app.use(
    '/api/auth',
    createAuthRoutes({
      getPrisma: () => deps.prisma ?? getPrisma(),
      auth0JwtCheck: deps.auth0JwtCheck ?? createOptionalAuth0JwtCheck(),
    }),
  )
  app.use(
    '/api/payments',
    createPaymentRoutes({
      supabaseAdmin: deps.supabaseAdmin,
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
      supabaseAdmin: deps.supabaseAdmin,
      repository: deps.notificationRepository,
      brevo: deps.brevo,
      env: deps.env,
    }),
  )
  app.use('/api/tickets', createTicketRoutes({ getPrisma: () => deps.prisma ?? getPrisma() }))
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
