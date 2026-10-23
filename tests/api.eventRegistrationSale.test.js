import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
 * Control de venta por HTTP (`POST /api/events/:slug/state`): ventana de
 * inscripción ("Abrir ahora", "Programar") y la misma exigencia de cobro que el
 * editor al publicar.
 */

const EVENT_ID = '11111111-1111-4111-8111-111111111111'
const SLUG = 'pitbull-classic-2026'

function eventRow(overrides = {}) {
  return {
    id: EVENT_ID,
    slug: SLUG,
    title: 'Pitbull Classic',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    starts_at: '2026-08-15T12:00:00.000Z',
    ends_at: '2026-08-15T23:00:00.000Z',
    status: 'proximamente',
    published: false,
    capacity: 120,
    price: 75000,
    currency: 'ARS',
    rules: {},
    registration_opens_at: null,
    registration_closes_at: '2026-08-10T00:00:00.000Z',
    payment_channel_overrides: null,
    bank_transfer_alias: null,
    bank_transfer_cbu: null,
    bank_transfer_holder: null,
    bank_transfer_profile_id: null,
    cash_payment_place: null,
    capacityRules: [],
    eventRegistrations: [],
    eventDays: [],
    ticketTypes: [],
    ...overrides,
  }
}

/** Doble mínimo: lista de eventos, lectura por slug/id, update y RPCs por nombre. */
function supabaseDouble({ row = eventRow(), missingWindowRpc = false } = {}) {
  const updates = []
  const rpc = vi.fn(async (name) => {
    if (name === 'staff_set_event_registration_window' && missingWindowRpc) {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } }
    }
    if (name === 'staff_set_event_state') {
      return { data: { event: { id: EVENT_ID }, statusOverridden: false }, error: null }
    }
    return { data: { event: { id: EVENT_ID } }, error: null }
  })
  const single = async () => ({ data: row, error: null })
  const from = vi.fn(() => ({
    select: () => ({
      order: async () => ({ data: [row], error: null }),
      eq: () => ({
        maybeSingle: single,
        in: () => ({ order: async () => ({ data: [row], error: null }) }),
      }),
    }),
    update: (patch) => ({
      eq: async () => {
        updates.push(patch)
        return { data: null, error: null }
      },
    }),
  }))
  return { client: { from, rpc, storage: { from: () => ({}) } }, rpc, updates }
}

async function setup(options) {
  const staff = await buildStaffUser({ role: 'admin_maximal', email: 'admin@sale.test' })
  const prisma = createPrismaDouble([staff])
  const supabase = supabaseDouble(options)
  const target = listen(createApp({ prisma, supabaseAdmin: supabase.client }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  supabase.rpc.mockClear()
  return { target, cookie, supabase }
}

async function postState(ctx, body) {
  return fetch(`${ctx.target.url}/api/events/${SLUG}/state`, {
    method: 'POST',
    headers: authHeaders(ctx.cookie),
    body: JSON.stringify(body),
  })
}

describe('control de venta — ventana de inscripción', () => {
  it('"Abrir ahora" borra el cierre vencido y abre, en ese orden', async () => {
    const ctx = await setup()
    try {
      const response = await postState(ctx, {
        status: 'inscripcion_abierta',
        registrationClosesAt: null,
      })
      expect(response.status).toBe(200)
      const names = ctx.supabase.rpc.mock.calls.map(([name]) => name)
      expect(names).toEqual(['staff_set_event_registration_window', 'staff_set_event_state'])
      expect(ctx.supabase.rpc).toHaveBeenCalledWith(
        'staff_set_event_registration_window',
        expect.objectContaining({
          p_event_slug: SLUG,
          p_set_opens: false,
          p_set_closes: true,
          p_closes_at: null,
        }),
      )
    } finally {
      await ctx.target.close()
    }
  })

  it('"Programar" fija solo la apertura', async () => {
    const ctx = await setup()
    try {
      const response = await postState(ctx, {
        status: 'inscripcion_abierta',
        registrationOpensAt: '2026-08-01T13:00:00.000Z',
      })
      expect(response.status).toBe(200)
      expect(ctx.supabase.rpc).toHaveBeenCalledWith(
        'staff_set_event_registration_window',
        expect.objectContaining({
          p_set_opens: true,
          p_opens_at: '2026-08-01T13:00:00.000Z',
          p_set_closes: false,
        }),
      )
    } finally {
      await ctx.target.close()
    }
  })

  it('solo la ventana, sin estado: no llama a staff_set_event_state', async () => {
    const ctx = await setup()
    try {
      const response = await postState(ctx, { registrationOpensAt: '2026-08-01T13:00:00.000Z' })
      expect(response.status).toBe(200)
      expect(ctx.supabase.rpc.mock.calls.map(([name]) => name)).toEqual([
        'staff_set_event_registration_window',
      ])
    } finally {
      await ctx.target.close()
    }
  })

  it('rechaza un cierre anterior a la apertura antes de tocar la base', async () => {
    const ctx = await setup()
    try {
      const response = await postState(ctx, {
        registrationOpensAt: '2026-08-05T00:00:00.000Z',
        registrationClosesAt: '2026-08-01T00:00:00.000Z',
      })
      expect(response.status).toBe(400)
      expect(ctx.supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await ctx.target.close()
    }
  })

  it('sin la migración nueva escribe directo, validando contra lo guardado', async () => {
    const ctx = await setup({ missingWindowRpc: true })
    try {
      const ok = await postState(ctx, { registrationOpensAt: '2026-08-01T13:00:00.000Z' })
      expect(ok.status).toBe(200)
      expect(ctx.supabase.updates).toEqual([{ registration_opens_at: '2026-08-01T13:00:00.000Z' }])

      // El cierre guardado es el 10/08: abrir después de esa fecha es imposible.
      const bad = await postState(ctx, { registrationOpensAt: '2026-08-12T13:00:00.000Z' })
      expect(bad.status).toBe(400)
      expect(ctx.supabase.updates).toHaveLength(1)
    } finally {
      await ctx.target.close()
    }
  })
})

describe('control de venta — publicar exige cobro configurado', () => {
  const transferOpen = {
    registration: { bank_transfer: true },
  }

  it('rechaza publicar con la transferencia abierta y sin alias, como el editor', async () => {
    const ctx = await setup({ row: eventRow({ payment_channel_overrides: transferOpen }) })
    try {
      const response = await postState(ctx, { published: true })
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('EVENT_BANK_TRANSFER_ALIAS_REQUIRED')
      expect(ctx.supabase.rpc).not.toHaveBeenCalledWith('staff_set_event_state', expect.anything())
    } finally {
      await ctx.target.close()
    }
  })

  it('con alias cargado publica normalmente', async () => {
    const ctx = await setup({
      row: eventRow({ payment_channel_overrides: transferOpen, bank_transfer_alias: 'plu.pitbull' }),
    })
    try {
      const response = await postState(ctx, { published: true })
      expect(response.status).toBe(200)
      expect(ctx.supabase.rpc).toHaveBeenCalledWith(
        'staff_set_event_state',
        expect.objectContaining({ p_published: true }),
      )
    } finally {
      await ctx.target.close()
    }
  })

  it('despublicar no exige nada', async () => {
    const ctx = await setup({ row: eventRow({ payment_channel_overrides: transferOpen }) })
    try {
      expect((await postState(ctx, { published: false })).status).toBe(200)
    } finally {
      await ctx.target.close()
    }
  })
})

describe('migración 20261230100000 (ventana de inscripción)', () => {
  const sql = readFileSync(
    resolve('supabase/migrations/20261230100000_event_registration_window.sql'),
    'utf8',
  )

  it('solo toca la fecha pedida, valida el orden y audita', () => {
    expect(sql).toMatch(/case when coalesce\(p_set_opens, false\) then p_opens_at/)
    expect(sql).toMatch(/case when coalesce\(p_set_closes, false\) then p_closes_at/)
    expect(sql).toMatch(/v_closes < v_opens/)
    expect(sql).toContain("'event.registration_window_changed'")
    expect(sql).toContain('for update')
  })

  it('queda restringida a service_role', () => {
    expect(sql).toMatch(/revoke all on function public\.staff_set_event_registration_window[^;]+from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.staff_set_event_registration_window[^;]+to service_role/)
  })
})
