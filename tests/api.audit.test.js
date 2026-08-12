import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * La auditoría del panel leía localStorage mientras `domain_audit_logs` se
 * poblaba sin que nadie la consultara. Estos tests fijan el contrato del
 * endpoint que la expone: permiso, filtros, cursor y solo lectura.
 */

function auditRow(overrides = {}) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    action: 'payment.applied',
    entity_type: 'athlete_payment_order',
    entity_id: '11111111-1111-4111-8111-111111111111',
    actor_type: 'webhook',
    actor_id: 'mp-8891',
    metadata: { amount: 75000, externalPaymentId: 'mp-8891' },
    created_at: '2026-08-02T12:00:00.000Z',
    ...overrides
  }
}

function createAuditRepositoryDouble(rows = [auditRow()]) {
  const list = vi.fn(async () => rows)
  const facets = vi.fn(async () => ({
    actions: ['payment.applied'],
    entityTypes: ['athlete_payment_order'],
    actorTypes: ['webhook'],
    sources: ['domain'],
    statuses: [],
  }))
  const overview = vi.fn(async () => ({
    status: 'healthy',
    eventsLast24h: 1,
    emailAttention: 0,
  }))
  return { repository: { list, facets, overview }, list, facets, overview }
}

async function setup({ role = 'admin_maximal', rows } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@audit.test` })
  const prisma = createPrismaDouble([staff])
  const audit = createAuditRepositoryDouble(rows)
  const target = listen(createApp({ prisma, auditRepository: audit.repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, audit }
}

describe('API de auditoría (/api/audit)', () => {
  it('devuelve la bitácora de dominio a un rol con admin.audit.read', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/audit`, { headers: { Cookie: cookie } })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.entries).toHaveLength(1)
      expect(body.entries[0]).toMatchObject({
        action: 'payment.applied',
        entity_type: 'athlete_payment_order',
        actor_type: 'webhook',
      })
    } finally {
      await target.close()
    }
  })

  it('bloquea a un rol operativo sin el permiso de auditoría', async () => {
    // Seguridad tiene check-in y eventos, no auditoría.
    const { target, cookie } = await setup({ role: 'seguridad_plu_arg' })

    try {
      const response = await fetch(`${target.url}/api/audit`, { headers: { Cookie: cookie } })
      expect(response.status).toBe(403)
    } finally {
      await target.close()
    }
  })

  it('rechaza (401) sin sesión de staff', async () => {
    const { target } = await setup()

    try {
      const response = await fetch(`${target.url}/api/audit`)
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('propaga los filtros al repositorio', async () => {
    const { target, cookie, audit } = await setup()

    try {
      await fetch(
        `${target.url}/api/audit?action=membership.activated&actorType=staff&entityType=membership&source=email&status=failed&limit=25`,
        { headers: { Cookie: cookie } },
      )

      expect(audit.list).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'membership.activated',
          actorType: 'staff',
          entityType: 'membership',
          source: 'email',
          status: 'failed',
          limit: 25,
        }),
      )
    } finally {
      await target.close()
    }
  })

  it('expone el resumen de salud operativa con el mismo permiso', async () => {
    const { target, cookie, audit } = await setup()

    try {
      const response = await fetch(`${target.url}/api/audit/overview`, {
        headers: { Cookie: cookie },
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({ status: 'healthy', eventsLast24h: 1 })
      expect(audit.overview).toHaveBeenCalledTimes(1)
    } finally {
      await target.close()
    }
  })

  it('resuelve la actividad de un atleta con una sola consulta multi-entidad', async () => {
    const { target, cookie, audit } = await setup()

    try {
      await fetch(`${target.url}/api/audit?entityIds=mem-1,reg-2,ord-3`, {
        headers: { Cookie: cookie },
      })

      expect(audit.list).toHaveBeenCalledWith(
        expect.objectContaining({ entityIds: ['mem-1', 'reg-2', 'ord-3'] }),
      )
    } finally {
      await target.close()
    }
  })

  it('limpia la sintaxis de PostgREST del término de búsqueda', async () => {
    const { target, cookie, audit } = await setup()

    try {
      await fetch(`${target.url}/api/audit?search=${encodeURIComponent('ana,(*)')}`, {
        headers: { Cookie: cookie },
      })

      expect(audit.list).toHaveBeenCalledWith(expect.objectContaining({ search: 'ana' }))
    } finally {
      await target.close()
    }
  })

  it('rechaza una búsqueda que queda vacía después de sanitizarla', async () => {
    const { target, cookie, audit } = await setup()

    try {
      const response = await fetch(`${target.url}/api/audit?search=${encodeURIComponent('(*)')}`, {
        headers: { Cookie: cookie },
      })

      expect(response.status).toBe(400)
      expect(audit.list).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('devuelve cursor solo cuando la página vino completa', async () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      auditRow({ id: `row-${index}`, created_at: `2026-08-02T12:00:${String(index).padStart(2, '0')}.000Z` }),
    )
    const { target, cookie } = await setup({ rows })

    try {
      const full = await fetch(`${target.url}/api/audit`, { headers: { Cookie: cookie } })
      const fullBody = await full.json()
      expect(fullBody.nextCursor).toBe(rows.at(-1).created_at)

      const partial = await fetch(`${target.url}/api/audit?limit=200`, { headers: { Cookie: cookie } })
      const partialBody = await partial.json()
      expect(partialBody.nextCursor).toBeNull()
    } finally {
      await target.close()
    }
  })

  it('no expone escritura de auditoría', async () => {
    // La bitácora la escriben las RPC dentro de la misma transacción que aplica
    // cada efecto. Que se pueda escribir por API la volvería inútil como
    // auditoría, así que no hay ruta de escritura: el POST muere en el guard de
    // mutación confiable, antes de que ningún handler lo mire.
    const { target, cookie, audit } = await setup()

    try {
      const response = await fetch(`${target.url}/api/audit`, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inventada' }),
      })

      expect(response.ok).toBe(false)
      expect(audit.list).not.toHaveBeenCalled()
      expect(audit.repository.create).toBeUndefined()
    } finally {
      await target.close()
    }
  })
})
