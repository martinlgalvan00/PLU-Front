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
  it('firma las fotos del spotlight en lote y reutiliza la URL en el proceso caliente', async () => {
    const createSignedUrls = vi.fn(async (paths) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
      error: null,
    }))
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
        storage: { from: vi.fn(() => ({ createSignedUrls })) },
      }),
    })

    const first = await repository.getSpotlight(2)
    const second = await repository.getSpotlight(2)

    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(
      ['spotlight/ana.jpg', 'spotlight/bruno.jpg'],
      3600,
    )
    expect(first.members[0]).toMatchObject({ photoUrl: 'https://signed.test/spotlight/ana.jpg' })
    expect(second.members[0]).not.toHaveProperty('photoPath')
  })
})
