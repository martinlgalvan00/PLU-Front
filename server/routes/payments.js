import { Router } from 'express'
import { notImplemented } from '../lib/http.js'

const router = Router()

router.post('/preferences', (_req, res) => notImplemented(res, 'Pagos'))
router.post('/webhook', (_req, res) => notImplemented(res, 'Webhook de pagos'))

export default router
