import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Cotización en USD de una orden por Wise, desde la ruta.
 *
 * Además del monto, se protege el costo: este cálculo está en el camino
 * crítico de la compra y llegó a hacer tres viajes secuenciales a la base —
 * uno de ellos, una RPC que sólo leía una clave de un JSON que el servidor ya
 * tenía en la mano. Las aserciones sobre qué se consultó no son decorativas:
 * son la única forma de que el próximo cambio no reintroduzca los viajes.
 */

const EVENT_ID = 'a1111111-1111-4111-8111-111111111111'
const TYPE_ID = 'b2222222-2222-4222-8222-222222222222'

function supabaseDouble({ rules, ticketTypes }) {
  const calls = { tables: [], rpcs: [] }

  const client = {
    rpc: (name, args) => {
      calls.rpcs.push(name)
      return Promise.resolve({ data: args?.p_rules?.ticketAddons ?? [], error: null })
    },
    from(table) {
      calls.tables.push(table)
      const builder = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        maybeSingle: async () => ({ data: { id: EVENT_ID, rules }, error: null }),
        // `ticket_types` se resuelve sin `maybeSingle`: el await cae sobre el
        // propio builder, igual que con el cliente real de Supabase.
        then: (resolve) => resolve({ data: ticketTypes, error: null }),
      }
      return builder
    },
  }

  return { client, calls }
}

async function createWiseOrder({ rules, ticketTypes, attendees }) {
  const { client, calls } = supabaseDouble({ rules, ticketTypes })
  const createOrder = vi.fn(async (data) => ({
    order: { id: 'ord-1', amount: data.wiseAmount, currency: data.wiseCurrency },
    tickets: [],
  }))

  const app = createApp({
    supabaseAdmin: client,
    ticketRepository: { createOrder },
    athleteRepository: {
      // El perfil de cobro ya trae el id del evento: la cotización tiene que
      // reusarlo en vez de volver a resolver el slug.
      findEventPricing: async () => ({ id: EVENT_ID, slug: 'pitbull-classic-2026' }),
    },
    platformSettingsRepository: {
      // Wise nace cerrado en la matriz por omisión: sin abrirlo explícitamente
      // la ruta corta con 409 antes de cotizar nada.
      get: async () => ({
        paymentChannels: {
          ticket: {
            mercado_pago: true,
            bank_transfer: true,
            cash_pitbull: true,
            wise_transfer: true,
          },
        },
      }),
    },
    env: { ...process.env, NODE_ENV: 'test', PAID_CHECKOUT_ENABLED: 'true' },
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
      body: JSON.stringify({
        eventSlug: 'pitbull-classic-2026',
        attendees,
        buyer: { name: 'Camila Rearte', email: 'camila@example.com' },
        provider: 'manual',
        manualPaymentChannel: 'wise_transfer',
      }),
    })
    return { response, body: await response.json(), calls, createOrder }
  } finally {
    await server.close()
  }
}

const RULES_CON_USD = {
  ticketAddons: [{ id: 'chori', label: 'Choripán', price: 5000, wisePrice: 4, enabled: true }],
}
const RULES_SIN_USD = {
  ticketAddons: [{ id: 'chori', label: 'Choripán', price: 5000, enabled: true }],
}
const TIPOS = [{ id: TYPE_ID, name: 'Pase completo', price: 20000, wise_price: 40 }]

describe('POST /api/tickets/orders — cotización Wise', () => {
  it('cobra la suma de los precios en USD cargados en el panel', async () => {
    const { response, createOrder } = await createWiseOrder({
      rules: RULES_CON_USD,
      ticketTypes: TIPOS,
      attendees: [{ fullName: 'Camila Rearte', dni: '31222333', ticketTypeId: TYPE_ID, addonIds: ['chori'] }],
    })

    expect(response.status).toBe(201)
    expect(createOrder.mock.calls[0][0]).toMatchObject({ wiseAmount: 44, wiseCurrency: 'USD' })
  })

  it('un beneficio sin USD propio devuelve toda la orden a la conversión', async () => {
    const { createOrder } = await createWiseOrder({
      rules: RULES_SIN_USD,
      ticketTypes: TIPOS,
      attendees: [{ fullName: 'Camila Rearte', dni: '31222333', ticketTypeId: TYPE_ID, addonIds: ['chori'] }],
    })

    // 25.000 ARS al dólar por defecto (1550), redondeado hacia arriba en saltos
    // de 5: nunca una mezcla del 40 cargado con una conversión parcial.
    expect(createOrder.mock.calls[0][0].wiseAmount).toBe(20)
  })

  it('no vuelve a resolver el evento que el perfil de cobro ya trajo', async () => {
    const { calls } = await createWiseOrder({
      rules: RULES_CON_USD,
      ticketTypes: TIPOS,
      attendees: [{ fullName: 'Camila Rearte', dni: '31222333', ticketTypeId: TYPE_ID, addonIds: [] }],
    })

    // Una sola lectura de `events` (las reglas) y una de `ticket_types`.
    expect(calls.tables.filter((table) => table === 'events')).toHaveLength(1)
    expect(calls.tables.filter((table) => table === 'ticket_types')).toHaveLength(1)
  })

  it('lee los beneficios del JSON que ya tiene, sin gastar una RPC', async () => {
    const { calls } = await createWiseOrder({
      rules: RULES_CON_USD,
      ticketTypes: TIPOS,
      attendees: [{ fullName: 'Camila Rearte', dni: '31222333', ticketTypeId: TYPE_ID, addonIds: ['chori'] }],
    })

    expect(calls.rpcs).not.toContain('event_ticket_addons_catalog')
  })

  it('un beneficio deshabilitado no entra en el total', async () => {
    const { createOrder } = await createWiseOrder({
      rules: { ticketAddons: [{ id: 'chori', label: 'Choripán', price: 5000, wisePrice: 4, enabled: false }] },
      ticketTypes: TIPOS,
      attendees: [{ fullName: 'Camila Rearte', dni: '31222333', ticketTypeId: TYPE_ID, addonIds: ['chori'] }],
    })

    expect(createOrder.mock.calls[0][0].wiseAmount).toBe(40)
  })
})
