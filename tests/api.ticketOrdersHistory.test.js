import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { buildStaffUser, createPrismaDouble, loginStaff } from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Contrato de `GET /api/tickets/orders`: el historial completo de ventas,
 * a diferencia de `/orders/pending-manual` que sólo trae transferencias por
 * validar. Lo que fija este test no es el matching en la base (eso vive en
 * `supabaseTicketRepository`) sino que vive bajo `admin.payments.read`, que
 * los filtros de query llegan tal cual al repositorio y que los contadores
 * sólo se piden con `withCounts=true`.
 */

function createTicketRepositoryDouble() {
  const listOrders = vi.fn(async () => [
    {
      order: { id: 'order-1', status: 'aprobado', reference: 'TORD-1' },
      event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
      ticketCount: 1,
      attendees: [{ name: 'Camila Rearte', dni: '30111222' }],
    },
  ])
  const orderCounts = vi.fn(async () => ({
    pending: 2,
    aprobado: 10,
    rechazado: 1,
    cancelado: 0,
    all: 13,
    openAmount: 50000,
    openAmountTruncated: false,
  }))
  return { repository: { listOrders, orderCounts }, listOrders, orderCounts }
}

async function setup({ role = 'admin_maximal' } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@ticket-orders-history.test` })
  const prisma = createPrismaDouble([staff])
  const tickets = createTicketRepositoryDouble()
  const target = listen(createApp({ prisma, ticketRepository: tickets.repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, tickets }
}

describe('GET /api/tickets/orders', () => {
  it('traduce los filtros de la query al repositorio y omite los contadores por defecto', async () => {
    const { target, cookie, tickets } = await setup()

    try {
      const response = await fetch(
        `${target.url}/api/tickets/orders?statuses=aprobado,rechazado&channel=bank_transfer&sort=aging&limit=50`,
        { headers: { Cookie: cookie } },
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.orders).toHaveLength(1)
      expect(body.counts).toBeUndefined()
      expect(tickets.listOrders).toHaveBeenCalledWith({
        statuses: ['aprobado', 'rechazado'],
        channel: 'bank_transfer',
        sort: 'aging',
        limit: 50,
      })
      expect(tickets.orderCounts).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('trae los contadores cuando se piden con withCounts', async () => {
    const { target, cookie, tickets } = await setup()

    try {
      const response = await fetch(`${target.url}/api/tickets/orders?withCounts=true`, {
        headers: { Cookie: cookie },
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.counts).toMatchObject({ pending: 2, aprobado: 10, all: 13 })
      expect(tickets.orderCounts).toHaveBeenCalledTimes(1)
    } finally {
      await target.close()
    }
  })

  it('rechaza un estado que no existe en el enum', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/tickets/orders?statuses=no-existe`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('bloquea a un rol sin admin.payments.read', async () => {
    const { target, cookie } = await setup({ role: 'seguridad_plu_arg' })

    try {
      const response = await fetch(`${target.url}/api/tickets/orders`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(403)
    } finally {
      await target.close()
    }
  })

  it('rechaza (401) sin sesión de staff', async () => {
    const { target } = await setup()

    try {
      const response = await fetch(`${target.url}/api/tickets/orders`)
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
