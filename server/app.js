import express from 'express'
import cors from 'cors'
import healthRoutes from './routes/health.js'
import paymentRoutes from './routes/payments.js'
import emailRoutes from './routes/emails.js'

export function createApp() {
  const app = express()
  const origin = process.env.VITE_APP_URL || 'http://localhost:5173'

  app.use(cors({ origin }))
  app.use(express.json())
  app.use(healthRoutes)
  app.use('/api/payments', paymentRoutes)
  app.use('/api/emails', emailRoutes)

  return app
}
