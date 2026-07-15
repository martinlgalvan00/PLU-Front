import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { validateBody } from '../lib/validate.js'
import { requireRole } from '../middleware/auth.js'
import {
  approveTicketOrder,
  createTicketOrder,
  getTicketByQrToken,
  listPendingManualTicketOrders,
  listTicketsForEvent,
  registerTicketPaymentProof,
} from '../modules/ticketing/ticketWorkflow.js'
import { checkInRegistration, checkInTicket } from '../modules/ticketing/checkinWorkflow.js'
import { redeemTicketAddon } from '../modules/ticketing/ticketAddonRedemptionWorkflow.js'
import { createTicketPaymentProofSignedUrl } from '../modules/ticketing/ticketProofWorkflow.js'

const CHECKIN_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg', 'seguridad_plu_arg']
const FINANCE_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']

const attendeeSchema = z.object({
  fullName: z.string().trim().min(3),
  dni: z.string().trim().regex(/^\d{7,8}$/),
  dayPass: z.enum(['day1', 'day2', 'both']),
  addonIds: z.array(z.string().trim().min(1)).optional().default([]),
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
  provider: z.enum(['mercado_pago', 'manual']).optional(),
})

export function createTicketRoutes({ getPrisma }) {
  const router = Router()
  const prisma = getPrisma()
  const guard = requireRole(CHECKIN_ROLES, { prisma })
  const financeGuard = requireRole(FINANCE_ROLES, { prisma })

  async function approveOrderHandler(req, res, next) {
    try {
      const result = await approveTicketOrder({ prisma, orderId: req.params.orderId })
      res.json(result)
    } catch (error) {
      next(error)
    }
  }

  // Compra pública — no requiere cuenta.
  router.post('/orders', validateBody(createOrderSchema), async (req, res, next) => {
    try {
      const result = await createTicketOrder({ prisma, ...req.validatedBody })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  // Aprobación exclusivamente manual y protegida. Mercado Pago confirma
  // por el webhook firmado de /api/payments/webhook.
  router.post('/orders/:orderId/approve', ...financeGuard, async (req, res, next) => {
    try {
      const order = await prisma.ticketOrder.findUnique({ where: { id: req.params.orderId } })
      if (!order) throw new HttpError(404, 'Orden no encontrada.')
      if (order.provider !== 'manual') {
        throw new HttpError(400, 'Los pagos de Mercado Pago solo se aprueban por webhook.')
      }
      return approveOrderHandler(req, res, next)
    } catch (error) {
      next(error)
    }
  })

  router.get('/orders/pending-manual', ...financeGuard, async (req, res, next) => {
    try {
      const orders = await listPendingManualTicketOrders({ prisma })
      res.json({ orders })
    } catch (error) {
      next(error)
    }
  })

  const proofSchema = z.object({
    proofPath: z.string().trim().min(3),
  })

  router.post('/orders/:orderId/proof', validateBody(proofSchema), async (req, res, next) => {
    try {
      const result = await registerTicketPaymentProof({
        prisma,
        orderId: req.params.orderId,
        proofPath: req.validatedBody.proofPath,
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  router.get('/orders/:orderId/proof-url', ...financeGuard, async (req, res, next) => {
    try {
      const result = await createTicketPaymentProofSignedUrl({
        prisma,
        orderId: req.params.orderId,
      })
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

  router.post('/checkin/:qrToken/addons/:addonId/redeem', ...guard, async (req, res, next) => {
    try {
      const result = await redeemTicketAddon({
        prisma,
        qrToken: req.params.qrToken,
        addonId: req.params.addonId,
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
