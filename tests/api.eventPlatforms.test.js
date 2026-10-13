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

describe('API de grilla pública', () => {
  const PUBLIC_SCHEDULE = { enabled: true, platforms: [], days: [] }

  async function publicSetup() {
    const staff = await buildStaffUser({ role: 'admin_maximal', email: 'admin_maximal@public.test' })
    const supabase = createSupabaseDouble()
    supabase.rpc.mockImplementation(async (name) => ({
      data: name === 'public_event_schedule' ? PUBLIC_SCHEDULE : { schedulePublic: true },
      error: null,
    }))
    const target = listen(
      createApp({ prisma: createPrismaDouble([staff]), supabaseAdmin: supabase.client }),
    )
    return { target, supabase, staff }
  }

  it('la lectura es pública (sin sesión) y con cache corto', async () => {
    const { target, supabase } = await publicSetup()
    try {
      const response = await fetch(`${target.url}/api/events/${SLUG}/schedule-public`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ schedule: PUBLIC_SCHEDULE })
      expect(supabase.rpc).toHaveBeenCalledWith('public_event_schedule', { p_event_slug: SLUG })
      // Apagar la grilla tiene que verse en segundos: nada de stale-while-revalidate largo.
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=0, s-maxage=10, stale-while-revalidate=0',
      )
    } finally {
      await target.close()
    }
  })

  it('un slug inválido no llega a la RPC', async () => {
    const { target, supabase } = await publicSetup()
    try {
      const response = await fetch(`${target.url}/api/events/${encodeURIComponent('../x')}/schedule-public`)
      expect([400, 404]).toContain(response.status)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('publicar exige sesión de staff con permiso de edición de eventos', async () => {
    const anonymous = await publicSetup()
    try {
      const response = await fetch(`${anonymous.target.url}/api/events/${SLUG}/schedule-public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: true }),
      })
      expect([401, 403]).toContain(response.status)
      expect(anonymous.supabase.rpc).not.toHaveBeenCalledWith(
        'staff_set_event_schedule_public',
        expect.anything(),
      )
    } finally {
      await anonymous.target.close()
    }

    const { target, cookie, supabase } = await setup('plu_arg')
    try {
      const response = await post(target, cookie, '/schedule-public', { public: true })
      expect(response.status).toBe(403)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('publicar y retirar llegan a la RPC con el actor', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const on = await post(target, cookie, '/schedule-public', { public: true })
      const off = await post(target, cookie, '/schedule-public', { public: false })

      expect(on.status).toBe(200)
      expect(off.status).toBe(200)
      expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'staff_set_event_schedule_public', {
        p_event_slug: SLUG,
        p_public: true,
        p_actor: expect.stringContaining(':admin_maximal@platforms.test'),
      })
      expect(supabase.rpc).toHaveBeenNthCalledWith(
        2,
        'staff_set_event_schedule_public',
        expect.objectContaining({ p_public: false }),
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza un cuerpo que no es booleano: no hay "publicar por las dudas"', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const wrongType = await post(target, cookie, '/schedule-public', { public: 'true' })
      const missing = await post(target, cookie, '/schedule-public', {})
      expect(wrongType.status).toBe(400)
      expect(missing.status).toBe(400)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('API de plantillas de grilla', () => {
  const TEMPLATE_ID = '44444444-4444-4444-8444-444444444444'
  const CONFIG = {
    platforms: ['Tablado 1', 'Tablado 2'],
    maxPerSession: 12,
    groupBy: ['sex', 'category'],
    sortBy: 'weight',
    mergeSmall: true,
    platformMode: 'balance',
    weightClasses: { Femenino: [47, 52, 57] },
    schedule: { firstStart: '09:00', sessionMinutes: 45, gapMinutes: 10, weighInLeadMinutes: 120 },
  }

  function put(target, cookie, path, method, body) {
    return fetch(`${target.url}/api/events/${SLUG}${path}`, {
      method,
      headers: authHeaders(cookie),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  it('lista las plantillas con permiso de lectura de inscripciones', async () => {
    const { target, cookie, supabase } = await setup('plu_arg')
    try {
      supabase.rpc.mockResolvedValueOnce({ data: [{ id: TEMPLATE_ID, name: 'Mi plantilla' }], error: null })
      const response = await fetch(`${target.url}/api/events/${SLUG}/grid-templates`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ templates: [{ id: TEMPLATE_ID, name: 'Mi plantilla' }] })
      expect(supabase.rpc).toHaveBeenCalledWith('staff_list_grid_templates', { p_event_slug: SLUG })
    } finally {
      await target.close()
    }
  })

  it('guarda con nombre y configuración, y el actor llega a la RPC', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const response = await put(target, cookie, '/grid-templates', 'POST', {
        name: '  Doble tablado  ',
        config: CONFIG,
      })
      expect(response.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledWith('staff_save_grid_template', {
        p_event_slug: SLUG,
        p_name: 'Doble tablado',
        p_config: CONFIG,
        p_actor: expect.stringContaining(':admin_maximal@platforms.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza lo que no es una plantilla válida sin llegar a la RPC', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const bad = [
        { name: '', config: CONFIG },
        { name: 'x'.repeat(81), config: CONFIG },
        { name: 'ok', config: { ...CONFIG, groupBy: ['sex', 'inventado'] } },
        { name: 'ok', config: { ...CONFIG, maxPerSession: 0 } },
        { name: 'ok', config: { ...CONFIG, platforms: ['a', 'b', 'c', 'd', 'e'] } },
        { name: 'ok', config: { ...CONFIG, platformMode: 'azar' } },
        // `.strict()`: una clave de más no se guarda en silencio.
        { name: 'ok', config: { ...CONFIG, dayIndexes: [0] } },
        { name: 'ok', config: { ...CONFIG, weightClasses: { Otro: [50] } } },
        { name: 'ok', config: { ...CONFIG, schedule: { ...CONFIG.schedule, firstStart: 'mañana' } } },
        { name: 'ok', config: { ...CONFIG, schedule: { ...CONFIG.schedule, sessionMinutes: 0 } } },
        { name: 'ok' },
      ]
      for (const body of bad) {
        const response = await put(target, cookie, '/grid-templates', 'POST', body)
        expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400)
      }
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('acepta una plantilla sin horarios ni clases de peso', async () => {
    const { target, cookie } = await setup()
    try {
      const { weightClasses: _classes, schedule: _schedule, ...minimal } = CONFIG
      const response = await put(target, cookie, '/grid-templates', 'POST', {
        name: 'Mínima',
        config: minimal,
      })
      expect(response.status).toBe(200)
    } finally {
      await target.close()
    }
  })

  it('borrar exige un uuid válido y permiso de edición de eventos', async () => {
    const { target, cookie, supabase } = await setup()
    try {
      const invalid = await put(target, cookie, '/grid-templates/no-es-uuid', 'DELETE')
      expect(invalid.status).toBe(400)
      expect(supabase.rpc).not.toHaveBeenCalled()

      const ok = await put(target, cookie, `/grid-templates/${TEMPLATE_ID}`, 'DELETE')
      expect(ok.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledWith('staff_delete_grid_template', {
        p_event_slug: SLUG,
        p_template_id: TEMPLATE_ID,
        p_actor: expect.stringContaining(':admin_maximal@platforms.test'),
      })
    } finally {
      await target.close()
    }

    const readOnly = await setup('plu_arg')
    try {
      const save = await put(readOnly.target, readOnly.cookie, '/grid-templates', 'POST', {
        name: 'x',
        config: CONFIG,
      })
      const remove = await put(readOnly.target, readOnly.cookie, `/grid-templates/${TEMPLATE_ID}`, 'DELETE')
      expect(save.status).toBe(403)
      expect(remove.status).toBe(403)
      expect(readOnly.supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await readOnly.target.close()
    }
  })

  it('sin sesión no se lee ni se escribe ninguna plantilla', async () => {
    const { target } = await setup()
    try {
      const read = await fetch(`${target.url}/api/events/${SLUG}/grid-templates`)
      const write = await fetch(`${target.url}/api/events/${SLUG}/grid-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', config: CONFIG }),
      })
      expect([401, 403]).toContain(read.status)
      expect([401, 403]).toContain(write.status)
    } finally {
      await target.close()
    }
  })
})
