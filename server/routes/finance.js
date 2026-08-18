import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'

const expenseSchema = z.object({
  occurredOn: z.string().date(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(500),
  amount: z.coerce.number().int().positive().max(100000000),
  eventId: z.string().uuid().nullable().optional(),
  receiptPath: z.string().trim().max(500).optional(),
})
export function createFinanceRoutes({ getPrisma, getSupabaseAdmin }) {
  const router = Router()
  const prisma = getPrisma()
  const read = requirePermission('admin.payments.read', { prisma })
  const write = requirePermission('admin.payments.approve', { prisma })
  const client = () => {
    const value = getSupabaseAdmin?.()
    if (!value) throw new HttpError(503, 'Supabase Admin no está configurado.')
    return value
  }
  router.get('/', ...read, staffLimiter, async (req, res, next) => {
    try {
      const from = String(req.query.from ?? '2000-01-01')
      const to = String(req.query.to ?? '2100-01-01')
      const term = String(req.query.query ?? '')
        .trim()
        .toLowerCase()
      const [expenses, athletePayments, ticketPayments] = await Promise.all([
        client()
          .from('financial_expenses')
          .select(
            'id,occurred_on,category,description,amount,currency,event_id,receipt_path,created_at',
          )
          .gte('occurred_on', from)
          .lte('occurred_on', to)
          .order('occurred_on', { ascending: false }),
        client()
          .from('athlete_payments')
          .select(
            'id,amount,currency,confirmed_at,order_id,athlete_payment_orders!inner(concept,reference)',
          )
          .eq('status', 'aprobado')
          .gte('confirmed_at', from)
          .lte('confirmed_at', `${to}T23:59:59Z`),
        client()
          .from('ticket_payments')
          .select('id,amount,currency,confirmed_at,order_id,ticket_orders!inner(reference)')
          .eq('status', 'aprobado')
          .gte('confirmed_at', from)
          .lte('confirmed_at', `${to}T23:59:59Z`),
      ])
      if (expenses.error || athletePayments.error || ticketPayments.error)
        throw new Error(
          expenses.error?.message ||
            athletePayments.error?.message ||
            ticketPayments.error?.message,
        )
      const income = [...athletePayments.data, ...ticketPayments.data].map((x) => ({
        id: `income-${x.id}`,
        kind: 'income',
        occurredOn: x.confirmed_at,
        category: 'Cobro aprobado',
        description: x.athlete_payment_orders?.concept || 'Entrada',
        amount: x.amount,
        currency: x.currency,
        reference: x.athlete_payment_orders?.reference || x.ticket_orders?.reference,
      }))
      const outgoings = expenses.data.map((x) => ({
        id: x.id,
        kind: 'expense',
        occurredOn: x.occurred_on,
        category: x.category,
        description: x.description,
        amount: x.amount,
        currency: x.currency,
        eventId: x.event_id,
        receiptPath: x.receipt_path,
      }))
      const rows = [...income, ...outgoings]
        .filter(
          (x) =>
            !term ||
            `${x.category} ${x.description} ${x.reference ?? ''}`.toLowerCase().includes(term),
        )
        .sort((a, b) => String(b.occurredOn).localeCompare(String(a.occurredOn)))
      const totals = rows.reduce((a, x) => ({ ...a, [x.kind]: a[x.kind] + Number(x.amount) }), {
        income: 0,
        expense: 0,
      })
      res.json({ rows, totals: { ...totals, balance: totals.income - totals.expense } })
    } catch (e) {
      next(e)
    }
  })
  router.post('/expenses', ...write, staffLimiter, async (req, res, next) => {
    try {
      const parsed = expenseSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError(400, 'Datos de egreso inválidos.')
      const { data, error } = await client().rpc('create_financial_expense', {
        p_occurred_on: parsed.data.occurredOn,
        p_category: parsed.data.category,
        p_description: parsed.data.description,
        p_amount: parsed.data.amount,
        p_event_id: parsed.data.eventId ?? null,
        p_receipt_path: parsed.data.receiptPath ?? null,
        p_actor_id: req.auth.user.id,
      })
      if (error) throw new Error(error.message)
      res.status(201).json({ expense: data })
    } catch (e) {
      next(e)
    }
  })
  return router
}
