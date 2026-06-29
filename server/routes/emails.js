import { Router } from 'express'
import { notImplemented } from '../lib/http.js'

const router = Router()

router.post('/send', (_req, res) => notImplemented(res, 'Emails'))

export default router
