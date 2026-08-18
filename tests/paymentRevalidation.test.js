import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'
import {
  revalidatePaymentOrder,
  revalidatePaymentOrders,
} from '../server/modules/payments/paymentRevalidationWorkflow.js'
import {
  selectCanonicalProviderPayment,
  sortProviderPaymentsChronologically,
} from '../server/modules/payments/providerPaymentSelection.js'

/**
 * Revalidacion contra Mercado Pago.
 *
 * El caso real: la orden figura `cancelado` o `rechazado` en el panel pero la
 * plata entro. Pasa cuando el webhook nunca llego (URL mal configurada, redirect
 * en el camino, notificacion perdida) y ademas el atleta no volvio al sitio: las
 * tres entradas que mueven el estado —webhook, retorno del navegador y
 * conciliacion del intento embebido— fallan a la vez y nadie vuelve a
 * preguntarle al proveedor.
 */

const ORDER_ID = '3f7c6a41-2b8d-4e5f-9a1b-2c3d4e5f6a7b'
const ENV = { AUTH_SECRET: 'test-secret-revalidacion-plu-arg', APP_URL: 'http://localhost:5173' }
const ADMIN_PASSWORD = 'clave-admin-123'

function baseOrder(overrides = {}) {
  return {
    kind: 'athlete',
    id: ORDER_ID,
    organizationId: 'org-1',
    athleteId: 'ath-1',
    amount: 85000,
    currency: 'ARS',
    concept: 'membership',
    displayConcept: 'Afiliacion PLU',
    method: 'mercado_pago',
    status: 'cancelado',
    reference: 'MP-1755000000000',
    payerEmail: 'socio@pluarg.test',
    ...overrides,
  }
}

function providerPayment(overrides = {}) {
  return {
    id: 'mp-1',
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 85000,
    currency_id: 'ARS',
    external_reference: ORDER_ID,
    date_created: '2026-08-10T12:00:00.000Z',
    date_approved: '2026-08-10T12:00:05.000Z',
    payer: { email: 'socio@pluarg.test' },
    ...overrides,
  }
}

function createRepositoryDouble(order, { onApply } = {}) {
  const applied = []
  return {
    applied,
    getOrder: async () => order,
    applyPayment: async (payment) => {
      applied.push(payment)
      const result = onApply?.(payment) ?? {
        order: { ...order, status: payment.status },
        payment,
      }
      return result
    },
  }
}

function createProviderDouble(payments) {
  const calls = []
  return {
    calls,
    searchPaymentsForOrder: async (order) => {
      calls.push(order.id)
      return payments.filter((payment) => String(payment.external_reference) === String(order.id))
    },
    getPayment: async (id) => payments.find((payment) => String(payment.id) === String(id)) ?? null,
  }
}

describe('seleccion del pago canonico del proveedor', () => {
  it('elige el aprobado aunque haya un rechazo posterior', () => {
    // El atleta pago, y despues probo de nuevo con otra tarjeta que reboto.
    // Quedarse con el mas reciente reportaria la orden como rechazada.
    const canonical = selectCanonicalProviderPayment([
      providerPayment({
        id: 'mp-ok',
        status: 'approved',
        date_created: '2026-08-10T12:00:00.000Z',
      }),
      providerPayment({
        id: 'mp-no',
        status: 'rejected',
        date_created: '2026-08-10T13:00:00.000Z',
      }),
    ])
    expect(canonical.id).toBe('mp-ok')
  })

  it('entre dos del mismo rango se queda con el mas nuevo', () => {
    const canonical = selectCanonicalProviderPayment([
      providerPayment({
        id: 'viejo',
        status: 'rejected',
        date_created: '2026-08-01T10:00:00.000Z',
        date_approved: null,
      }),
      providerPayment({
        id: 'nuevo',
        status: 'rejected',
        date_created: '2026-08-09T10:00:00.000Z',
        date_approved: null,
      }),
    ])
    expect(canonical.id).toBe('nuevo')
  })

  it('sin pagos no inventa ninguno', () => {
    expect(selectCanonicalProviderPayment([])).toBeNull()
  })

  it('ordena cronologicamente para aplicar en la misma secuencia que el proveedor', () => {
    const ordered = sortProviderPaymentsChronologically([
      providerPayment({ id: 'b', date_created: '2026-08-05T10:00:00.000Z', date_approved: null }),
      providerPayment({ id: 'a', date_created: '2026-08-01T10:00:00.000Z', date_approved: null }),
    ])
    expect(ordered.map((payment) => payment.id)).toEqual(['a', 'b'])
  })
})

describe('revalidatePaymentOrder', () => {
  it('corrige una orden cancelada cuando Mercado Pago dice que el pago entro', async () => {
    const order = baseOrder({ status: 'cancelado' })
    const repository = createRepositoryDouble(order, {
      onApply: (payment) => ({ order: { ...order, status: 'aprobado' }, payment }),
    })
    const mercadoPago = createProviderDouble([providerPayment()])

    const result = await revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago })

    expect(result.localStatus).toBe('cancelado')
    expect(result.providerStatus).toBe('aprobado')
    expect(result.divergent).toBe(true)
    expect(result.corrected).toBe(true)
    expect(result.resultStatus).toBe('aprobado')
    // Pasa por el camino canonico del webhook, con el pago real del proveedor.
    expect(repository.applied).toHaveLength(1)
    expect(repository.applied[0]).toMatchObject({
      orderId: ORDER_ID,
      externalPaymentId: 'mp-1',
      status: 'aprobado',
      amount: 85000,
      orderKind: 'athlete',
    })
  })

  it('en modo diagnostico no escribe nada', async () => {
    const order = baseOrder({ status: 'cancelado' })
    const repository = createRepositoryDouble(order)
    const mercadoPago = createProviderDouble([providerPayment()])

    const result = await revalidatePaymentOrder(ORDER_ID, {
      repository,
      mercadoPago,
      apply: false,
    })

    expect(result.divergent).toBe(true)
    expect(result.outcome).toBe('divergent')
    expect(result.applied).toBe(false)
    expect(repository.applied).toHaveLength(0)
  })

  it('no acredita nada si el proveedor no tiene ningun pago de la orden', async () => {
    const order = baseOrder({ status: 'pendiente' })
    const repository = createRepositoryDouble(order)
    const mercadoPago = createProviderDouble([])

    const result = await revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago })

    expect(result.outcome).toBe('no_provider_payment')
    expect(result.providerStatus).toBeNull()
    expect(result.divergent).toBe(false)
    expect(repository.applied).toHaveLength(0)
  })

  it('marca la divergencia sin aplicar cuando el monto cobrado no coincide', async () => {
    // Cobro real por otro importe: aplicarlo mentiria en el reporte financiero.
    const order = baseOrder({ status: 'cancelado' })
    const repository = createRepositoryDouble(order)
    const mercadoPago = createProviderDouble([providerPayment({ transaction_amount: 42000 })])

    const result = await revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago })

    expect(result.outcome).toBe('amount_mismatch')
    expect(result.divergent).toBe(true)
    expect(repository.applied).toHaveLength(0)
  })

  it('deja la orden intacta cuando el estado local ya coincide con el proveedor', async () => {
    const order = baseOrder({ status: 'rechazado' })
    const repository = createRepositoryDouble(order)
    const mercadoPago = createProviderDouble([
      providerPayment({ status: 'rejected', date_approved: null }),
    ])

    const result = await revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago })

    expect(result.outcome).toBe('in_sync')
    expect(result.divergent).toBe(false)
    expect(repository.applied).toHaveLength(0)
  })

  it('avisa el cobro que aparece, pero no manda el aviso de un rechazo viejo', async () => {
    // Revalidar puede tocar intentos de hace semanas. El socio tiene que
    // enterarse de la plata que entro; mandarle "no pudimos procesar tu pago"
    // por un rechazo viejo lo manda a reintentar algo que ya no corresponde.
    const avisos = []
    const notifyPaymentApplied = async (payload) => avisos.push(payload.payment.status)

    const aprobada = baseOrder({ status: 'pendiente' })
    await revalidatePaymentOrder(ORDER_ID, {
      repository: createRepositoryDouble(aprobada, {
        onApply: (payment) => ({ order: { ...aprobada, status: 'aprobado' }, payment }),
      }),
      mercadoPago: createProviderDouble([providerPayment()]),
      notifyPaymentApplied,
    })

    const rechazada = baseOrder({ status: 'pendiente' })
    await revalidatePaymentOrder(ORDER_ID, {
      repository: createRepositoryDouble(rechazada, {
        onApply: (payment) => ({ order: { ...rechazada, status: 'rechazado' }, payment }),
      }),
      mercadoPago: createProviderDouble([
        providerPayment({ id: 'mp-viejo', status: 'rejected', date_approved: null }),
      ]),
      notifyPaymentApplied,
    })

    expect(avisos).toEqual(['aprobado'])
  })

  it('aplica un solo pago aunque el proveedor tenga varios intentos', async () => {
    const order = baseOrder({ status: 'cancelado' })
    const repository = createRepositoryDouble(order, {
      onApply: (payment) => ({ order: { ...order, status: 'aprobado' }, payment }),
    })
    const mercadoPago = createProviderDouble([
      providerPayment({
        id: 'mp-cancel',
        status: 'cancelled',
        date_created: '2026-08-09T10:00:00.000Z',
        date_approved: null,
      }),
      providerPayment({ id: 'mp-ok', status: 'approved' }),
    ])

    const result = await revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago })

    expect(repository.applied).toHaveLength(1)
    expect(repository.applied[0].externalPaymentId).toBe('mp-ok')
    expect(result.providerPayments).toHaveLength(2)
  })

  it('rechaza ordenes que no se cobran por Mercado Pago', async () => {
    const order = baseOrder({ method: 'manual_link' })
    const repository = createRepositoryDouble(order)
    const mercadoPago = createProviderDouble([])

    await expect(
      revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago }),
    ).rejects.toMatchObject({
      status: 409,
    })
  })

  it('funciona con adaptadores que solo exponen el pago canonico', async () => {
    const order = baseOrder({ status: 'pendiente' })
    const repository = createRepositoryDouble(order, {
      onApply: (payment) => ({ order: { ...order, status: 'aprobado' }, payment }),
    })
    const mercadoPago = {
      findPaymentForOrder: async () => providerPayment(),
      getPayment: async () => providerPayment(),
    }

    const result = await revalidatePaymentOrder(ORDER_ID, { repository, mercadoPago })
    expect(result.corrected).toBe(true)
  })
})

describe('revalidatePaymentOrders (barrido)', () => {
  it('resume las divergencias sin tocar nada por defecto', async () => {
    const order = baseOrder({ status: 'cancelado' })
    const repository = {
      ...createRepositoryDouble(order),
      listOrdersForRevalidation: async () => [
        { id: ORDER_ID, kind: 'athlete', status: 'cancelado', reference: order.reference },
      ],
    }
    const mercadoPago = createProviderDouble([providerPayment()])

    const { summary, divergences } = await revalidatePaymentOrders({ repository, mercadoPago })

    expect(summary).toMatchObject({ apply: false, checked: 1, divergent: 1, corrected: 0 })
    expect(divergences).toHaveLength(1)
    expect(divergences[0].providerStatus).toBe('aprobado')
  })

  it('una orden que falla no corta el barrido', async () => {
    const order = baseOrder({ status: 'cancelado' })
    const repository = {
      getOrder: async (id) => {
        if (id === 'rota') throw new Error('Orden ilegible.')
        return order
      },
      applyPayment: async (payment) => ({ order: { ...order, status: 'aprobado' }, payment }),
      listOrdersForRevalidation: async () => [
        { id: 'rota', kind: 'athlete', status: 'cancelado' },
        { id: ORDER_ID, kind: 'athlete', status: 'cancelado' },
      ],
    }
    const mercadoPago = createProviderDouble([providerPayment()])

    const { summary } = await revalidatePaymentOrders({ repository, mercadoPago, apply: true })

    expect(summary.checked).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.corrected).toBe(1)
  })
})

describe('POST /api/payments/orders/:orderId/revalidate', () => {
  function createPrismaDouble(seedUsers) {
    const users = [...seedUsers]
    const sessions = []
    return {
      user: {
        findUnique: async ({ where }) =>
          (where.email
            ? users.find((user) => user.email === where.email)
            : users.find((user) => user.id === where.id)) ?? null,
        update: async ({ where, data }) => {
          const user = users.find((item) => item.id === where.id)
          Object.assign(user, data)
          return user
        },
      },
      session: {
        create: async ({ data }) => {
          const session = { id: `ses-${sessions.length + 1}`, ...data }
          sessions.push(session)
          return session
        },
        findUnique: async ({ where }) => {
          const session = sessions.find((item) => item.tokenHash === where.tokenHash)
          if (!session) return null
          return { ...session, user: users.find((user) => user.id === session.userId) }
        },
        updateMany: async () => ({ count: 0 }),
      },
    }
  }

  function listen(app) {
    const server = app.listen(0)
    const { port } = server.address()
    return {
      url: `http://127.0.0.1:${port}`,
      close: () => new Promise((resolve) => server.close(resolve)),
    }
  }

  function headers(cookie) {
    return {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-PLU-Request': 'browser',
      ...(cookie ? { Cookie: cookie } : {}),
    }
  }

  async function buildAdmin() {
    return {
      id: 'usr-finanzas',
      email: 'finanzas@pluarg.test',
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'admin_maximal',
      status: 'active',
      profile: { firstName: 'Admin', lastName: 'PLU' },
      eventId: null,
      eventSlug: null,
    }
  }

  it('corrige el estado con la respuesta del proveedor y exige sesion de staff', async () => {
    const order = baseOrder({ status: 'cancelado' })
    const paymentRepository = {
      ...createRepositoryDouble(order, {
        onApply: (payment) => ({ order: { ...order, status: 'aprobado' }, payment }),
      }),
      listOrdersForRevalidation: async () => [],
    }
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(
      createApp({
        prisma,
        paymentRepository,
        mercadoPago: createProviderDouble([providerPayment()]),
        supabaseAdmin: null,
        env: ENV,
      }),
    )

    try {
      const anonymous = await fetch(`${target.url}/api/payments/orders/${ORDER_ID}/revalidate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      })
      expect(anonymous.status).toBe(401)

      const login = await fetch(`${target.url}/api/auth/login`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ email: 'finanzas@pluarg.test', password: ADMIN_PASSWORD }),
      })
      const cookie = login.headers.get('set-cookie')?.split(';')[0]

      const response = await fetch(`${target.url}/api/payments/orders/${ORDER_ID}/revalidate`, {
        method: 'POST',
        headers: headers(cookie),
        body: JSON.stringify({}),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.localStatus).toBe('cancelado')
      expect(body.resultStatus).toBe('aprobado')
      expect(body.corrected).toBe(true)
    } finally {
      await target.close()
    }
  })
})
