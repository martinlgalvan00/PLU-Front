import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Lo que un organizador usa para armar SU evento y que no es del evento en sí:
 * elegir una cuenta de cobro, leer la matriz de medios, programar el precio de
 * inscripción y ver las entradas vendidas.
 */
const ORG = '00000000-0000-4000-8000-000000000001'
const A = { id: '11111111-1111-4111-8111-111111111111', slug: 'torneo-a-2026' }
const B = { id: '22222222-2222-4222-8222-222222222222', slug: 'torneo-b-2026' }
const TICKET_B = '55555555-5555-4555-8555-555555555552'

function createSupabase() {
  const tables = {
    payment_profiles: [
      {
        id: 'p-bank',
        organization_id: ORG,
        name: 'Cuenta PLU',
        kind: 'bank_transfer',
        active: true,
        config: { alias: 'plu.cobros', cbu: '0000003100000000000001', holder: 'PLU', notes: 'interno' },
        secrets_ciphertext: null,
      },
      {
        id: 'p-old',
        organization_id: ORG,
        name: 'Cuenta vieja',
        kind: 'bank_transfer',
        active: false,
        config: { alias: 'vieja', cbu: '', holder: '' },
        secrets_ciphertext: null,
      },
      {
        id: 'p-mp',
        organization_id: ORG,
        name: 'Mercado Pago PLU',
        kind: 'mercado_pago',
        active: true,
        config: {
          publicKey: 'APP_USR-public',
          collectorId: '241983636',
          connection: 'oauth',
          accountEmail: 'finanzas@plu.test',
          accountNickname: 'PLU_ARG',
          expiresAt: '2099-01-01T00:00:00.000Z',
          status: 'connected',
        },
        secrets_ciphertext: 'CIPHERTEXT-SECRETO',
      },
    ],
  }
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  const from = vi.fn((name) => {
    let rows = [...(tables[name] ?? [])]
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      eq: (column, value) => ((rows = rows.filter((row) => String(row[column]) === String(value))), query),
      in: () => query,
      not: () => query,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    }
    return query
  })
  return { client: { from, rpc, storage: { from: () => ({}) } }, rpc }
}

async function setup({ role = 'organizer' } = {}) {
  const user =
    role === 'organizer'
      ? await buildStaffUser({
          email: 'org-catalogo@plu.test',
          eventAccess: [{ eventId: A.id, eventSlug: A.slug }],
        })
      : await buildStaffUser({ email: 'admin-catalogo@plu.test' })
  const supabase = createSupabase()
  const target = listen(
    createApp({ prisma: createPrismaDouble([user]), supabaseAdmin: supabase.client }),
  )
  const { cookie } = await loginStaff(target.url, { email: user.email })
  supabase.rpc.mockClear()
  return { target, cookie, supabase }
}

async function call(ctx, method, path, body) {
  const response = await fetch(`${ctx.target.url}${path}`, {
    method,
    headers: authHeaders(ctx.cookie),
    body: body && !['GET', 'HEAD'].includes(method) ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    // sin cuerpo JSON
  }
  return { status: response.status, body: json }
}

describe('organizador: catálogo de cuentas de cobro', () => {
  it('ve solo lo necesario para elegir, sin secretos ni cuentas archivadas', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'GET', '/api/payment-profiles?includeArchived=true&includeUsage=true')
      expect(result.status).toBe(200)
      expect(result.body.profiles.map((profile) => profile.id).sort()).toEqual(['p-bank', 'p-mp'])

      const bank = result.body.profiles.find((profile) => profile.id === 'p-bank')
      expect(bank.config).toEqual({
        alias: 'plu.cobros',
        cbu: '0000003100000000000001',
        holder: 'PLU',
        // Lo mismo que ve el comprador en el checkout: CUIT y banco del titular.
        cuit: '',
        bankName: '',
      })

      const text = JSON.stringify(result.body)
      for (const secreto of ['CIPHERTEXT-SECRETO', 'finanzas@plu.test', 'PLU_ARG', '241983636', 'interno']) {
        expect(text, secreto).not.toContain(secreto)
      }
      // Sin capacidades de alta: el editor no ofrece crear ni conectar cuentas.
      expect(result.body.mercadoPagoOAuth.available).toBe(false)
      expect(result.body.profiles.every((profile) => !('usage' in profile))).toBe(true)
    } finally {
      await ctx.target.close()
    }
  })

  it('crear, editar, archivar, borrar y conectar cuentas sigue cerrado', async () => {
    const ctx = await setup()
    try {
      const attempts = [
        ['POST', '/api/payment-profiles', { name: 'X', kind: 'bank_transfer', config: { alias: 'a.b' } }],
        ['PATCH', '/api/payment-profiles/00000000-0000-4000-8000-000000000000', { name: 'Y' }],
        ['DELETE', '/api/payment-profiles/00000000-0000-4000-8000-000000000000', undefined],
        ['POST', '/api/payment-profiles/mercado-pago/oauth/start', {}],
      ]
      for (const [method, path, body] of attempts) {
        const result = await call(ctx, method, path, body)
        expect(result.status, `${method} ${path}`).toBe(403)
        expect(result.body.code).toBe('event_scope_denied')
      }
    } finally {
      await ctx.target.close()
    }
  })

  it('el Super Admin sigue viendo el catálogo completo', async () => {
    const ctx = await setup({ role: 'admin' })
    try {
      const result = await call(ctx, 'GET', '/api/payment-profiles?includeArchived=true')
      expect(result.body.profiles.map((profile) => profile.id).sort()).toEqual(['p-bank', 'p-mp', 'p-old'])
      const mp = result.body.profiles.find((profile) => profile.id === 'p-mp')
      expect(mp.config.accountEmail).toBe('finanzas@plu.test')
    } finally {
      await ctx.target.close()
    }
  })
})

describe('organizador: matriz de medios y precio de inscripción', () => {
  it('lee la matriz de la plataforma pero no puede cambiarla', async () => {
    const ctx = await setup()
    try {
      const read = await call(ctx, 'GET', '/api/platform-settings')
      expect(read.body?.code).not.toBe('event_scope_denied')
      expect(read.status).not.toBe(403)

      for (const [method, path] of [
        ['PUT', '/api/platform-settings'],
        ['PUT', '/api/platform-settings/channels'],
        ['PUT', '/api/platform-settings/windows'],
        ['PUT', '/api/platform-settings/teaser'],
      ]) {
        const result = await call(ctx, method, path, {})
        expect(result.status, `${method} ${path}`).toBe(403)
        expect(result.body.code).toBe('event_scope_denied')
      }
    } finally {
      await ctx.target.close()
    }
  })

  it('programa el precio de SU evento (sin tener admin.pricing.write) y no el de otro', async () => {
    const ctx = await setup()
    try {
      const body = { price: 60000 }
      const propio = await call(ctx, 'PATCH', `/api/pricing/events/${A.slug}/registration-price`, body)
      expect(propio.body?.code).not.toBe('event_scope_denied')
      expect(propio.body?.code).not.toBe('event_not_assigned')

      const ajeno = await call(ctx, 'PATCH', `/api/pricing/events/${B.slug}/registration-price`, body)
      expect(ajeno.status).toBe(403)
      expect(ajeno.body.code).toBe('event_not_assigned')

      const ajenoCancelar = await call(
        ctx,
        'DELETE',
        `/api/pricing/events/${B.slug}/registration-price/schedule`,
      )
      expect(ajenoCancelar.status).toBe(403)
      expect(ajenoCancelar.body.code).toBe('event_not_assigned')
    } finally {
      await ctx.target.close()
    }
  })

  it('el resto de Tarifas (planes, códigos de descuento) sigue cerrado', async () => {
    const ctx = await setup()
    try {
      for (const [method, path] of [
        ['GET', '/api/pricing'],
        ['POST', '/api/pricing/discount-codes'],
      ]) {
        const result = await call(ctx, method, path, {})
        expect(result.status, `${method} ${path}`).toBe(403)
        expect(result.body.code).toBe('event_scope_denied')
      }
    } finally {
      await ctx.target.close()
    }
  })
})

describe('organizador: entradas vendidas', () => {
  it('lista las de su evento sin permiso de puerta, y las de otro dan 403', async () => {
    const ctx = await setup()
    try {
      const propio = await call(ctx, 'GET', `/api/tickets?eventSlug=${A.slug}`)
      expect(propio.body?.code).not.toBe('event_scope_denied')
      expect(propio.body?.code).not.toBe('event_not_assigned')

      const ajeno = await call(ctx, 'GET', `/api/tickets?eventSlug=${B.slug}`)
      expect(ajeno.status).toBe(403)
      expect(ajeno.body.code).toBe('event_not_assigned')
    } finally {
      await ctx.target.close()
    }
  })

  it('operar la puerta (check-in) sigue cerrado: tener ver-cobros no abre el escaneo', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'POST', '/api/tickets/checkin/token-cualquiera', {})
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('event_scope_denied')
    } finally {
      await ctx.target.close()
    }
  })

  it('el override de acceso de una entrada ajena se corta antes de tocar nada', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'PUT', `/api/tickets/${TICKET_B}/access-override`, {
        enabled: false,
      })
      // La entrada no existe en el doble (404) o es ajena (403): en ningún caso actúa.
      expect([403, 404]).toContain(result.status)
      expect(ctx.supabase.rpc).not.toHaveBeenCalledWith(
        expect.stringMatching(/override/i),
        expect.anything(),
      )
    } finally {
      await ctx.target.close()
    }
  })
})
