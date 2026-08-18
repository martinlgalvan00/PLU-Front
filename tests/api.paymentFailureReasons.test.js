import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Contrato de `/api/payments/operations/failure-reasons`.
 *
 * El panel de Analítica lo usa para mostrar por qué se están cayendo los
 * cobros de afiliación e inscripción. Lo que hay que fijar acá no es el
 * conteo (eso lo cubre `supabasePaymentRepository` a nivel unitario) sino que
 * vive bajo el mismo permiso que el resto de operaciones de pago
 * (`admin.payments.read`) y que el rango de fechas llega tal cual al
 * repositorio.
 */

function createPaymentRepositoryDouble() {
  const getFailureReasonBreakdown = vi.fn(async () => [
    {
      code: 'AMOUNT_MISMATCH',
      title: 'El monto no coincide',
      severity: 'blocker',
      count: 3,
      sampleOrderId: 'order-1',
      lastSeenAt: '2026-08-13T00:00:00.000Z',
    },
    {
      code: 'CARD_DECLINED',
      title: 'Tarjeta rechazada por el banco',
      severity: 'expected',
      count: 1,
      sampleOrderId: 'order-2',
      lastSeenAt: '2026-08-12T00:00:00.000Z',
    },
  ])
  return { repository: { getFailureReasonBreakdown }, getFailureReasonBreakdown }
}

async function setup({ role = 'admin_maximal' } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@failure-reasons.test` })
  const prisma = createPrismaDouble([staff])
  const payments = createPaymentRepositoryDouble()
  const target = listen(createApp({ prisma, paymentRepository: payments.repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, payments }
}

describe('GET /api/payments/operations/failure-reasons', () => {
  it('devuelve el ranking de motivos con sesión de staff autorizada', async () => {
    const { target, cookie, payments } = await setup()

    try {
      const response = await fetch(
        `${target.url}/api/payments/operations/failure-reasons?from=2026-08-01T00:00:00.000Z&to=2026-08-14T00:00:00.000Z`,
        { headers: { Cookie: cookie } },
      )

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.reasons).toHaveLength(2)
      expect(body.reasons[0]).toMatchObject({ code: 'AMOUNT_MISMATCH', count: 3 })
      expect(payments.getFailureReasonBreakdown).toHaveBeenCalledWith({
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-14T00:00:00.000Z',
      })
    } finally {
      await target.close()
    }
  })

  it('bloquea a un rol sin admin.payments.read', async () => {
    const { target, cookie } = await setup({ role: 'seguridad_plu_arg' })

    try {
      const response = await fetch(`${target.url}/api/payments/operations/failure-reasons`, {
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
      const response = await fetch(`${target.url}/api/payments/operations/failure-reasons`)
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
