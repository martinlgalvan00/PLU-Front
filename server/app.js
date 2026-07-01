import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import healthRoutes from './routes/health.js'
import paymentRoutes from './routes/payments.js'
import emailRoutes from './routes/emails.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { corsOrigin, requireTrustedMutation } from './lib/security.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: corsOrigin, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(requireTrustedMutation)
  app.use(healthRoutes)
  app.use('/api/payments', paymentRoutes)
  app.use('/api/emails', emailRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
