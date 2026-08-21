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
