import { afterEach, describe, expect, it, vi } from 'vitest'

describe('communityService', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('respeta el spotlight vacio de Supabase y no lo reemplaza por afiliados mock', async () => {
    vi.doMock('../src/lib/api.js', () => ({
      apiGet: vi.fn(async () => ({
        members: [],
        stats: {
          activeGymCount: 0,
          memberCount: 0,
          provinceCount: 0,
        },
      })),
    }))

    const { fetchCommunitySpotlight, getRecentMembers } = await import('../src/services/communityService.js')
    const spotlight = await fetchCommunitySpotlight(5, 'es')

    expect(spotlight.source).toBe('supabase')
    expect(spotlight.members).toEqual([])
    expect(spotlight.members).not.toEqual(getRecentMembers(5, 'es'))
    expect(spotlight.stats).toEqual({
      activeGymCount: 0,
      memberCount: 0,
      provinceCount: 0,
    })
  })

  it('usa fallback editorial solo cuando falla la API publica', async () => {
    vi.doMock('../src/lib/api.js', () => ({
      apiGet: vi.fn(async () => {
        throw new Error('offline')
      }),
    }))

    const { fetchCommunitySpotlight, getRecentMembers } = await import('../src/services/communityService.js')
    const spotlight = await fetchCommunitySpotlight(5, 'es')

    expect(spotlight.source).toBe('fallback')
    expect(spotlight.members).toEqual(getRecentMembers(5, 'es'))
  })
})
