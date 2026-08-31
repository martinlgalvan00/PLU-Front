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
const expenseIdSchema = z.string().uuid()

/** Categorías humanas para conceptos de cobro de atletas. */
const ATHLETE_INCOME_CATEGORY = {
  membership: 'Afiliación',
  registration: 'Inscripción',
  combo: 'Afiliación + inscripción',
}

const ATHLETE_CONCEPT_KEYS = new Set(['membership', 'registration', 'combo'])

function cleanText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function athleteIncomeCategory(concept) {
  const key = cleanText(concept)
  if (!key) return 'Cobro'
  return ATHLETE_INCOME_CATEGORY[key] ?? key
}

/** Clave estable para filtrar en FE sin acoplar a labels i18n. */
function athleteConceptKey(concept) {
  const key = cleanText(concept)
  if (key && ATHLETE_CONCEPT_KEYS.has(key)) return key
  return 'other'
}

function incomeDescription(category, party) {
  const name = cleanText(party)
  return name ? `${category} — ${name}` : category
}

/** Traduce los errores de la RPC (PLU01/PLU02) al status HTTP correcto. */
function rpcHttpError(error) {
  if (error?.message?.includes('PLU02')) return new HttpError(404, 'El egreso no existe.')
  return new Error(error?.message ?? 'Error al operar el egreso.')
}
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
            'id,amount,currency,confirmed_at,order_id,athlete_payment_orders!inner(concept,reference,athlete:athletes(full_name))',
          )
          .eq('status', 'aprobado')
          .gte('confirmed_at', from)
          .lte('confirmed_at', `${to}T23:59:59Z`),
        client()
          .from('ticket_payments')
          .select(
            'id,amount,currency,confirmed_at,order_id,ticket_orders!inner(reference,buyer_name)',
          )
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

      const athleteIncome = (athletePayments.data ?? []).map((x) => {
        const order = x.athlete_payment_orders
        const party = cleanText(order?.athlete?.full_name)
        const category = athleteIncomeCategory(order?.concept)
        return {
          id: `income-${x.id}`,
          kind: 'income',
          occurredOn: x.confirmed_at,
          category,
          conceptKey: athleteConceptKey(order?.concept),
          description: incomeDescription(category, party),
          amount: x.amount,
          currency: x.currency,
          reference: order?.reference ?? null,
          party,
        }
      })

      const ticketIncome = (ticketPayments.data ?? []).map((x) => {
        const order = x.ticket_orders
        const party = cleanText(order?.buyer_name)
        const category = 'Entrada'
        return {
          id: `income-${x.id}`,
          kind: 'income',
          occurredOn: x.confirmed_at,
          category,
          conceptKey: 'ticket',
          description: incomeDescription(category, party),
          amount: x.amount,
          currency: x.currency,
          reference: order?.reference ?? null,
          party,
        }
      })

      const outgoings = (expenses.data ?? []).map((x) => ({
        id: x.id,
        kind: 'expense',
        occurredOn: x.occurred_on,
        category: x.category,
        conceptKey: 'expense',
        description: x.description,
        amount: x.amount,
        currency: x.currency,
        eventId: x.event_id,
        receiptPath: x.receipt_path,
        party: null,
        reference: null,
      }))

      const rows = [...athleteIncome, ...ticketIncome, ...outgoings]
        .filter(
          (x) =>
            !term ||
            `${x.category} ${x.description} ${x.reference ?? ''} ${x.party ?? ''}`
              .toLowerCase()
              .includes(term),
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
  router.patch('/expenses/:id', ...write, staffLimiter, async (req, res, next) => {
    try {
      const id = expenseIdSchema.safeParse(req.params.id)
      if (!id.success) throw new HttpError(400, 'Identificador de egreso inválido.')
      const parsed = expenseSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError(400, 'Datos de egreso inválidos.')
      const { data, error } = await client().rpc('update_financial_expense', {
        p_id: id.data,
        p_occurred_on: parsed.data.occurredOn,
        p_category: parsed.data.category,
        p_description: parsed.data.description,
        p_amount: parsed.data.amount,
        p_event_id: parsed.data.eventId ?? null,
        p_receipt_path: parsed.data.receiptPath ?? null,
        p_actor_id: req.auth.user.id,
      })
      if (error) throw rpcHttpError(error)
      res.json({ expense: data })
    } catch (e) {
      next(e)
    }
  })
  router.delete('/expenses/:id', ...write, staffLimiter, async (req, res, next) => {
    try {
      const id = expenseIdSchema.safeParse(req.params.id)
      if (!id.success) throw new HttpError(400, 'Identificador de egreso inválido.')
      const { error } = await client().rpc('delete_financial_expense', {
        p_id: id.data,
        p_actor_id: req.auth.user.id,
      })
      if (error) throw rpcHttpError(error)
      res.status(204).end()
    } catch (e) {
      next(e)
    }
  })
  return router
}
