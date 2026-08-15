import { describe, expect, it } from 'vitest'
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
