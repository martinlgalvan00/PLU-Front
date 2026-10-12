import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../lib/errors.js'
import { requirePermission } from '../middleware/auth.js'
import { staffLimiter } from '../middleware/rateLimit.js'

const entrySchema = z.object({
  occurredOn: z.string().date(),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(500),
  amount: z.coerce.number().int().positive().max(100000000),
  eventId: z.string().uuid().nullable().optional(),
  receiptPath: z.string().trim().max(500).optional(),
})
const entryIdSchema = z.string().uuid()

/** Tope de la carga por lote (pegado desde una planilla). */
const BULK_MAX_ENTRIES = 200
const bulkSchema = z.object({
  entries: z
    .array(entrySchema.extend({ kind: z.enum(['income', 'expense']) }))
    .min(1)
    .max(BULK_MAX_ENTRIES),
})

/**
 * Asientos manuales del libro. Egresos e ingresos comparten contrato y camino
 * auditado (RPC `security definer` + `domain_audit_logs`). Un ingreso manual es
 * dinero sin orden de pago —sponsor, donación, mostrador—: los cobros de
 * atletas y de entradas siguen entrando solo por su ledger de pagos.
 */
const ENTRY_KINDS = {
  expenses: { table: 'financial_expenses', rpc: 'financial_expense', kind: 'expense', label: 'egreso' },
  incomes: { table: 'financial_incomes', rpc: 'financial_income', kind: 'income', label: 'ingreso' },
}

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
function rpcHttpError(error, entry) {
  const article = entry.kind === 'expense' ? 'El egreso' : 'El ingreso'
  if (error?.message?.includes('PLU02')) return new HttpError(404, `${article} no existe.`)
  return new Error(error?.message ?? `Error al operar el ${entry.label}.`)
}

/**
 * Tabla o función de ingresos manuales ausente (migración
 * `20261201100000_financial_incomes` sin aplicar). El libro sigue sirviendo
 * cobros y egresos; cargar un ingreso responde un 424 que dice qué falta.
 */
function isMissingSchema(error) {
  return ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error?.code)
}

// 424 y no 5xx: el `errorHandler` global reemplaza el mensaje de cualquier 5xx
// por "Error interno", y acá el texto es justamente lo que el operador necesita.
function missingSchemaError() {
  return new HttpError(
    424,
    'Los ingresos manuales todavía no están habilitados: falta aplicar la migración financial_incomes.',
  )
}

/** Fila del libro para un asiento manual (egreso o ingreso cargado a mano). */
function manualRow(entry, x) {
  return {
    id: x.id,
    kind: entry.kind,
    manual: true,
    occurredOn: x.occurred_on,
    category: x.category,
    conceptKey: entry.kind === 'expense' ? 'expense' : 'manual_income',
    description: x.description,
    amount: x.amount,
    currency: x.currency,
    eventId: x.event_id,
    receiptPath: x.receipt_path,
    party: null,
    reference: null,
  }
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
      const manualColumns =
        'id,occurred_on,category,description,amount,currency,event_id,receipt_path,created_at'
      const [expenses, manualIncomes, athletePayments, ticketPayments] = await Promise.all([
        client()
          .from(ENTRY_KINDS.expenses.table)
          .select(manualColumns)
          .gte('occurred_on', from)
          .lte('occurred_on', to)
          .order('occurred_on', { ascending: false }),
        client()
          .from(ENTRY_KINDS.incomes.table)
          .select(manualColumns)
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
      const incomesMissing = isMissingSchema(manualIncomes.error)
      if (incomesMissing) console.warn('[finance] financial_incomes no existe: libro sin ingresos manuales.')
      if (
        expenses.error ||
        (manualIncomes.error && !incomesMissing) ||
        athletePayments.error ||
        ticketPayments.error
      )
        throw new Error(
          expenses.error?.message ||
            manualIncomes.error?.message ||
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

      const outgoings = (expenses.data ?? []).map((x) => manualRow(ENTRY_KINDS.expenses, x))
      const manualIncome = (manualIncomes.data ?? []).map((x) => manualRow(ENTRY_KINDS.incomes, x))

      const rows = [...athleteIncome, ...ticketIncome, ...manualIncome, ...outgoings]
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

  /**
   * Carga por lote (pegado desde Excel). Se valida TODO el lote antes de
   * escribir, así una fila mala no deja la mitad cargada por un error de
   * formato. Cada fila pasa por la misma RPC auditada que el alta individual;
   * si la base falla a mitad de camino, el mensaje dice cuántas quedaron.
   */
  router.post('/entries/bulk', ...write, staffLimiter, async (req, res, next) => {
    try {
      const parsed = bulkSchema.safeParse(req.body)
      if (!parsed.success) throw new HttpError(400, 'Datos de movimientos inválidos.')
      const entries = parsed.data.entries
      let created = 0
      for (const { kind, ...data } of entries) {
        const entry = kind === 'income' ? ENTRY_KINDS.incomes : ENTRY_KINDS.expenses
        const { error } = await client().rpc(`create_${entry.rpc}`, {
          p_occurred_on: data.occurredOn,
          p_category: data.category,
          p_description: data.description,
          p_amount: data.amount,
          p_event_id: data.eventId ?? null,
          p_receipt_path: data.receiptPath ?? null,
          p_actor_id: req.auth.user.id,
        })
        if (error) {
          if (isMissingSchema(error)) throw missingSchemaError()
          console.error('[finance] carga por lote interrumpida:', error.message)
          throw new HttpError(
            424,
            `Se cargaron ${created} de ${entries.length} movimientos. Revisá el libro y reintentá con el resto.`,
          )
        }
        created += 1
      }
      res.status(201).json({ created })
    } catch (e) {
      next(e)
    }
  })

  for (const [path, entry] of Object.entries(ENTRY_KINDS)) {
    const invalid = `Datos de ${entry.label} inválidos.`
    const rpcArgs = (data, actorId) => ({
      p_occurred_on: data.occurredOn,
      p_category: data.category,
      p_description: data.description,
      p_amount: data.amount,
      p_event_id: data.eventId ?? null,
      p_receipt_path: data.receiptPath ?? null,
      p_actor_id: actorId,
    })

    router.post(`/${path}`, ...write, staffLimiter, async (req, res, next) => {
      try {
        const parsed = entrySchema.safeParse(req.body)
        if (!parsed.success) throw new HttpError(400, invalid)
        const { data, error } = await client().rpc(
          `create_${entry.rpc}`,
          rpcArgs(parsed.data, req.auth.user.id),
        )
        if (error) throw isMissingSchema(error) ? missingSchemaError() : new Error(error.message)
        res.status(201).json({ [entry.kind]: data })
      } catch (e) {
        next(e)
      }
    })
    router.patch(`/${path}/:id`, ...write, staffLimiter, async (req, res, next) => {
      try {
        const id = entryIdSchema.safeParse(req.params.id)
        if (!id.success) throw new HttpError(400, `Identificador de ${entry.label} inválido.`)
        const parsed = entrySchema.safeParse(req.body)
        if (!parsed.success) throw new HttpError(400, invalid)
        const { data, error } = await client().rpc(`update_${entry.rpc}`, {
          p_id: id.data,
          ...rpcArgs(parsed.data, req.auth.user.id),
        })
        if (error) throw isMissingSchema(error) ? missingSchemaError() : rpcHttpError(error, entry)
        res.json({ [entry.kind]: data })
      } catch (e) {
        next(e)
      }
    })
    router.delete(`/${path}/:id`, ...write, staffLimiter, async (req, res, next) => {
      try {
        const id = entryIdSchema.safeParse(req.params.id)
        if (!id.success) throw new HttpError(400, `Identificador de ${entry.label} inválido.`)
        const { error } = await client().rpc(`delete_${entry.rpc}`, {
          p_id: id.data,
          p_actor_id: req.auth.user.id,
        })
        if (error) throw isMissingSchema(error) ? missingSchemaError() : rpcHttpError(error, entry)
        res.status(204).end()
      } catch (e) {
        next(e)
      }
    })
  }
  return router
}
