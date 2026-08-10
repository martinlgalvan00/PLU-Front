import { readFileSync, readdirSync } from 'node:fs'
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

const EVENT_ID = '11111111-1111-4111-8111-111111111111'

function eventPayload(overrides = {}) {
  return {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    description: 'Fecha nacional de powerlifting.',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    startsAt: '2026-08-15T09:00',
    endsAt: '2026-08-15T20:00',
    status: 'proximamente',
    published: false,
    slots: 120,
    featured: true,
    pricing: {
      membership: 38000,
      registration: 45000,
      combo: 78000,
      ticketsEnabled: true,
      ticketAddons: [{ id: 'food', label: 'Comida', price: 12000 }],
    },
    eventDays: [{ dayIndex: 0, label: 'Día 1', date: '2026-08-15' }],
    ticketTypes: [
      {
        name: 'Pase general',
        price: 20000,
        quota: 100,
        dayIndexes: [0],
        includedAddonIds: ['food'],
      },
    ],
    ...overrides,
  }
}

function canonicalEvent() {
  return {
    id: EVENT_ID,
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    starts_at: '2026-08-15T12:00:00.000Z',
    ends_at: '2026-08-15T23:00:00.000Z',
    status: 'proximamente',
    published: false,
    capacity: 120,
    price: 45000,
    currency: 'ARS',
    rules: {
      featured: true,
      membershipPrice: 38000,
      comboPrice: 78000,
      ticketsEnabled: true,
      ticketAddons: [{ id: 'food', label: 'Comida', price: 12000 }],
    },
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-26T12:00:00.000Z',
    capacityRules: [{ key: '', limit_count: 120 }],
    eventRegistrations: [
      ...Array.from({ length: 48 }, () => ({ status: 'confirmada' })),
      { status: 'cancelada' },
    ],
    eventDays: [
      {
        id: '22222222-2222-4222-8222-222222222222',
        day_index: 0,
        label: 'Día 1',
        date: '2026-08-15',
      },
    ],
    ticketTypes: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Pase general',
        price: 20000,
        quota: 100,
        sort_order: 0,
        active: true,
        ticketTypeDays: [{ event_day_id: '22222222-2222-4222-8222-222222222222' }],
        includedAddons: [{ addon_id: 'food' }],
      },
    ],
  }
}

function createSupabaseDouble({ rpcResult } = {}) {
  const rows = [canonicalEvent()]
  const order = vi.fn(async () => ({ data: rows, error: null }))
  const select = vi.fn(() => ({ order }))
  const rpc = vi.fn(async () => rpcResult ?? { data: { id: EVENT_ID }, error: null })

  return {
    client: { from: vi.fn(() => ({ select })), rpc },
    rpc,
  }
}

async function setup(role = 'admin_maximal', supabaseOptions) {
  const staff = await buildStaffUser({ role, email: `${role}@events.test` })
  const prisma = createPrismaDouble([staff])
  const supabase = createSupabaseDouble(supabaseOptions)
  const target = listen(createApp({ prisma, supabaseAdmin: supabase.client }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })

  return { target, cookie, supabase }
}

describe('API administrativa de eventos', () => {
  it('lee eventos completos con cupo, inscripciones y catálogo', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/events`, {
        headers: { Cookie: cookie },
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.events[0]).toMatchObject({ id: EVENT_ID, capacity: 120 })
      // El embed viaja con el status de cada inscripción: es lo que permite a
      // mapSupabaseEventRow contar solo las que realmente ocupan cupo.
      expect(body.events[0].eventRegistrations).toHaveLength(49)
      expect(body.events[0].eventRegistrations.at(-1)).toEqual({ status: 'cancelada' })
      expect(body.events[0].eventDays).toHaveLength(1)
      expect(body.events[0].ticketTypes).toHaveLength(1)
    } finally {
      await target.close()
    }
  })

  it('guarda por RPC con actor y devuelve la colección canónica', async () => {
    const { target, cookie, supabase } = await setup()

    try {
      const payload = eventPayload()
      const response = await fetch(`${target.url}/api/events/upsert`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(payload),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body).toMatchObject({
        mode: 'created',
        event: { id: EVENT_ID },
        events: [{ id: EVENT_ID }],
      })
      expect(supabase.rpc).toHaveBeenCalledWith(
        'staff_save_event',
        expect.objectContaining({
          p_event: expect.objectContaining({
            title: payload.title,
            description: payload.description,
            slots: 120,
            requiresMembership: true,
          }),
          p_actor: expect.stringContaining(':admin_maximal@events.test'),
        }),
      )
    } finally {
      await target.close()
    }
  })

  it('propaga conflictos de edición sin ocultar el código operativo', async () => {
    const { target, cookie } = await setup('admin_maximal', {
      rpcResult: {
        data: null,
        error: {
          code: 'PLU09',
          message: 'Otra persona modificó este evento.',
        },
      },
    })

    try {
      const response = await fetch(`${target.url}/api/events/upsert`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(
          eventPayload({
            id: EVENT_ID,
            expectedUpdatedAt: '2026-07-26T12:00:00.000Z',
          }),
        ),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        error: 'Otra persona modificó este evento.',
        code: 'PLU09',
      })
    } finally {
      await target.close()
    }
  })

  it('separa lectura de escritura por permiso', async () => {
    const { target, cookie, supabase } = await setup('plu_arg')

    try {
      const readResponse = await fetch(`${target.url}/api/events`, {
        headers: { Cookie: cookie },
      })
      const writeResponse = await fetch(`${target.url}/api/events/upsert`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(eventPayload()),
      })

      expect(readResponse.status).toBe(200)
      expect(writeResponse.status).toBe(403)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('migración de guardado seguro de eventos', () => {
  it('bloquea la fila, controla versión y restringe la RPC a service_role', () => {
    const migration = readFileSync(
      resolve('supabase/migrations/20260726120000_event_admin_safe_save.sql'),
      'utf8',
    )

    expect(migration).toContain('for update')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("errcode = 'PLU09'")
    expect(migration).toContain('v_existing.updated_at <> v_expected_updated_at')
    expect(migration).toContain('revoke all on function public.staff_save_event')
    expect(migration).toContain('grant execute on function public.staff_save_event(jsonb, text)')
    expect(migration).toContain('to service_role')
  })
})

describe('migración requiresMembership configurable', () => {
  // La regresión de 20260806230000 pasó porque este test leía la migración que
  // introdujo el fix, no la definición vigente: cualquier migración posterior
  // que recree `staff_upsert_event` desde una rama vieja lo pisa sin que nada
  // falle. Se asserta sobre la ÚLTIMA migración que define la función.
  it('la definición vigente no hardcodea requires_membership y lee el payload', () => {
    const migrationsDir = resolve('supabase/migrations')
    const latest = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => ({
        name,
        sql: readFileSync(resolve(migrationsDir, name), 'utf8'),
      }))
      .filter(({ sql }) => sql.includes('create or replace function public.staff_upsert_event'))
      .at(-1)

    expect(latest).toBeDefined()
    expect(latest.sql).toContain("coalesce((p_event ->> 'requiresMembership')::boolean, true)")
    expect(latest.sql).not.toMatch(
      /coalesce\(\(p_event ->> 'published'\)::boolean, false\),\s*true,/,
    )
    expect(latest.sql).toContain('grant execute on function public.staff_upsert_event(jsonb, text)')
    expect(latest.sql).toContain('to service_role')
  })
})

describe('migración 20260807160000 (endurecimiento de estado)', () => {
  it('statusOverridden compara contra el estado esperado, no solo contra p_status', () => {
    const migration = readFileSync(
      resolve('supabase/migrations/20260807160000_event_state_hardening.sql'),
      'utf8',
    )

    expect(migration).toContain(
      "'statusOverridden', v_event.status <> coalesce(p_status, v_before.status)",
    )
    expect(migration).toContain('select * into v_event from public.events where id = v_event.id')
    expect(migration).toContain(
      'grant execute on function public.staff_set_event_state(text, text, boolean, text)',
    )
    expect(migration).toContain('to service_role')
  })
})

describe('migración de edición integral y no destructiva', () => {
  it('persiste descripción y conserva tipos con tickets vendidos', () => {
    const migration = readFileSync(
      resolve('supabase/migrations/20260810130000_event_editor_full_update.sql'),
      'utf8',
    )

    expect(migration).toContain('slug, title, description, venue')
    expect(migration).toContain('description = excluded.description')
    expect(migration).toContain("v_requested_type_id := nullif(v_type ->> 'id', '')::uuid")
    expect(migration).toContain(
      'exists (select 1 from public.tickets t where t.ticket_type_id = tt.id)',
    )
    expect(migration).not.toContain('delete from public.ticket_types where event_id = v_event.id;')
  })
})
