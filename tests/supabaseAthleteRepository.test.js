import { describe, expect, it, vi } from 'vitest'
import { createSupabaseAthleteRepository } from '../server/modules/athletes/supabaseAthleteRepository.js'

function athleteQuery(rows) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: () => Promise.resolve({ data: rows, error: null }),
    // Sin range (atletas/membresías) el order es thenable.
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  }
  return query
}

describe('supabase athlete repository admin snapshot', () => {
  it('adjunta URLs estables al proxy sin firmar Storage', async () => {
    let signedUrlCalls = 0
    const client = {
      from: (table) => {
        expect(table).toBe('athletes')
        return athleteQuery([
          { id: 'a1', full_name: 'Ana', photo_path: 'cache-test/a1.jpg' },
          { id: 'a2', full_name: 'Bruno', photo_path: 'cache-test/a2.jpg' },
        ])
      },
      storage: {
        from: () => ({
          createSignedUrls: async () => {
            signedUrlCalls += 1
            throw new Error('no debería firmar fotos del padrón')
          },
        }),
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    const scope = {
      athletes: true,
      memberships: false,
      registrations: false,
      paymentOrders: false,
    }

    const first = await repository.adminData(scope)
    const second = await repository.adminData(scope)

    expect(signedUrlCalls).toBe(0)
    expect(first.athletes.map((athlete) => athlete.photo_url)).toEqual([
      '/api/athletes/portrait?p=cache-test%2Fa1.jpg',
      '/api/athletes/portrait?p=cache-test%2Fa2.jpg',
    ])
    expect(second.athletes[0].photo_url).toBe('/api/athletes/portrait?p=cache-test%2Fa1.jpg')
  })

  it('también adjunta URL estable cuando el poll pide photos=0', async () => {
    const client = {
      from: () => athleteQuery([{ id: 'a1', full_name: 'Ana', photo_path: 'cache-test/a1.jpg' }]),
      storage: {
        from: () => ({
          createSignedUrls: async () => {
            throw new Error('el poll no debería firmar fotos')
          },
        }),
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    const payload = await repository.adminData(
      { athletes: true, memberships: false, registrations: false, paymentOrders: false },
      { photos: '0' },
    )

    expect(payload.athletes[0].photo_url).toBe('/api/athletes/portrait?p=cache-test%2Fa1.jpg')
    expect(payload.athletes[0].photo_path).toBe('cache-test/a1.jpg')
  })

  it('acota payment_orders con range por defecto', async () => {
    const ranges = []
    const client = {
      from: (table) => {
        if (table === 'athlete_payments') {
          const query = {
            select: () => query,
            in: () => query,
            order: async () => ({ data: [], error: null }),
          }
          return query
        }
        if (table !== 'athlete_payment_orders') {
          return athleteQuery([])
        }
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          range: (from, to) => {
            ranges.push([from, to])
            return Promise.resolve({
              data: [{ id: 'o1', athlete_id: 'a1', discount_code: null }],
              error: null,
            })
          },
        }
        return query
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    await repository.adminData(
      { athletes: false, memberships: false, registrations: false, paymentOrders: true },
      { photos: '0' },
    )
    expect(ranges).toEqual([[0, 499]])
  })

  it('acota atletas/membresías/inscripciones con la ventana por defecto y expone totals', async () => {
    // Sin `limit` explícito la primera carga ya no baja el padrón entero:
    // la ventana es de 400 y `totals` dice cuántas filas hay de verdad.
    const ranges = []
    const client = {
      from: (table) => {
        if (table === 'athlete_payments') {
          const query = {
            select: () => query,
            in: () => query,
            order: async () => ({ data: [], error: null }),
          }
          return query
        }
        if (table === 'athlete_payment_orders') {
          return athleteQuery([])
        }
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          range: (from, to) => {
            ranges.push([table, from, to])
            return Promise.resolve({ data: [], error: null, count: 640 })
          },
        }
        return query
      },
      storage: {
        from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }),
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    const payload = await repository.adminData(
      { athletes: true, memberships: true, registrations: true, paymentOrders: true },
      { photos: '0' },
    )

    expect(ranges).toEqual([
      ['athletes', 0, 399],
      ['memberships', 0, 399],
      ['event_registrations', 0, 399],
    ])
    expect(payload.totals).toEqual({
      athletes: 640,
      memberships: 640,
      registrations: 640,
      paymentOrders: 0,
    })
  })

  it('envía la búsqueda del padrón al servidor y sanitiza la sintaxis de or', async () => {
    const orFilters = []
    const client = {
      from: (table) => {
        if (table !== 'athletes') return athleteQuery([])
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          or: (filter) => {
            orFilters.push(filter)
            return query
          },
          range: () => Promise.resolve({ data: [], error: null, count: 1 }),
        }
        return query
      },
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    }
    const repository = createSupabaseAthleteRepository(client)
    // Las comas y paréntesis son sintaxis del filtro PostgREST, no contenido:
    // tienen que salir del término antes de viajar.
    await repository.adminData(
      { athletes: true, memberships: false, registrations: false, paymentOrders: false },
      { q: 'Díaz, María (PLU)', photos: '0' },
    )

    expect(orFilters).toHaveLength(1)
    expect(orFilters[0]).toBe(
      'full_name.ilike.%Díaz María PLU%,document_id.ilike.%Díaz María PLU%,email.ilike.%Díaz María PLU%',
    )
  })

  it('listPaymentOrders filtra por canal manual y ordena la cola de trabajo', async () => {
    const applied = { eq: [], order: [] }
    const client = {
      from: (table) => {
        expect(table).toBe('athlete_payment_orders')
        const query = {
          select: () => query,
          eq: (column, value) => {
            applied.eq.push([column, value])
            return query
          },
          in: () => query,
          not: () => query,
          order: (column, options) => {
            applied.order.push([column, options])
            return query
          },
          // `.limit` devuelve el builder (thenable), no una Promise nativa:
          // el repo sigue encadenando filtros después de acotar.
          limit: () => query,
          then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
        }
        return query
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    await repository.listPaymentOrders({
      statuses: ['pendiente', 'validacion_manual'],
      channel: 'cash_pitbull',
      sort: 'aging',
    })

    // El canal fija el método: sin `manual_link`, filas de Mercado Pago con
    // canal null colaban en el chip de efectivo.
    expect(applied.eq).toContainEqual(['method', 'manual_link'])
    expect(applied.eq).toContainEqual(['manual_payment_channel', 'cash_pitbull'])
    // Cola de trabajo: lo declarado más viejo primero, sin declaración al
    // final — no la cronología de creación.
    expect(applied.order[0]).toEqual([
      'manual_payment_declared_at',
      { ascending: true, nullsFirst: false },
    ])
  })

  it('arma una revision estable del scope para ETag', async () => {
    const client = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          limit: () =>
            Promise.resolve({
              data: [{ updated_at: '2026-08-01T12:00:00.000Z' }],
              error: null,
              count: 3,
            }),
        }
        return query
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    const revision = await repository.adminDataRevision({
      athletes: true,
      memberships: false,
      registrations: false,
      paymentOrders: true,
    })
    expect(revision).toBe(
      '3:2026-08-01T12:00:00.000Z|skip|skip|3:2026-08-01T12:00:00.000Z',
    )
  })

  it('firma solo paths que existen en el padrón', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [{ photo_path: 'cache-test/a1.jpg' }],
              error: null,
            }),
          }),
        }),
      }),
      storage: {
        from: () => ({
          createSignedUrls: async (paths) => ({
            data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
            error: null,
          }),
        }),
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    const urls = await repository.signAthletePhotoPaths(['cache-test/a1.jpg', 'ajeno/x.jpg'])

    expect(urls).toEqual({
      'cache-test/a1.jpg': '/api/athletes/portrait?p=cache-test%2Fa1.jpg',
    })
  })

  it('devuelve URLs estables de comprobantes sin firmar Storage', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: [
                { id: 'order-1', payment_proof_path: 'order-1/comprobante.jpg' },
                { id: 'order-2', payment_proof_path: null },
              ],
              error: null,
            }),
          }),
        }),
      }),
      storage: {
        from: () => ({
          createSignedUrls: async () => {
            throw new Error('no debería firmar comprobantes en lote')
          },
        }),
      },
    }
    const repository = createSupabaseAthleteRepository(client)
    await expect(repository.paymentProofUrls(['order-1', 'order-2'])).resolves.toEqual({
      'order-1': '/api/athletes/admin/payment-orders/order-1/proof',
    })
  })
})

describe('supabase athlete repository discount code policy', () => {
  it('ignora versiones archivadas cuando un código fue vuelto a publicar', async () => {
    const archivedFilter = vi.fn()
    const query = {
      select: () => query,
      eq: () => query,
      is(column, value) {
        archivedFilter(column, value)
        return query
      },
      maybeSingle: async () => ({
        data: {
          active: true,
          applies_to: 'combo',
          starts_at: null,
          expires_at: null,
          manual_channels: ['bank_transfer'],
          mercado_pago_enabled: false,
        },
        error: null,
      }),
    }
    const client = {
      from(table) {
        expect(table).toBe('discount_codes')
        return query
      },
    }
    const repository = createSupabaseAthleteRepository(client)

    await expect(
      repository.discountCodeChannelPolicy(' oferta-transfer ', 'combo'),
    ).resolves.toEqual({
      found: true,
      manualChannels: ['bank_transfer'],
      mercadoPagoEnabled: false,
    })
    expect(archivedFilter).toHaveBeenCalledWith('archived_at', null)
  })
})

describe('supabase athlete repository manual payment declaration', () => {
  it('confirma contra la RPC con la identidad del atleta y la orden', async () => {
    const rpc = vi.fn(async () => ({
      data: { order: { id: 'order-1', status: 'validacion_manual' } },
      error: null,
    }))
    const repository = createSupabaseAthleteRepository({ rpc })

    await expect(repository.confirmManualPayment('athlete-1', 'order-1')).resolves.toEqual({
      order: { id: 'order-1', status: 'validacion_manual' },
    })
    expect(rpc).toHaveBeenCalledWith('athlete_confirm_manual_payment', {
      p_order_id: 'order-1',
      p_athlete_id: 'athlete-1',
    })
  })
})

/**
 * El paquete de la oferta cuando el evento no tiene combo (20260913100000).
 * Antes esto era un 404 y obligaba a cargar un combo sólo para poder pactar un
 * precio con una persona.
 */
describe('supabase athlete repository combo bundle', () => {
  function eventClient(comboOffer, rpc) {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { id: 'event-1', comboOffer }, error: null }),
    }
    return {
      from(table) {
        expect(table).toBe('events')
        return query
      },
      rpc,
    }
  }

  const BUNDLE = {
    price: 150000,
    manualPrice: 140000,
    currency: 'ARS',
    audience: 'code',
    accessCode: null,
    financed: true,
    membershipPlanId: 'plan-1',
    codeId: 'code-1',
  }

  it('sin combo y sin atleta se comporta como antes: no hay paquete', async () => {
    const rpc = vi.fn()
    const repository = createSupabaseAthleteRepository(eventClient(null, rpc))

    await expect(repository.findEventComboOffer('pitbull-classic')).resolves.toBeNull()
    // No se consulta la llave de nadie: sin atleta la pregunta no tiene sujeto.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sin combo cotiza el paquete de la llave que el atleta ya canjeó', async () => {
    const rpc = vi.fn(async () => ({ data: BUNDLE, error: null }))
    const repository = createSupabaseAthleteRepository(eventClient(null, rpc))

    await expect(
      repository.findEventComboOffer('pitbull-classic', { athleteId: 'athlete-1' }),
    ).resolves.toEqual({
      price: 150000,
      manualPrice: 140000,
      currency: 'ARS',
      audience: 'code',
      accessCode: null,
      financed: true,
    })
    expect(rpc).toHaveBeenCalledWith('athlete_event_offer_bundle', {
      p_organization_id: expect.any(String),
      p_athlete_id: 'athlete-1',
      p_event_slug: 'pitbull-classic',
    })
  })

  it('un combo apagado tampoco bloquea a quien tiene la llave', async () => {
    const rpc = vi.fn(async () => ({ data: BUNDLE, error: null }))
    const repository = createSupabaseAthleteRepository(
      eventClient({ price: 140000, active: false, audience: 'code' }, rpc),
    )

    await expect(
      repository.findEventComboOffer('pitbull-classic', { athleteId: 'athlete-1' }),
    ).resolves.toMatchObject({ price: 150000 })
  })

  it('un combo privado sigue fuera de todo canal, con llave o sin ella', async () => {
    // Privado es una decisión explícita del panel: ninguna oferta la reabre.
    const rpc = vi.fn()
    const repository = createSupabaseAthleteRepository(
      eventClient({ price: 130000, active: true, audience: 'private' }, rpc),
    )

    await expect(
      repository.findEventComboOffer('pitbull-classic', { athleteId: 'athlete-1' }),
    ).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('con combo vigente manda el combo y no se pregunta por la llave', async () => {
    const rpc = vi.fn()
    const repository = createSupabaseAthleteRepository(
      eventClient(
        {
          price: 140000,
          manual_price: 130000,
          currency: 'ARS',
          active: true,
          audience: 'code',
          access_code: 'ONLY-PITBULL',
          financed: false,
        },
        rpc,
      ),
    )

    await expect(
      repository.findEventComboOffer('pitbull-classic', { athleteId: 'athlete-1' }),
    ).resolves.toEqual({
      price: 140000,
      manualPrice: 130000,
      currency: 'ARS',
      audience: 'code',
      accessCode: 'ONLY-PITBULL',
      financed: false,
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
