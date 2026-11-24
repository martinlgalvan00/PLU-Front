import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * El interruptor del evento (`rules.ticketsEnabled`) cierra y abre la venta
 * pública. El mostrador no pasa por este corte.
 */

const TYPE_ID = '33333333-3333-4333-8333-333333333333'

function orderBody() {
  return {
    eventSlug: 'pitbull-classic-2026',
    attendees: [
      {
        fullName: 'Camila Rearte',
        dni: '30111222',
        ticketTypeId: TYPE_ID,
      },
    ],
    buyer: { name: 'Camila Rearte', email: 'camila@example.com' },
    provider: 'mercado_pago',
  }
}

function appFor(ticketsEnabled) {
  const createOrder = vi.fn(async () => ({
    order: { id: 'ord-1', status: 'pendiente' },
    tickets: [],
  }))
  const app = createApp({
    supabaseAdmin: {},
    ticketRepository: {
      createOrder,
      availability: async () => ({ days: [] }),
    },
    platformSettingsRepository: { get: async () => ({}) },
    athleteRepository: {
      findEventPricing: async () => ({
        slug: 'pitbull-classic-2026',
        rules: { ticketsEnabled },
      }),
    },
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PAID_CHECKOUT_ENABLED: 'true',
      TICKET_SALES_ENABLED: 'true',
    },
  })
  return { app, createOrder }
}

const headers = {
  'Content-Type': 'application/json',
  Origin: 'http://localhost:5173',
  'X-PLU-Request': 'browser',
}

describe('interruptor de entradas del evento', () => {
  it('apagado rechaza la orden pública y cierra la disponibilidad', async () => {
    const { app, createOrder } = appFor(false)
    const server = listen(app)
    try {
      const order = await fetch(`${server.url}/api/tickets/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderBody()),
      })
      const orderBodyJson = await order.json()
      expect(order.status).toBe(409)
      expect(orderBodyJson.code).toBe('PLU03')
      expect(createOrder).not.toHaveBeenCalled()

      const availability = await fetch(
        `${server.url}/api/tickets/availability/pitbull-classic-2026`,
      )
      const availabilityBody = await availability.json()
      expect(availability.status).toBe(200)
      expect(availabilityBody.checkout.ticketEnabled).toBe(false)
      expect(availabilityBody.checkout.eventTicketsEnabled).toBe(false)
    } finally {
      await server.close()
    }
  })

  it('prendido deja pasar la orden y abre la disponibilidad', async () => {
    const { app, createOrder } = appFor(true)
    const server = listen(app)
    try {
      const order = await fetch(`${server.url}/api/tickets/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderBody()),
      })
      const orderBodyJson = await order.json()
      expect(orderBodyJson.code).not.toBe('PLU03')
      expect(order.status).toBe(201)
      expect(createOrder).toHaveBeenCalledTimes(1)

      const availability = await fetch(
        `${server.url}/api/tickets/availability/pitbull-classic-2026`,
      )
      const availabilityBody = await availability.json()
      expect(availability.status).toBe(200)
      expect(availabilityBody.checkout.ticketEnabled).toBe(true)
      expect(availabilityBody.checkout.eventTicketsEnabled).toBe(true)
    } finally {
      await server.close()
    }
  })
})
