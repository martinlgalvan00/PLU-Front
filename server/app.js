import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import healthRoutes from './routes/health.js'
import paymentRoutes from './routes/payments.js'
import emailRoutes from './routes/emails.js'
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
  app.use('/api/payments', paymentRoutes)
  app.use('/api/emails', emailRoutes)
  app.use('/api/tickets', createTicketRoutes({ getPrisma: () => deps.prisma ?? getPrisma() }))
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
