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
 * Un organizador solo gestiona SU evento: listado, guardado, logo, horario y tandas.
 * Dos eventos (A asignado, B ajeno) para probar lo que puede y lo que no.
 */
const A = { id: '11111111-1111-4111-8111-111111111111', slug: 'torneo-a-2026' }
const B = { id: '22222222-2222-4222-8222-222222222222', slug: 'torneo-b-2026' }

function eventRow(base, overrides = {}) {
  return {
    id: base.id,
    slug: base.slug,
    title: `Evento ${base.slug}`,
    published: false,
    status: 'proximamente',
    requires_membership: true,
    rules: { featured: false },
    payment_channel_overrides: null,
    bank_transfer_alias: 'club.alias',
    bank_transfer_cbu: '',
    bank_transfer_holder: '',
    starts_at: '2026-12-01T12:00:00.000Z',
    ends_at: '2026-12-01T23:00:00.000Z',
    logo_path: null,
    ...overrides,
  }
}

function createSupabase({ rowsById = {} } = {}) {
  const rows = [eventRow(A, rowsById[A.id]), eventRow(B, rowsById[B.id])]
  const profileReads = vi.fn()
  const rpc = vi.fn(async (name) => {
    if (name === 'staff_save_event') return { data: { id: A.id }, error: null }
    if (name === 'staff_get_event_schedule') return { data: { days: [] }, error: null }
    if (name === 'staff_save_event_sessions') return { data: { days: [] }, error: null }
    return { data: null, error: null }
  })
  const from = vi.fn((table) => {
    if (table === 'payment_profiles') {
      profileReads()
      throw new Error('un organizador no debería tocar payment_profiles sin elegir una cuenta')
    }
    const filters = []
    const query = {
      select: () => query,
      in: () => query,
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: (column, value) => (filters.push([column, value]), query),
      maybeSingle: async () => ({
        data:
          rows.find((row) => filters.every(([column, value]) => String(row[column]) === String(value))) ??
          null,
        error: null,
      }),
      update: () => query,
    }
    return query
  })
  const storage = {
    from: () => ({
      createSignedUploadUrl: async () => ({ data: { token: 't' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'http://x/logo.png' } }),
      remove: async () => ({ data: [], error: null }),
    }),
  }
  return { client: { from, rpc, storage }, rpc, profileReads }
}

function eventPayload(overrides = {}) {
  return {
    id: A.id,
    slug: A.slug,
    title: 'Torneo A',
    venue: 'Sede A',
    location: 'CABA',
    startsAt: '2026-12-01T09:00',
    endsAt: '2026-12-01T20:00',
    status: 'proximamente',
    published: false,
    slots: 100,
    featured: false,
    pricing: { membership: 0, registration: 50000, combo: 0, ticketsEnabled: false },
    bankTransfer: { alias: 'club.alias', cbu: '', holder: '' },
    ...overrides,
  }
}

async function setup({ role = 'organizer', supabaseOptions } = {}) {
  const user =
    role === 'organizer'
      ? await buildStaffUser({
          email: 'organizador@plu.test',
          eventAccess: [{ eventId: A.id, eventSlug: A.slug }],
        })
      : await buildStaffUser({ email: 'admin@plu.test' })
  const supabase = createSupabase(supabaseOptions)
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
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await response.json()
  } catch {
    // sin cuerpo
  }
  return { status: response.status, body: json }
}

describe('organizador: listado de eventos', () => {
  it('ve solo el evento asignado', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'GET', '/api/events')
      expect(result.status).toBe(200)
      expect(result.body.events.map((event) => event.slug)).toEqual([A.slug])
    } finally {
      await ctx.target.close()
    }
  })

  it('el Super Admin sigue viendo todos', async () => {
    const ctx = await setup({ role: 'admin' })
    try {
      const result = await call(ctx, 'GET', '/api/events')
      expect(result.body.events.map((event) => event.slug)).toEqual([A.slug, B.slug])
    } finally {
      await ctx.target.close()
    }
  })
})

describe('organizador: guardar su evento', () => {
  it('guarda su evento y la respuesta no filtra los demás', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'POST', '/api/events/upsert', eventPayload())
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      expect(ctx.supabase.rpc).toHaveBeenCalledWith('staff_save_event', expect.anything())
      expect(result.body.events.map((event) => event.slug)).toEqual([A.slug])
    } finally {
      await ctx.target.close()
    }
  })

  it('no puede crear eventos', async () => {
    const ctx = await setup()
    try {
      const { id: _id, ...sinId } = eventPayload()
      const result = await call(ctx, 'POST', '/api/events/upsert', sinId)
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('event_scope_forbidden_change')
      expect(ctx.supabase.rpc).not.toHaveBeenCalledWith('staff_save_event', expect.anything())
    } finally {
      await ctx.target.close()
    }
  })

  it('no puede guardar un evento ajeno, ni con su slug ni con otro id', async () => {
    const ctx = await setup()
    try {
      const ajeno = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({ id: B.id, slug: B.slug }),
      )
      expect(ajeno.status).toBe(403)
      expect(ajeno.body.code).toBe('event_not_assigned')

      // id propio con el slug de otro evento: el slug se fuerza al del evento
      // asignado, así que no puede mover datos del ajeno.
      const mezclado = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({ id: A.id, slug: B.slug }),
      )
      expect(mezclado.status).toBe(200)
      const saved = ctx.supabase.rpc.mock.calls.find(([name]) => name === 'staff_save_event')[1]
      expect(saved.p_event.slug).toBe(A.slug)
    } finally {
      await ctx.target.close()
    }
  })

  it('publicar, abrir inscripciones, destacar y cambiar la afiliación se ignoran: se fuerza el valor actual', async () => {
    const ctx = await setup()
    try {
      const result = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({
          published: true,
          status: 'inscripcion_abierta',
          featured: true,
          requiresMembership: false,
        }),
      )
      expect(result.status, JSON.stringify(result.body)).toBe(200)
      const saved = ctx.supabase.rpc.mock.calls.find(([name]) => name === 'staff_save_event')[1]
      expect(saved.p_event).toMatchObject({
        published: false,
        status: 'proximamente',
        featured: false,
        requiresMembership: true,
      })
    } finally {
      await ctx.target.close()
    }
  })

  it('puede cerrar un medio de pago pero no forzar abrir uno', async () => {
    const ctx = await setup()
    try {
      const cerrar = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({ paymentChannelOverrides: { registration: { cash_pitbull: false } } }),
      )
      expect(cerrar.status, JSON.stringify(cerrar.body)).toBe(200)

      const abrir = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({ paymentChannelOverrides: { registration: { bank_transfer: 'open' } } }),
      )
      expect(abrir.status).toBe(403)
      expect(abrir.body.code).toBe('event_scope_forbidden_change')
    } finally {
      await ctx.target.close()
    }
  })

  it('una apertura que ya tenía el evento (la puso PLU) se conserva sin error', async () => {
    const ctx = await setup({
      supabaseOptions: {
        rowsById: {
          [A.id]: { payment_channel_overrides: { registration: { bank_transfer: 'open' } } },
        },
      },
    })
    try {
      const result = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({ paymentChannelOverrides: { registration: { bank_transfer: 'open' } } }),
      )
      expect(result.status, JSON.stringify(result.body)).toBe(200)
    } finally {
      await ctx.target.close()
    }
  })

  it('no carga alias sueltos (crearía una cuenta global), pero conserva el que ya tiene', async () => {
    const ctx = await setup()
    try {
      const nuevo = await call(
        ctx,
        'POST',
        '/api/events/upsert',
        eventPayload({ bankTransfer: { alias: 'otro.alias', cbu: '', holder: '' } }),
      )
      expect(nuevo.status).toBe(403)
      expect(nuevo.body.code).toBe('event_scope_forbidden_change')

      // Mismo alias que ya tiene el evento: no toca el catálogo de cuentas.
      const igual = await call(ctx, 'POST', '/api/events/upsert', eventPayload())
      expect(igual.status, JSON.stringify(igual.body)).toBe(200)
      expect(ctx.supabase.profileReads).not.toHaveBeenCalled()
    } finally {
      await ctx.target.close()
    }
  })
})

describe('organizador: logo, horario y tandas', () => {
  it('solo opera sobre su evento', async () => {
    const ctx = await setup()
    try {
      const propio = await call(ctx, 'POST', `/api/events/${A.slug}/logo/upload-url`, {
        contentType: 'image/png',
        size: 1024,
      })
      expect(propio.status, JSON.stringify(propio.body)).toBe(200)

      const ajeno = await call(ctx, 'POST', `/api/events/${B.slug}/logo/upload-url`, {
        contentType: 'image/png',
        size: 1024,
      })
      expect(ajeno.status).toBe(403)
      expect(ajeno.body.code).toBe('event_not_assigned')

      const heroPropio = await call(ctx, 'POST', `/api/events/${A.slug}/hero/upload-url`, {
        contentType: 'image/png',
        size: 1024,
      })
      expect(heroPropio.status, JSON.stringify(heroPropio.body)).toBe(200)
      const heroAjeno = await call(ctx, 'POST', `/api/events/${B.slug}/hero/upload-url`, {
        contentType: 'image/png',
        size: 1024,
      })
      expect(heroAjeno.status).toBe(403)
      expect(heroAjeno.body.code).toBe('event_not_assigned')

      expect((await call(ctx, 'GET', `/api/events/${A.slug}/schedule`)).status).toBe(200)
      const horarioAjeno = await call(ctx, 'GET', `/api/events/${B.slug}/schedule`)
      expect(horarioAjeno.status).toBe(403)

      const tandasAjenas = await call(ctx, 'POST', `/api/events/${B.slug}/sessions`, {
        sessions: [],
      })
      expect(tandasAjenas.status).toBe(403)
      expect(ctx.supabase.rpc).not.toHaveBeenCalledWith(
        'staff_save_event_sessions',
        expect.anything(),
      )
    } finally {
      await ctx.target.close()
    }
  })

  it('publicar o cambiar el estado sigue cerrado para el organizador', async () => {
    const ctx = await setup()
    try {
      const result = await call(ctx, 'POST', `/api/events/${A.slug}/state`, { published: true })
      expect(result.status).toBe(403)
      expect(result.body.code).toBe('event_scope_denied')
      const borrar = await call(ctx, 'DELETE', `/api/events/${A.slug}`)
      expect(borrar.status).toBe(403)
    } finally {
      await ctx.target.close()
    }
  })
})
