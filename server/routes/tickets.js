import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import {
  approveTicketOrder,
  createTicketOrder,
  getTicketByQrToken,
  listTicketsForEvent,
} from '../modules/ticketing/ticketWorkflow.js'
import { checkInRegistration, checkInTicket } from '../modules/ticketing/checkinWorkflow.js'

const CHECKIN_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'seguridad_plu_arg']

const attendeeSchema = z.object({
  fullName: z.string().trim().min(3),
  dni: z.string().trim().regex(/^\d{7,8}$/),
  dayPass: z.enum(['day1', 'day2', 'both']),
})

const createOrderSchema = z.object({
  eventSlug: z.string().trim().min(1),
  attendees: z.array(attendeeSchema).min(1).max(8),
  buyer: z
    .object({
      name: z.string().trim().optional(),
      email: z.string().trim().email().optional(),
      phone: z.string().trim().optional(),
    })
    .optional(),
  provider: z.enum(['mercado_pago', 'manual', 'mock']).optional(),
})

export function createTicketRoutes({ getPrisma }) {
  const router = Router()
  const prisma = getPrisma()
  const guard = requireRole(CHECKIN_ROLES, { prisma })

  // Compra pública — no requiere cuenta.
  router.post('/orders', validateBody(createOrderSchema), async (req, res, next) => {
    try {
      const result = await createTicketOrder({ prisma, ...req.validatedBody })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  // "Simular pago": es un stand-in del webhook de Mercado Pago (server-to-server),
  // no una acción de seguridad — por eso es público, igual que el resto de los
  // botones "Simular pago" de la demo (afiliación/inscripción).
  router.post('/orders/:orderId/approve', async (req, res, next) => {
    try {
      const result = await approveTicketOrder({ prisma, orderId: req.params.orderId })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  // Verificación pública de solo lectura — a donde apunta el QR.
  router.get('/verify/:qrToken', async (req, res, next) => {
    try {
      const ticket = await getTicketByQrToken({ prisma, qrToken: req.params.qrToken })
      res.json({ ticket })
    } catch (error) {
      next(error)
    }
  })

  router.get('/', ...guard, async (req, res, next) => {
    try {
      const eventSlug = String(req.query.eventSlug ?? '')
      if (!eventSlug) throw new HttpError(400, 'Falta eventSlug.')
      const tickets = await listTicketsForEvent({ prisma, eventSlug })
      res.json({ tickets })
    } catch (error) {
      next(error)
    }
  })

  // Mutación protegida: la única forma de marcar una entrada como usada.
  router.post('/checkin/:qrToken', ...guard, async (req, res, next) => {
    try {
      const result = await checkInTicket({
        prisma,
        qrToken: req.params.qrToken,
        scannedById: req.auth.user.id,
        gate: req.body?.gate,
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.post('/registrations/:registrationId/checkin', ...guard, async (req, res, next) => {
    try {
      const result = await checkInRegistration({
        prisma,
        registrationId: req.params.registrationId,
        scannedById: req.auth.user.id,
        gate: req.body?.gate,
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
