import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * KPIs de ventas de entradas para el tab "Análisis" de Pagos: cuántas se
 * vendieron, recaudado por canal/moneda, cupo restante y tendencia diaria.
 * Sólo lectura, mismo guard (`admin.payments.read`) que el resto de las
 * lecturas de Finanzas.
 */

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const EVENT_SLUG = 'pitbull-classic-2026'

const CAPACITY = {
  byType: [{ ticketTypeId: 'tt-1', name: 'General', quota: 100, sold: 40, reserved: 45, pending: 5 }],
  totals: { sold: 40, reserved: 45, pending: 5, eventLimit: 100, remaining: 55 },
}
const REVENUE = {
  byCurrency: [{ currency: 'ARS', amount: 400000, orders: 40 }],
  byChannel: [{ key: 'mercado_pago', currency: 'ARS', amount: 400000, orders: 40 }],
}
const DAILY = [{ date: '2026-03-01', count: 5 }]

async function withApp(run, { role = 'admin_maximal', repoOverrides = {} } = {}) {
  const resolveEventIdBySlug = vi.fn().mockResolvedValue(EVENT_ID)
  const capacitySummary = vi.fn().mockResolvedValue(CAPACITY)
  const revenueSummary = vi.fn().mockResolvedValue(REVENUE)
  const dailyTicketsSold = vi.fn().mockResolvedValue(DAILY)
  const staff = await buildStaffUser({ role, email: 'analisis@plu.test' })

  const app = createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: null,
    ticketRepository: {
      resolveEventIdBySlug,
      capacitySummary,
      revenueSummary,
      dailyTicketsSold,
      ...repoOverrides,
    },
    athleteRepository: {
      findEventSummary: async () => ({ id: EVENT_ID, slug: EVENT_SLUG, title: 'Pitbull Classic 2026' }),
    },
    platformSettingsRepository: { get: async () => ({}) },
    env: { ...process.env, NODE_ENV: 'test' },
  })

  const server = listen(app)
  try {
    const { cookie } = await loginStaff(server.url, { email: 'analisis@plu.test' })
    const get = (query = '') =>
      fetch(`${server.url}/api/tickets/sales-summary/${EVENT_SLUG}${query}`, {
        headers: authHeaders(cookie),
      })
    await run({ get, resolveEventIdBySlug, capacitySummary, revenueSummary, dailyTicketsSold })
  } finally {
    await server.close()
  }
}

describe('GET /api/tickets/sales-summary/:eventSlug', () => {
  it('devuelve capacidad, recaudado y tendencia del evento', async () => {
    await withApp(async ({ get }) => {
      const response = await get()
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.event).toEqual({ slug: EVENT_SLUG, title: 'Pitbull Classic 2026' })
      expect(body.capacity).toEqual(CAPACITY)
      expect(body.revenue).toEqual(REVENUE)
      expect(body.daily).toEqual(DAILY)
      expect(body.rangeDays).toBe(30)
    })
  })

  it('pasa el mismo rango de fechas a las tres consultas', async () => {
    await withApp(async ({ get, capacitySummary, revenueSummary, dailyTicketsSold }) => {
      await get('?days=7')
      expect(capacitySummary).toHaveBeenCalledWith(EVENT_ID)
      const [, revenueRange] = revenueSummary.mock.calls[0]
      const [, dailyRange] = dailyTicketsSold.mock.calls[0]
      expect(revenueRange).toEqual(dailyRange)
      expect(new Date(revenueRange.toISO) - new Date(revenueRange.fromISO)).toBe(7 * 86_400_000)
    })
  })

  it('clampea days fuera de [1, 90]', async () => {
    await withApp(async ({ get, revenueSummary }) => {
      await get('?days=999')
      const [, range] = revenueSummary.mock.calls[0]
      expect(new Date(range.toISO) - new Date(range.fromISO)).toBe(90 * 86_400_000)
    })
  })

  it('evento inexistente responde 404 y no llama a las agregaciones', async () => {
    await withApp(
      async ({ get, capacitySummary }) => {
        const response = await get()
        expect(response.status).toBe(404)
        expect(capacitySummary).not.toHaveBeenCalled()
      },
      { repoOverrides: { resolveEventIdBySlug: vi.fn().mockResolvedValue(null) } },
    )
  })

  it('sin admin.payments.read responde 403', async () => {
    await withApp(
      async ({ get, capacitySummary }) => {
        const response = await get()
        expect(response.status).toBe(403)
        expect(capacitySummary).not.toHaveBeenCalled()
      },
      { role: 'seguridad_plu_arg' },
    )
  })
})
