import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  abbreviatePublicMemberName,
  createSupabaseCommunityRepository,
} from '../server/modules/community/supabaseCommunityRepository.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

describe('community spotlight', () => {
  it('abrevia el nombre público sin exponer el apellido completo', () => {
    expect(abbreviatePublicMemberName('Martina Rivas')).toBe('Martina R.')
    expect(abbreviatePublicMemberName('Nicolás')).toBe('Nicolás')
    expect(abbreviatePublicMemberName('')).toBe('Atleta')
  })

  it('expone GET /api/community/spotlight sin auth y sin datos sensibles', async () => {
    const communityRepository = {
      getSpotlight: vi.fn(async () => ({
        members: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Martina R.',
            gym: 'Maximal Power',
            province: 'Buenos Aires',
            affiliatedAt: '2026-02-01',
          },
        ],
        stats: { memberCount: 12, activeGymCount: 4, provinceCount: 3 },
      })),
    }

    const target = listen(createApp({ communityRepository }))
    const response = await fetch(`${target.url}/api/community/spotlight?limit=5`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(communityRepository.getSpotlight).toHaveBeenCalledWith(5)
    expect(body.members[0]).toMatchObject({
      name: 'Martina R.',
      gym: 'Maximal Power',
      province: 'Buenos Aires',
    })
    expect(body.members[0]).not.toHaveProperty('documentId')
    expect(body.members[0]).not.toHaveProperty('email')
    expect(body.members[0]).not.toHaveProperty('memberCode')
    expect(body.stats).toEqual({
      memberCount: 12,
      activeGymCount: 4,
      provinceCount: 3,
    })

    await target.close()
  })
  it('expone una URL estable del propio API en vez de una firma de Storage', async () => {
    const repository = createSupabaseCommunityRepository({
      getSupabaseAdmin: () => ({
        rpc: vi.fn(async () => ({
          data: {
            members: [
              { id: 'a', name: 'Ana', photoPath: 'spotlight/ana.jpg' },
              { id: 'b', name: 'Bruno', photoPath: 'spotlight/bruno.jpg' },
            ],
            stats: {},
          },
          error: null,
        })),
      }),
    })

    const first = await repository.getSpotlight(2)
    const second = await repository.getSpotlight(2)

    expect(first.members[0]).toMatchObject({
      photoUrl: '/api/community/portrait?p=spotlight%2Fana.jpg',
    })
    expect(second.members[0].photoUrl).toBe(first.members[0].photoUrl)
    expect(second.members[0]).not.toHaveProperty('photoPath')
  })

  it('sirve el retrato público con cache de borde y sin token de Storage', async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: { id: 'ath-1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'mem-1' }, error: null }),
    }
    const download = vi.fn(async () => ({
      data: {
        type: 'image/webp',
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      },
      error: null,
    }))
    const target = listen(
      createApp({
        supabaseAdmin: {
          from: () => chain,
          storage: { from: () => ({ download }) },
        },
      }),
    )

    try {
      const response = await fetch(
        `${target.url}/api/community/portrait?p=${encodeURIComponent('ath-1/foto.webp')}`,
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toContain('s-maxage=86400')
      expect(response.headers.get('content-type')).toContain('image/webp')
      expect(download).toHaveBeenCalledWith('ath-1/foto.webp')
    } finally {
      await target.close()
    }
  })
})
