import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { createPrismaDouble } from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'
import { lookupTicketOrder } from '../src/services/ticketApi.js'

const realFetch = globalThis.fetch

/**
 * Recuperar una entrada de compra desde el link del mail de confirmación,
 * sin sesión: referencia + mail del comprador hacen de credencial (el
 * servidor nunca guarda el `orderAccessToken` original, sólo su hash).
 * Ver TicketOrderLookup.jsx / lookupTicketOrderAction en useAppData.js.
 */

function paidOrder(overrides = {}) {
  return {
    id: 'order-1',
    status: 'aprobado',
    reference: 'TORD-abc123',
    buyer_email: 'camila@example.com',
    event: { title: 'Pitbull Classic 2026', slug: 'pitbull-classic-2026' },
    ...overrides,
  }
}

function ticketRows() {
  return [
    {
      id: 't1',
      order_id: 'order-1',
      bundle_id: 'bundle-1',
      ticket_code: 'PLU-0001',
      qr_token: 'qr-token-1',
      attendee_name: 'Camila Rearte',
      status: 'pagada',
      credential_label: 'Entrada general',
      credential_scopes: ['gate_tickets'],
      is_primary_credential: true,
      addons: [{ id: 'addon-1', label: 'Remera' }],
      ticket_types: { name: 'General' },
    },
  ]
}

async function withApp(findOrderByReferenceAndEmail, run) {
  const staff = await import('./integration/helpers/staffSession.js').then((m) =>
    m.buildStaffUser({ email: 'finanzas@plu.test' }),
  )
  const app = createApp({
    prisma: createPrismaDouble([staff]),
    supabaseAdmin: null,
    ticketRepository: { findOrderByReferenceAndEmail },
    env: { ...process.env, NODE_ENV: 'test' },
  })
  const server = listen(app)
  try {
    await run(server)
  } finally {
    await server.close()
  }
}

describe('GET /api/tickets/orders/lookup', () => {
  it('devuelve las entradas de una orden pagada cuando referencia y mail coinciden', async () => {
    const find = vi.fn().mockResolvedValue({ order: paidOrder(), tickets: ticketRows() })
    await withApp(find, async (server) => {
      const response = await fetch(
        `${server.url}/api/tickets/orders/lookup?reference=TORD-abc123&email=camila@example.com`,
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.order).toMatchObject({
        reference: 'TORD-abc123',
        status: 'aprobado',
        eventTitle: 'Pitbull Classic 2026',
        eventSlug: 'pitbull-classic-2026',
      })
      expect(body.tickets).toHaveLength(1)
      // Snake_case a propósito: es lo que `toCamelTicket` (ticketApi.js)
      // espera para id/ticketCode/qrToken/orderId/attendeeName -- son los
      // campos sin fallback camelCase, así que un shape distinto acá pasaría
      // este test pero le llegaría un QR vacío al comprador.
      expect(body.tickets[0]).toMatchObject({
        qr_token: 'qr-token-1',
        ticket_code: 'PLU-0001',
        attendee_name: 'Camila Rearte',
        order_id: 'order-1',
      })
      expect(find).toHaveBeenCalledWith('TORD-abc123', 'camila@example.com')
    })
  })

  it('no expone entradas de una orden todavía no acreditada', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ order: paidOrder({ status: 'pendiente' }), tickets: ticketRows() })
    await withApp(find, async (server) => {
      const response = await fetch(
        `${server.url}/api/tickets/orders/lookup?reference=TORD-abc123&email=camila@example.com`,
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.order.status).toBe('pendiente')
      expect(body.tickets).toEqual([])
    })
  })

  it('responde 404 cuando no hay coincidencia de referencia + mail', async () => {
    const find = vi.fn().mockResolvedValue(null)
    await withApp(find, async (server) => {
      const response = await fetch(
        `${server.url}/api/tickets/orders/lookup?reference=TORD-nope&email=nadie@example.com`,
      )
      expect(response.status).toBe(404)
    })
  })

  it('rechaza un mail con formato inválido antes de tocar el repositorio', async () => {
    const find = vi.fn()
    await withApp(find, async (server) => {
      const response = await fetch(
        `${server.url}/api/tickets/orders/lookup?reference=TORD-abc123&email=no-es-un-mail`,
      )
      expect(response.status).toBe(400)
      expect(find).not.toHaveBeenCalled()
    })
  })

  describe('lookupTicketOrder (ticketApi.js, cliente real)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    /**
     * El shape que arma la ruta tiene que sobrevivir entero a
     * `toCamelTicket`/`mapApiTicket` -- id/ticketCode/qrToken/orderId/
     * attendeeName no tienen fallback camelCase ahí, así que un typo de
     * mayúsculas acá deja el QR vacío sin que el test de la ruta cruda lo
     * note (esa es literalmente la razón de este test).
     */
    it('el QR y el resto de los campos llegan completos después de mapApiTicket', async () => {
      const find = vi.fn().mockResolvedValue({ order: paidOrder(), tickets: ticketRows() })
      await withApp(find, async (server) => {
        vi.stubGlobal('fetch', (input, init) => {
          const url = typeof input === 'string' ? input : input.url
          const absolute = url.startsWith('http') ? url : `${server.url}${url}`
          return realFetch(absolute, init)
        })
        const { order, tickets } = await lookupTicketOrder('TORD-abc123', 'camila@example.com')
        expect(order).toMatchObject({ reference: 'TORD-abc123', status: 'aprobado' })
        expect(tickets).toHaveLength(1)
        expect(tickets[0]).toMatchObject({
          id: 't1',
          orderId: 'order-1',
          bundleId: 'bundle-1',
          ticketCode: 'PLU-0001',
          qrToken: 'qr-token-1',
          attendeeName: 'Camila Rearte',
          credentialLabel: 'Entrada general',
          ticketTypeName: 'General',
          addons: [{ id: 'addon-1', label: 'Remera' }],
        })
      })
    })
  })
})
