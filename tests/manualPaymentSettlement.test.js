import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { HttpError } from '../server/lib/errors.js'
import { hashPassword } from '../server/services/passwordService.js'

/**
 * Corrección manual de cobros y de estados de inscripción
 * (migración 20260822100000).
 *
 * El caso que resuelve: Mercado Pago da la orden por rechazada o cancelada pero
 * el dinero entró igual. Antes no había salida operativa — `approve` se niega a
 * tocar órdenes de MP y `event_registrations.status` no tenía edición manual.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822100000_manual_payment_settlement.sql'),
  'utf8',
)
const transferStateMachine = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819120000_transfer_proof_state_machine.sql'),
  'utf8',
)

const ENV = { AUTH_SECRET: 'test-secret-acreditacion-manual-plu', APP_URL: 'http://localhost:5173' }
const ADMIN_PASSWORD = 'clave-admin-123'
const ORDER_ID = '5f3b2f6e-7a1c-4b2d-9e8f-1a2b3c4d5e6f'
const REGISTRATION_ID = '7a1c4b2d-9e8f-4a2b-8c4d-5e6f1a2b3c4d'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function authHeaders(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
  const sessions = []
  return {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((user) => user.email === where.email) ?? null
        return users.find((user) => user.id === where.id) ?? null
      },
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

function createAthleteRepoDouble() {
  const settleCalls = []
  const statusCalls = []
  return {
    settleCalls,
    statusCalls,
    adminData: async () => ({ athletes: [], memberships: [], registrations: [], paymentOrders: [] }),
    // El email de confirmación es best-effort: sin contacto corta antes de
    // intentar enviarlo y no interfiere con lo que se está probando.
    findContact: async () => null,
    forceSettlePayment: async (orderId, payload, actor) => {
      settleCalls.push({ orderId, payload, actor })
      return {
        order: { id: orderId, status: 'aprobado', method: 'mercado_pago', amount: 85000 },
        membership: { id: 'mem-1' },
        registration: null,
        duplicate: false,
      }
    },
    setRegistrationStatus: async (registrationId, status, reason, actor) => {
      statusCalls.push({ registrationId, status, reason, actor })
      if (registrationId === '00000000-0000-4000-8000-000000000099') {
        throw new HttpError(404, 'Inscripción no encontrada.')
      }
      return { registration: { id: registrationId, status }, duplicate: false }
    },
  }
}

async function buildAdmin(role, email) {
  return {
    id: `usr-${role}`,
    email,
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role,
    status: 'active',
    profile: { firstName: 'Admin', lastName: 'PLU' },
    eventId: null,
    eventSlug: null,
  }
}

async function loginAs(url, email) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password: ADMIN_PASSWORD }),
  })
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('migración de acreditación manual', () => {
  it('no relaja el bloqueo que impide aprobar Mercado Pago por la vía normal', () => {
    // La corrección manual es una función aparte: si esta guarda desapareciera,
    // cualquier operador podría acreditar un cobro de MP sin motivo ni firma.
    expect(transferStateMachine).toContain(
      'Los pagos de Mercado Pago solo se aprueban por webhook.',
    )
    expect(migration).not.toContain('create or replace function public.approve_athlete_payment_order')
  })

  it('exige comprobante y motivo antes de acreditar', () => {
    expect(migration).toContain('La correccion manual exige un motivo.')
    expect(migration).toContain('v_order.payment_proof_path is null')
  })

  it('crea el asiento contable en athlete_payments, que es de donde salen los ingresos', () => {
    // El reporte financiero agrega `athlete_payments` con status 'aprobado':
    // mover solo el estado de la orden dejaría el dinero fuera del reporte.
    expect(migration).toContain('insert into public.athlete_payments')
    expect(migration).toContain("'manual-settlement:' || p_order_id::text")
  })

  it('es idempotente sobre una orden ya aprobada', () => {
    expect(migration).toContain("if v_order.status = 'aprobado' then")
    expect(migration).toContain("'duplicate', true")
  })

  it('audita la acreditación y el derecho otorgado con el responsable', () => {
    expect(migration).toContain("'payment.force_settled_manually'")
    expect(migration).toContain("'registration.status_changed_manually'")
    expect(migration).toContain("'staff',")
  })

  it('limita el cambio manual de inscripción a los estados corregibles', () => {
    expect(migration).toContain("p_status not in ('confirmada', 'observada', 'cancelada')")
  })

  it('no deja al socio activo y vencido a la vez al acreditar un pago viejo', () => {
    expect(migration).toContain('v_membership.expiration_date < current_date')
  })
})

describe('POST /api/athletes/admin/payment-orders/:orderId/force-settle', () => {
  it('acredita a mano y deja el actor y el motivo registrados', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal', 'settle@pluarg.test')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAs(target.url, 'settle@pluarg.test')
      const response = await fetch(
        `${target.url}/api/athletes/admin/payment-orders/${ORDER_ID}/force-settle`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({
            reason: 'Transferencia recibida el 12/08, MP la marcó cancelada.',
            reference: 'OP-99812',
          }),
        },
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.order.status).toBe('aprobado')
      expect(athleteRepository.settleCalls).toEqual([
        {
          orderId: ORDER_ID,
          payload: {
            reason: 'Transferencia recibida el 12/08, MP la marcó cancelada.',
            reference: 'OP-99812',
          },
          actor: 'usr-admin_maximal:settle@pluarg.test',
        },
      ])
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) si no se explica por qué se acredita', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal', 'settle2@pluarg.test')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAs(target.url, 'settle2@pluarg.test')
      const response = await fetch(
        `${target.url}/api/athletes/admin/payment-orders/${ORDER_ID}/force-settle`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ reason: '' }),
        },
      )

      expect(response.status).toBe(400)
      expect(athleteRepository.settleCalls).toHaveLength(0)
    } finally {
      await target.close()
    }
  })

  it('rechaza (403) a quien no puede aprobar pagos', async () => {
    const prisma = createPrismaDouble([await buildAdmin('viewer_plu_usa', 'viewer@pluarg.test')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAs(target.url, 'viewer@pluarg.test')
      const response = await fetch(
        `${target.url}/api/athletes/admin/payment-orders/${ORDER_ID}/force-settle`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ reason: 'Cobro verificado con el banco.' }),
        },
      )

      expect(response.status).toBe(403)
      expect(athleteRepository.settleCalls).toHaveLength(0)
    } finally {
      await target.close()
    }
  })
})

describe('POST /api/athletes/admin/registrations/:registrationId/status', () => {
  it('corrige el estado sin borrar la inscripción', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal', 'regs@pluarg.test')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAs(target.url, 'regs@pluarg.test')
      const response = await fetch(
        `${target.url}/api/athletes/admin/registrations/${REGISTRATION_ID}/status`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ status: 'confirmada', reason: 'Cancelada por error al validar.' }),
        },
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.registration.status).toBe('confirmada')
      expect(athleteRepository.statusCalls).toEqual([
        {
          registrationId: REGISTRATION_ID,
          status: 'confirmada',
          reason: 'Cancelada por error al validar.',
          actor: 'usr-admin_maximal:regs@pluarg.test',
        },
      ])
    } finally {
      await target.close()
    }
  })

  it('rechaza (400) un estado que el panel no puede corregir', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal', 'regs2@pluarg.test')])
    const athleteRepository = createAthleteRepoDouble()
    const target = listen(createApp({ prisma, athleteRepository, env: ENV }))

    try {
      const cookie = await loginAs(target.url, 'regs2@pluarg.test')
      const response = await fetch(
        `${target.url}/api/athletes/admin/registrations/${REGISTRATION_ID}/status`,
        {
          method: 'POST',
          headers: authHeaders(cookie),
          // `pendiente_pago` queda afuera a propósito: reabrir el checkout
          // tiene su propio flujo de reanudación.
          body: JSON.stringify({ status: 'pendiente_pago', reason: 'Quiero reabrir el pago.' }),
        },
      )

      expect(response.status).toBe(400)
      expect(athleteRepository.statusCalls).toHaveLength(0)
    } finally {
      await target.close()
    }
  })
})
