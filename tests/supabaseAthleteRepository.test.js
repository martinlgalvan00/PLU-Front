import { describe, expect, it, vi } from 'vitest'
import { createSupabaseAthleteRepository } from '../server/modules/athletes/supabaseAthleteRepository.js'

function athleteQuery(rows) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => Promise.resolve({ data: rows, error: null }),
  }
  return query
}

describe('supabase athlete repository admin snapshot', () => {
  it('firma fotos en lote y reutiliza las URLs mientras siguen vigentes', async () => {
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
        from: (bucket) => {
          expect(bucket).toBe('athlete-photos')
          return {
            createSignedUrls: async (paths) => {
              signedUrlCalls += 1
              return {
                data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
                error: null,
              }
            },
          }
        },
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

    expect(signedUrlCalls).toBe(1)
    expect(first.athletes.map((athlete) => athlete.photo_url)).toEqual([
      'https://signed.test/cache-test/a1.jpg',
      'https://signed.test/cache-test/a2.jpg',
    ])
    expect(second.athletes[0].photo_url).toBe('https://signed.test/cache-test/a1.jpg')
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
