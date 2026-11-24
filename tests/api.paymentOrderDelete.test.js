import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { createSupabasePaymentRepository } from '../server/modules/payments/supabasePaymentRepository.js'
import { buildStaffUser, createPrismaDouble, loginStaff } from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Borrar una fila de Cobros (orden de afiliación / inscripción / combo).
 *
 * Solo se borra lo que no se cobró. Las guardas viven en la RPC
 * `staff_delete_athlete_payment_order` (supabase/migrations/20261228110000…);
 * acá se afirma el contrato HTTP: quién puede, qué recibe la RPC y que cada
 * motivo de rechazo llega al panel como un 409 que se puede explicar.
 */

const ORDER_ID = '44444444-4444-4444-8444-444444444444'

function createRepositoryDouble(result) {
  const deleteAthleteOrder = vi.fn(async () => result ?? { deleted: true, orderId: ORDER_ID })
  return { repository: { deleteAthleteOrder }, deleteAthleteOrder }
}

async function setup({ role = 'admin_maximal', result } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@order-delete.test` })
  const payments = createRepositoryDouble(result)
  const target = listen(
    createApp({ prisma: createPrismaDouble([staff]), paymentRepository: payments.repository }),
  )
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, payments, staff }
}

function remove(target, cookie, orderId = ORDER_ID, body = { reason: 'Orden de prueba duplicada' }) {
  return fetch(`${target.url}/api/payments/athlete-orders/${orderId}/delete`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-PLU-Request': 'browser',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/payments/athlete-orders/:orderId/delete', () => {
  it('borra con el actor y el motivo, y devuelve el resultado', async () => {
    const { target, cookie, payments, staff } = await setup()
    try {
      const response = await remove(target, cookie)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ deleted: true, orderId: ORDER_ID })
      expect(payments.deleteAthleteOrder).toHaveBeenCalledWith(
        ORDER_ID,
        expect.stringContaining(staff.email),
        'Orden de prueba duplicada',
      )
    } finally {
      await target.close()
    }
  })

  it('exige el motivo: sin él no llega al repositorio', async () => {
    const { target, cookie, payments } = await setup()
    try {
      const response = await remove(target, cookie, ORDER_ID, {})
      expect(response.status).toBe(400)
      expect(payments.deleteAthleteOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('rechaza un id que no es uuid', async () => {
    const { target, cookie, payments } = await setup()
    try {
      const response = await remove(target, cookie, 'no-es-uuid')
      expect(response.status).toBe(400)
      expect(payments.deleteAthleteOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('un rol sin permiso de cobros no puede borrar', async () => {
    const { target, cookie, payments } = await setup({ role: 'seguridad_plu_arg' })
    try {
      const response = await remove(target, cookie)
      expect(response.status).toBe(403)
      expect(payments.deleteAthleteOrder).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('sin sesión de staff responde 401', async () => {
    const { target } = await setup()
    try {
      const response = await remove(target, '')
      expect([401, 403]).toContain(response.status)
    } finally {
      await target.close()
    }
  })
})

describe('repositorio: deleteAthleteOrder', () => {
  it('llama a la RPC con el actor y el motivo', async () => {
    const rpc = vi.fn(async () => ({ data: { deleted: true, orderId: ORDER_ID }, error: null }))
    const repository = createSupabasePaymentRepository({ rpc, from: vi.fn() })
    const result = await repository.deleteAthleteOrder(ORDER_ID, 'u1:admin@plu.test', 'Duplicada')
    expect(rpc).toHaveBeenCalledWith('staff_delete_athlete_payment_order', {
      p_order_id: ORDER_ID,
      p_actor: 'u1:admin@plu.test',
      p_reason: 'Duplicada',
    })
    expect(result).toMatchObject({ deleted: true })
  })

  it.each(['PLU31', 'PLU32', 'PLU33', 'PLU34', 'PLU35'])(
    'el rechazo %s llega como 409 con el mensaje de la base',
    async (code) => {
      const rpc = vi.fn(async () => ({
        data: null,
        error: { code, message: `Motivo ${code}` },
      }))
      const repository = createSupabasePaymentRepository({ rpc, from: vi.fn() })
      await expect(
        repository.deleteAthleteOrder(ORDER_ID, 'u1:admin@plu.test', 'Duplicada'),
      ).rejects.toMatchObject({ status: 409 })
    },
  )
})
