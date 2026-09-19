import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { buildStaffUser, createPrismaDouble, loginStaff } from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Contrato de `/api/payments/search`.
 *
 * Finanzas hoy tiene que saber de antemano si un cobro es de entradas o de
 * afiliación/inscripción para elegir la pantalla correcta. Lo que fija este
 * test no es el matching en la base (eso vive en `supabasePaymentRepository`)
 * sino que vive bajo `admin.payments.read`, que el término mínimo se exige, y
 * que las dos colas se mezclan y ordenan por fecha con el `concept`/`kind`
 * correcto para que el panel pueda etiquetar cada fila.
 */

function createPaymentRepositoryDouble() {
  const searchOrders = vi.fn(async () => ({
    athleteOrders: [
      {
        id: 'athlete-order-1',
        concept: 'membership',
        amount: 15000,
        currency: 'ARS',
        status: 'aprobado',
        reference: 'AFIL-1',
        created_at: '2026-08-10T00:00:00.000Z',
        athlete: { full_name: 'Ana Torres', document_id: '30111222', email: 'ana@example.com' },
      },
    ],
    ticketOrders: [
      {
        id: 'ticket-order-1',
        amount: 25000,
        currency: 'ARS',
        status: 'pendiente',
        reference: 'TORD-1',
        buyer_name: 'Ana Torres',
        buyer_email: 'ana@example.com',
        created_at: '2026-08-12T00:00:00.000Z',
        event: { title: 'Pitbull Classic 2026', slug: 'pitbull-classic-2026' },
      },
    ],
  }))
  return { repository: { searchOrders }, searchOrders }
}

async function setup({ role = 'admin_maximal' } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@payment-search.test` })
  const prisma = createPrismaDouble([staff])
  const payments = createPaymentRepositoryDouble()
  const target = listen(createApp({ prisma, paymentRepository: payments.repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, payments }
}

describe('GET /api/payments/search', () => {
  it('devuelve entradas y afiliación/inscripción mezcladas y ordenadas por fecha', async () => {
    const { target, cookie, payments } = await setup()

    try {
      const response = await fetch(`${target.url}/api/payments/search?q=ana`, {
        headers: { Cookie: cookie },
      })

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(payments.searchOrders).toHaveBeenCalledWith('ana', { limit: 15 })
      expect(body.results).toHaveLength(2)
      // Más reciente primero: la orden de entradas (12 ago) antes que la de
      // afiliación (10 ago), aunque el repo las haya devuelto en otro orden.
      expect(body.results[0]).toMatchObject({
        kind: 'ticket',
        concept: 'ticket',
        reference: 'TORD-1',
        personName: 'Ana Torres',
        eventTitle: 'Pitbull Classic 2026',
      })
      expect(body.results[1]).toMatchObject({
        kind: 'athlete',
        concept: 'membership',
        reference: 'AFIL-1',
        personName: 'Ana Torres',
        personDetail: '30111222',
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza un término de búsqueda demasiado corto', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/payments/search?q=a`, {
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
      const response = await fetch(`${target.url}/api/payments/search?q=ana`, {
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
      const response = await fetch(`${target.url}/api/payments/search?q=ana`)
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
