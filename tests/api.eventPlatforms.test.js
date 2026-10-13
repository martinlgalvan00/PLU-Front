import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { authHeaders, buildStaffUser, createPrismaDouble, loginStaff } from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Tablados del evento y `platformId` en las tandas (migración 20261210100000).
 *
 * Lo que se afirma acá es el contrato del endpoint: qué llega a la RPC, qué se
 * rechaza antes de llegar y quién puede escribir. El comportamiento del SQL
 * (renombrar, intercambiar, quitar) lo cubre `supabase/tests/event_platforms.sql`.
 */

const SLUG = 'pitbull-classic-2026'
const PLATFORM_ID = '22222222-2222-4222-8222-222222222222'
const SESSION_ID = '33333333-3333-4333-8333-333333333333'

function createSupabaseDouble() {
  const rpc = vi.fn(async () => ({
    data: { eventSlug: SLUG, platforms: [], days: [], sessions: [], unassignedCount: 0 },
    error: null,
  }))
  return { client: { from: vi.fn(), rpc, storage: { from: vi.fn() } }, rpc }
}

async function setup(role = 'admin_maximal') {
  const staff = await buildStaffUser({ role, email: `${role}@platforms.test` })
  const supabase = createSupabaseDouble()
  const target = listen(
    createApp({ prisma: createPrismaDouble([staff]), supabaseAdmin: supabase.client }),
  )
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  // Las RPC del login (guard de identidad) son del armado del fixture.
  supabase.rpc.mockClear()
  return { target, cookie, supabase }
}

function post(target, cookie, path, body) {
  return fetch(`${target.url}/api/events/${SLUG}${path}`, {
    method: 'POST',
    headers: authHeaders(cookie),
    body: JSON.stringify(body),
  })
}

describe('API de tablados', () => {
  it('guarda el set de tablados con id para renombrar y sin id para crear', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const response = await post(target, cookie, '/platforms', {
        platforms: [{ id: PLATFORM_ID, name: '  Tablado Rojo ' }, { name: 'Tablado 2' }],
      })

      expect(response.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledWith('staff_save_event_platforms', {
        p_event_slug: SLUG,
        p_platforms: [{ id: PLATFORM_ID, name: 'Tablado Rojo' }, { name: 'Tablado 2' }],
        p_actor: expect.stringContaining(':admin_maximal@platforms.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('un evento sin tablados es un set vacío válido', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const response = await post(target, cookie, '/platforms', { platforms: [] })
      expect(response.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledWith(
        'staff_save_event_platforms',
        expect.objectContaining({ p_platforms: [] }),
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza nombres vacíos y más de cuatro tablados sin llegar a la RPC', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const blank = await post(target, cookie, '/platforms', { platforms: [{ name: '   ' }] })
      const tooMany = await post(target, cookie, '/platforms', {
        platforms: Array.from({ length: 5 }, (_, index) => ({ name: `T${index}` })),
      })

      expect(blank.status).toBe(400)
      expect(tooMany.status).toBe(400)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('solo escribe quien puede editar eventos', async () => {
    const { target, cookie, supabase } = await setup('plu_arg')
    try {
      const response = await post(target, cookie, '/platforms', {
        platforms: [{ name: 'Tablado 1' }],
      })
      expect(response.status).toBe(403)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('API de tandas con tablado', () => {
  const session = { id: SESSION_ID, dayIndex: 0, name: 'Tanda A', sortOrder: 0 }

  it('pasa platformId a la RPC, incluido null (tanda sin tablado)', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      await post(target, cookie, '/sessions', {
        sessions: [{ ...session, platformId: PLATFORM_ID }, { ...session, id: undefined, name: 'B', platformId: null }],
      })

      const [, args] = supabase.rpc.mock.calls.find(([name]) => name === 'staff_save_event_sessions')
      expect(args.p_sessions[0].platformId).toBe(PLATFORM_ID)
      expect(args.p_sessions[1]).toHaveProperty('platformId', null)
    } finally {
      await target.close()
    }
  })

  it('sin platformId la clave no viaja: el RPC enlaza por nombre (editor legado)', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      await post(target, cookie, '/sessions', { sessions: [{ ...session, platform: 'Tablado 1' }] })

      const [, args] = supabase.rpc.mock.calls.find(([name]) => name === 'staff_save_event_sessions')
      expect(args.p_sessions[0]).not.toHaveProperty('platformId')
      expect(args.p_sessions[0].platform).toBe('Tablado 1')
    } finally {
      await target.close()
    }
  })

  it('rechaza un platformId que no es uuid', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const response = await post(target, cookie, '/sessions', {
        sessions: [{ ...session, platformId: 'no-es-uuid' }],
      })
      expect(response.status).toBe(400)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})
