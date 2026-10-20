import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { summarizeEventPayments } from '../server/modules/events/eventPaymentsSummary.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Cobros de un organizador: ve y acredita lo de SU evento, nada más.
 *
 * Las rutas de aprobar/rechazar/comprobante actúan por id de orden, sin saber de qué
 * evento es: acá se prueba que verifiquen el evento antes de actuar.
 */
const A = { id: '11111111-1111-4111-8111-111111111111', slug: 'torneo-a-2026' }
const B = { id: '22222222-2222-4222-8222-222222222222', slug: 'torneo-b-2026' }

const T_A = '33333333-3333-4333-8333-333333333331' // entrada del evento A
const T_B = '33333333-3333-4333-8333-333333333332' // entrada del evento B
const R_A = '44444444-4444-4444-8444-444444444441' // inscripción del evento A
const R_B = '44444444-4444-4444-8444-444444444442' // inscripción del evento B
const COMBO_A = '44444444-4444-4444-8444-444444444443' // combo (incluye afiliación) en A
const MEMBERSHIP = '44444444-4444-4444-8444-444444444444' // afiliación suelta, sin evento

function createSupabase() {
  const tables = {
    events: [
      { id: A.id, slug: A.slug, title: 'Torneo A' },
      { id: B.id, slug: B.slug, title: 'Torneo B' },
    ],
    ticket_orders: [
      { id: T_A, event_id: A.id, amount: 20000, currency: 'ARS', status: 'aprobado' },
      { id: T_A.replace(/1$/, '3'), event_id: A.id, amount: 20000, currency: 'ARS', status: 'pendiente' },
      { id: T_B, event_id: B.id, amount: 99999, currency: 'ARS', status: 'aprobado' },
    ],
    event_registrations: [
      { payment_order_id: R_A, event_id: A.id },
      { payment_order_id: COMBO_A, event_id: A.id },
      { payment_order_id: R_B, event_id: B.id },
    ],
    athlete_payment_orders: [
      { id: R_A, organization_id: '00000000-0000-4000-8000-000000000001', concept: 'registration', amount: 50000, currency: 'ARS', status: 'validacion_manual' },
      { id: R_B, organization_id: '00000000-0000-4000-8000-000000000001', concept: 'registration', amount: 70000, currency: 'ARS', status: 'aprobado' },
      { id: COMBO_A, organization_id: '00000000-0000-4000-8000-000000000001', concept: 'combo', amount: 90000, currency: 'ARS', status: 'validacion_manual' },
      { id: MEMBERSHIP, organization_id: '00000000-0000-4000-8000-000000000001', concept: 'membership', amount: 30000, currency: 'ARS', status: 'validacion_manual' },
    ],
  }
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const from = vi.fn((name) => {
    let rows = [...(tables[name] ?? [])]
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (column, value) => ((rows = rows.filter((row) => String(row[column]) === String(value))), query),
      in: (column, values) => ((rows = rows.filter((row) => values.includes(row[column]))), query),
      not: (column, _op, value) => ((rows = rows.filter((row) => row[column] !== value)), query),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return query
  })
  return {
    client: { from, rpc, storage: { from: () => ({}) } },
    rpc,
    from,
  }
}

async function setup({ role = 'organizer' } = {}) {
  const user =
    role === 'organizer'
      ? await buildStaffUser({
          email: 'org-cobros@plu.test',
          eventAccess: [{ eventId: A.id, eventSlug: A.slug }],
        })
      : await buildStaffUser({ email: 'admin-cobros@plu.test' })
  const supabase = createSupabase()
  const target = listen(
    createApp({ prisma: createPrismaDouble([user]), supabaseAdmin: supabase.client }),
  )
  const { cookie } = await loginStaff(target.url, { email: user.email })
  supabase.rpc.mockClear()
  return { target, cookie, supabase }
}

async function call(ctx, method, path, body) {
  const response = await fetch(`${ctx.target.url}${path}`, {
    method,
    headers: authHeaders(ctx.cookie),
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    // sin cuerpo JSON
  }
  return { status: response.status, body: json }
}

const blockedByScope = (result) =>
  result.status === 403 &&
  ['event_not_assigned', 'event_scope_forbidden_change'].includes(result.body?.code)

describe('organizador: órdenes de entradas', () => {
  it('aprobar, rechazar y ver el comprobante de una orden de OTRO evento da 403 y no actúa', async () => {
    const ctx = await setup()
    try {
      for (const [method, path, body] of [
        ['POST', `/api/tickets/orders/${T_B}/approve`, undefined],
        ['POST', `/api/tickets/orders/${T_B}/reject`, { reason: 'comprobante ilegible' }],
        ['GET', `/api/tickets/orders/${T_B}/proof-url`, undefined],
        ['GET', `/api/tickets/orders/${T_B}/proof`, undefined],
      ]) {
        const result = await call(ctx, method, path, body)
        expect(blockedByScope(result), `${method} ${path} → ${result.status}`).toBe(true)
        expect(result.body.code).toBe('event_not_assigned')
      }
      expect(ctx.supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await ctx.target.close()
    }
  })

  it('en una orden de SU evento pasa el control de alcance (llega a la lógica de la ruta)', async () => {
    const ctx = await setup()
    try {
      const approve = await call(ctx, 'POST', `/api/tickets/orders/${T_A}/approve`)
      const reject = await call(ctx, 'POST', `/api/tickets/orders/${T_A}/reject`, {
        reason: 'comprobante ilegible',
      })
      expect(blockedByScope(approve)).toBe(false)
      expect(blockedByScope(reject)).toBe(false)
      expect(approve.body?.code).not.toBe('event_scope_denied')
    } finally {
      await ctx.target.close()
    }
  })

  it('una orden que no existe es 404, no una pista de que existe en otro evento', async () => {
    const ctx = await setup()
    try {
      const result = await call(
        ctx,
        'POST',
        '/api/tickets/orders/99999999-9999-4999-8999-999999999999/approve',
      )
      expect(result.status).toBe(404)
    } finally {
      await ctx.target.close()
    }
  })
})

describe('organizador: órdenes de inscripción', () => {
  it('solo acredita inscripciones de su evento', async () => {
    const ctx = await setup()
    try {
      const ajena = await call(ctx, 'POST', `/api/athletes/admin/payment-orders/${R_B}/approve`, {})
      expect(ajena.status).toBe(403)
      expect(ajena.body.code).toBe('event_not_assigned')

      const propia = await call(ctx, 'POST', `/api/athletes/admin/payment-orders/${R_A}/approve`, {})
      expect(blockedByScope(propia)).toBe(false)
    } finally {
      await ctx.target.close()
    }
  })

  it('un combo (incluye la afiliación) y una afiliación suelta quedan fuera de su alcance', async () => {
    const ctx = await setup()
    try {
      const combo = await call(ctx, 'POST', `/api/athletes/admin/payment-orders/${COMBO_A}/approve`, {})
      expect(combo.status).toBe(403)
      expect(combo.body.code).toBe('event_scope_forbidden_change')

      const afiliacion = await call(
        ctx,
        'POST',
        `/api/athletes/admin/payment-orders/${MEMBERSHIP}/approve`,
        {},
      )
      expect(afiliacion.status).toBe(403)
      expect(afiliacion.body.code).toBe('event_not_assigned')
      expect(ctx.supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await ctx.target.close()
    }
  })

  it('rechazar y ver el comprobante de una inscripción ajena también se corta', async () => {
    const ctx = await setup()
    try {
      const rechazar = await call(ctx, 'POST', `/api/athletes/admin/payment-orders/${R_B}/reject`, {
        reason: 'no coincide el monto',
      })
      expect(rechazar.body?.code).toBe('event_not_assigned')
      const proofUrl = await call(ctx, 'GET', `/api/athletes/admin/payment-orders/${R_B}/proof-url`)
      expect(proofUrl.body?.code).toBe('event_not_assigned')
      const proof = await call(ctx, 'GET', `/api/athletes/admin/payment-orders/${R_B}/proof`)
      expect(proof.body?.code).toBe('event_not_assigned')
    } finally {
      await ctx.target.close()
    }
  })

  it('el Super Admin no paga el costo del control: no consulta el evento de la orden', async () => {
    const ctx = await setup({ role: 'admin' })
    try {
      await call(ctx, 'POST', `/api/athletes/admin/payment-orders/${R_B}/approve`, {})
      const tablesRead = ctx.supabase.from.mock.calls.map(([name]) => name)
      expect(tablesRead).not.toContain('event_registrations')
    } finally {
      await ctx.target.close()
    }
  })
})

describe('GET /api/events/:eventSlug/payments', () => {
  it('trae solo las órdenes del evento asignado, con su resumen', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'GET', `/api/events/${A.slug}/payments`)
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      expect(result.body.event).toMatchObject({ id: A.id, slug: A.slug })

      expect(result.body.ticketOrders.map((row) => row.order.event_id)).toEqual([A.id, A.id])
      // Inscripciones: la propia; el combo y lo de otros eventos quedan afuera.
      expect(result.body.registrationOrders.map((order) => order.id)).toEqual([R_A])
      expect(JSON.stringify(result.body)).not.toContain('99999')
      expect(result.body.summary.tickets.approved).toEqual({ count: 1, amounts: { ARS: 20000 } })
      expect(result.body.summary.tickets.pending.count).toBe(1)
    } finally {
      await ctx.target.close()
    }
  })

  it('el evento de otro organizador da 403', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'GET', `/api/events/${B.slug}/payments`)
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('event_not_assigned')
    } finally {
      await ctx.target.close()
    }
  })

  it('el Super Admin puede ver los cobros de cualquier evento', async () => {
    const ctx = await setup({ role: 'admin' })
    try {
      const result = await call(ctx, 'GET', `/api/events/${B.slug}/payments`)
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      expect(result.body.event.slug).toBe(B.slug)
    } finally {
      await ctx.target.close()
    }
  })
})

describe('summarizeEventPayments', () => {
  it('agrupa por estado y por moneda, sin sumar USD con pesos', () => {
    const summary = summarizeEventPayments({
      ticketOrders: [
        { order: { status: 'aprobado', amount: 100, currency: 'ARS' } },
        { order: { status: 'aprobado', amount: 20, currency: 'USD' } },
        { order: { status: 'creado', amount: 50, currency: 'ARS' } },
        { order: { status: 'rechazado', amount: 70, currency: 'ARS' } },
      ],
      registrationOrders: [
        { status: 'validacion_manual', amount: 300, currency: 'ARS' },
        { status: 'aprobado', amount: 400, currency: 'ARS' },
      ],
    })

    expect(summary.tickets.approved).toEqual({ count: 2, amounts: { ARS: 100, USD: 20 } })
    expect(summary.tickets.pending).toEqual({ count: 1, amounts: { ARS: 50 } })
    expect(summary.tickets.rejected.count).toBe(1)
    expect(summary.registrations.pending).toEqual({ count: 1, amounts: { ARS: 300 } })
    expect(summary.registrations.approved.amounts.ARS).toBe(400)
  })

  it('sin órdenes devuelve todo en cero', () => {
    const summary = summarizeEventPayments()
    expect(summary.tickets.approved).toEqual({ count: 0, amounts: {} })
    expect(summary.registrations.pending.count).toBe(0)
  })
})
