import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Módulo «Extras de entradas» en POST /api/tickets/orders, sin Supabase.
 * El checkout saca los extras incluidos del tipo; un id que llega en
 * `addonIds` es un extra comprado y se rechaza si el módulo está apagado.
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
        addonIds: ['chori'],
      },
    ],
    buyer: { name: 'Camila Rearte', email: 'camila@example.com' },
    provider: 'mercado_pago',
  }
}

async function postOrder(modules) {
  const createOrder = vi.fn(async () => ({
    order: { id: 'ord-1', status: 'pendiente' },
    tickets: [],
  }))
  const app = createApp({
    supabaseAdmin: {},
    ticketRepository: { createOrder },
    athleteRepository: {
      findEventPricing: async () => ({
        slug: 'pitbull-classic-2026',
        rules: { modules },
      }),
    },
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PAID_CHECKOUT_ENABLED: 'true',
      TICKET_SALES_ENABLED: 'true',
    },
  })
  const server = listen(app)
  try {
    const response = await fetch(`${server.url}/api/tickets/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify(orderBody()),
    })
    return { response, body: await response.json(), createOrder }
  } finally {
    await server.close()
  }
}

describe('POST /api/tickets/orders extras de entradas', () => {
  it('rechaza addonIds cuando el módulo está apagado', async () => {
    const { response, body, createOrder } = await postOrder({ ticketAddons: false })
    expect(response.status).toBe(409)
    expect(body.code).toBe('EVENT_MODULE_DISABLED')
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('con el módulo prendido no responde EVENT_MODULE_DISABLED', async () => {
    const { response, body, createOrder } = await postOrder({})
    expect(body.code).not.toBe('EVENT_MODULE_DISABLED')
    expect(response.status).toBe(201)
    expect(createOrder).toHaveBeenCalledTimes(1)
  })
})
