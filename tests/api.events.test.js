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
      membership: 75000,
      registration: 75000,
      combo: 120000,
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
    price: 75000,
    currency: 'ARS',
    rules: {
      featured: true,
      membershipPrice: 75000,
      comboPrice: 120000,
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

function createSupabaseDouble({ rpcResult, publishedRows, storageFiles = [] } = {}) {
  const rows = [canonicalEvent()]
  const published =
    publishedRows ??
    rows.map((row) => ({
      ...row,
      published: true,
      registration_opens_at: '2026-08-20T10:00:00-03:00',
    }))
  const orderAll = vi.fn(async () => ({ data: rows, error: null }))
  const orderPublished = vi.fn(async () => ({ data: published, error: null }))
  const inFilter = vi.fn(() => ({ order: orderPublished }))
  const eq = vi.fn(() => ({ in: inFilter }))
  const select = vi.fn(() => ({ order: orderAll, eq }))
  const rpc = vi.fn(async () => rpcResult ?? { data: { id: EVENT_ID }, error: null })
  const list = vi.fn(async () => ({ data: storageFiles, error: null }))
  const remove = vi.fn(async () => ({ data: [], error: null }))
  const storage = { from: vi.fn(() => ({ list, remove })) }

  return {
    client: { from: vi.fn(() => ({ select })), rpc, storage },
    rpc,
    eq,
    inFilter,
    orderPublished,
    storage,
    list,
    remove,
  }
}

async function setup(role = 'admin_maximal', supabaseOptions, extraUsers = []) {
  const staff = await buildStaffUser({ role, email: `${role}@events.test` })
  const users = [staff, ...extraUsers]
  const prisma = createPrismaDouble(users)
  const supabase = createSupabaseDouble(supabaseOptions)
  const target = listen(createApp({ prisma, supabaseAdmin: supabase.client }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })

  // El login gasta RPCs propias del guard de identidad
  // (`inspect_identity_lock` / `clear_identity_failures`, ver
  // `lib/defense/identityGuard.js`). Son del armado del fixture, no de lo que
  // cada test mide, así que el contador arranca en cero después de loguear:
  // los `expect(supabase.rpc).not.toHaveBeenCalled()` siguen afirmando lo mismo
  // de siempre -- que un request denegado no llega a ninguna RPC de dominio.
  supabase.rpc.mockClear()

  return { target, cookie, supabase, prisma, users }
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

  it('expone catálogo público con registration_opens_at sin autenticación', async () => {
    const { target, supabase } = await setup()

    try {
      const response = await fetch(`${target.url}/api/events/catalog`)
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(supabase.eq).toHaveBeenCalledWith('published', true)
      expect(supabase.inFilter).toHaveBeenCalledWith('event_registrations.status', [
        'pendiente_pago',
        'pagada',
        'confirmada',
      ])
      expect(response.headers.get('cache-control')).toContain('s-maxage=30')
      expect(body.events[0]).toMatchObject({
        id: EVENT_ID,
        registration_opens_at: '2026-08-20T10:00:00-03:00',
        published: true,
      })
    } finally {
      await target.close()
    }
  })

  /**
   * El hook de cupo repregunta cada 30 s por visitante. En una difusión eso es
   * una invocación de la función y una consulta a la base por cada persona
   * mirando la misma pantalla, todas para el mismo número: con `s-maxage` el
   * borde las colapsa en una sola por ventana.
   */
  it('deja que el borde absorba el poll público de cupo', async () => {
    const supabase = createSupabaseDouble({
      rpcResult: {
        data: { capacity: 120, registered: 48, remaining: 72, recent: [] },
        error: null,
      },
    })
    const target = listen(
      createApp({ prisma: createPrismaDouble([]), supabaseAdmin: supabase.client }),
    )

    try {
      const response = await fetch(
        `${target.url}/api/events/pitbull-classic-2026/registration-summary`,
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('s-maxage=10')
      // El navegador revalida siempre: al volver a la pestaña el cupo tiene que
      // ser el del momento, no uno servido desde el disco del cliente.
      expect(response.headers.get('cache-control')).toContain('max-age=0')
    } finally {
      await target.close()
    }
  })

  /**
   * El borde no distingue quién pregunta. Si una respuesta que depende de la
   * sesión saliera con `public`, el CDN se la serviría al visitante siguiente:
   * la lista completa de inscripciones del panel, a cualquiera.
   */
  it('nunca marca como pública una respuesta que depende de la sesión', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/events`, { headers: { Cookie: cookie } })

      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control') ?? '').not.toContain('public')
      expect(response.headers.get('cache-control') ?? '').not.toContain('s-maxage')
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

  it('expone el impacto del borrado sin tocar nada', async () => {
    const { target, cookie, supabase } = await setup('admin_maximal', {
      rpcResult: {
        data: {
          id: EVENT_ID,
          slug: 'pitbull-classic-2026',
          impact: { registrations: 48, tickets: 12, checkIns: 0 },
          requiresForce: false,
          deleted: false,
        },
        error: null,
      },
    })

    try {
      const response = await fetch(`${target.url}/api/events/pitbull-classic-2026/delete-impact`, {
        headers: { Cookie: cookie },
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.impact).toMatchObject({ requiresForce: false, deleted: false })
      expect(supabase.rpc).toHaveBeenCalledWith(
        'delete_event',
        expect.objectContaining({
          p_event_slug: 'pitbull-classic-2026',
          p_dry_run: true,
          p_force: false,
        }),
      )
    } finally {
      await target.close()
    }
  })

  it('elimina el evento, limpia comprobantes y purga las cuentas de puerta', async () => {
    const securityUser = await buildStaffUser({
      role: 'seguridad_plu_arg',
      email: 'puerta@events.test',
      eventId: EVENT_ID,
      eventSlug: 'pitbull-classic-2026',
    })
    const { target, cookie, supabase, users } = await setup(
      'admin_maximal',
      {
        rpcResult: {
          data: {
            id: EVENT_ID,
            slug: 'pitbull-classic-2026',
            title: 'Pitbull Classic',
            proofOrderIds: ['44444444-4444-4444-8444-444444444444'],
            deleted: true,
          },
          error: null,
        },
        storageFiles: [{ name: 'comprobante.pdf' }],
      },
      [securityUser],
    )

    try {
      const response = await fetch(`${target.url}/api/events/pitbull-classic-2026`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.deletedEvent).toMatchObject({ id: EVENT_ID, deleted: true, securityUsers: 1 })
      // La colección canónica vuelve en la misma respuesta: el panel no puede
      // quedar mostrando la fila que acaba de borrar.
      expect(body.events).toHaveLength(1)
      expect(supabase.rpc).toHaveBeenCalledWith(
        'delete_event',
        expect.objectContaining({
          p_event_slug: 'pitbull-classic-2026',
          p_dry_run: false,
          p_force: false,
          p_actor: expect.stringContaining(':admin_maximal@events.test'),
        }),
      )
      expect(supabase.remove).toHaveBeenCalledWith([
        '44444444-4444-4444-8444-444444444444/comprobante.pdf',
      ])
      expect(users.some((user) => user.role === 'seguridad_plu_arg')).toBe(false)
    } finally {
      await target.close()
    }
  })

  it('propaga el consentimiento explícito a la base', async () => {
    const { target, cookie, supabase } = await setup()

    try {
      const response = await fetch(`${target.url}/api/events/pitbull-classic-2026?force=true`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledWith(
        'delete_event',
        expect.objectContaining({ p_force: true }),
      )
    } finally {
      await target.close()
    }
  })

  it('devuelve 409 cuando el evento tiene actividad y falta la confirmación', async () => {
    const { target, cookie } = await setup('admin_maximal', {
      rpcResult: {
        data: null,
        error: {
          code: 'PLU03',
          message: 'El evento ya tiene actividad real (12 inscripciones pagadas...).',
        },
      },
    })

    try {
      const response = await fetch(`${target.url}/api/events/pitbull-classic-2026`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'PLU03' })
    } finally {
      await target.close()
    }
  })

  it('reserva el borrado a Super Admin: editar eventos no alcanza', async () => {
    // admin_plu_arg tiene todos los permisos, incluido admin.events.write: si
    // el guard fuera por permiso y no por rol, este test pasaría igual.
    const { target, cookie, supabase } = await setup('admin_plu_arg')

    try {
      const impact = await fetch(`${target.url}/api/events/pitbull-classic-2026/delete-impact`, {
        headers: { Cookie: cookie },
      })
      const removal = await fetch(`${target.url}/api/events/pitbull-classic-2026`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(impact.status).toBe(403)
      expect(removal.status).toBe(403)
      expect(supabase.rpc).not.toHaveBeenCalled()
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

describe('control de estado: requisito de afiliación', () => {
  /**
   * Habilitar o deshabilitar un meet como "solo afiliados" era lo único de la
   * operación diaria que obligaba a pasar por `/upsert`, que recrea días,
   * tandas y tipos de entrada en cada guardado. Este test fija que el camino
   * quirúrgico existe y que llega a la RPC como un campo propio.
   */
  it('propaga requiresMembership a staff_set_event_state sin tocar el resto', async () => {
    const { target, cookie, supabase } = await setup('admin_maximal', {
      rpcResult: { data: { event: { id: EVENT_ID }, statusOverridden: false }, error: null },
    })

    try {
      const response = await fetch(`${target.url}/api/events/pitbull-classic-2026/state`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ requiresMembership: false }),
      })

      expect(response.status).toBe(200)
      expect(supabase.rpc).toHaveBeenCalledWith(
        'staff_set_event_state',
        expect.objectContaining({
          p_event_slug: 'pitbull-classic-2026',
          p_requires_membership: false,
          // Lo que el operador no tocó viaja en null: la RPC hace coalesce y
          // no puede pisar el estado ni la publicación por efecto colateral.
          p_status: null,
          p_published: null,
        }),
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza un cambio de estado vacío antes de llegar a la RPC', async () => {
    const { target, cookie, supabase } = await setup()

    try {
      const response = await fetch(`${target.url}/api/events/pitbull-classic-2026/state`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
      expect(supabase.rpc).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('migración 20260826100000 (requisito de afiliación en el estado)', () => {
  const migration = readFileSync(
    resolve('supabase/migrations/20260826100000_event_state_requires_membership.sql'),
    'utf8',
  )

  it('borra la firma de cuatro argumentos antes de recrear la función', () => {
    const dropAt = migration.indexOf(
      'drop function if exists public.staff_set_event_state(text, text, boolean, text);',
    )
    const createAt = migration.indexOf('create or replace function public.staff_set_event_state')
    expect(dropAt).toBeGreaterThan(-1)
    expect(createAt).toBeGreaterThan(dropAt)
  })

  it('aplica requires_membership con coalesce y lo suma al guard de cambio vacío', () => {
    expect(migration).toContain(
      'requires_membership = coalesce(p_requires_membership, requires_membership)',
    )
    expect(migration).toContain(
      'if p_status is null and p_published is null and p_requires_membership is null then',
    )
  })

  // Cambiar el requisito decide quién pasa la puerta el día del meet: el cambio
  // tiene que poder reconstruirse desde el log de dominio.
  it('audita el valor anterior y el nuevo', () => {
    expect(migration).toContain("'requiresMembershipFrom', v_before.requires_membership")
    expect(migration).toContain("'requiresMembershipTo', v_event.requires_membership")
  })

  it('deja los permisos solo en service_role para la firma nueva', () => {
    expect(migration).toContain(
      'revoke all on function public.staff_set_event_state(text, text, boolean, boolean, text)',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_set_event_state(text, text, boolean, boolean, text)',
    )
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

describe('migración 20260815110000 (borrado definitivo de eventos)', () => {
  const migration = readFileSync(
    resolve('supabase/migrations/20260815110000_event_hard_delete.sql'),
    'utf8',
  )

  it('borra en el orden que exigen las FK restrict', () => {
    const order = [
      'delete from public.check_ins',
      'delete from public.ticket_payments',
      'delete from public.tickets',
      'delete from public.ticket_orders',
      'delete from public.event_registrations',
      'delete from public.event_sessions',
      'delete from public.ticket_types',
      'delete from public.event_days',
      'delete from public.events',
    ]
    const positions = order.map((statement) => migration.indexOf(statement))

    expect(positions.every((position) => position > 0)).toBe(true)
    // tickets antes que ticket_types y event_sessions antes que event_days: las
    // dos parejas están unidas por FK restrict aunque caigan por cascade.
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  it('bloquea la fila, exige confirmación con actividad real y restringe la RPC', () => {
    expect(migration).toContain('for update')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("errcode = 'PLU02'")
    expect(migration).toContain("errcode = 'PLU03'")
    expect(migration).toContain('if v_requires_force and not coalesce(p_force, false) then')
    expect(migration).toContain("'event.deleted'")
    expect(migration).toContain(
      'revoke all on function public.delete_event(text, text, boolean, boolean)',
    )
    expect(migration).toContain(
      'grant execute on function public.delete_event(text, text, boolean, boolean)',
    )
    expect(migration).toContain('to service_role')
  })

  it('el dry run no borra: sale antes de cualquier delete', () => {
    const dryRunReturn = migration.indexOf('if p_dry_run then')
    const firstDelete = migration.indexOf('delete from public.check_ins')

    expect(dryRunReturn).toBeGreaterThan(0)
    expect(dryRunReturn).toBeLessThan(firstDelete)
  })
})
