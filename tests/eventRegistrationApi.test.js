import { describe, expect, it, vi } from 'vitest'

const apiGet = vi.fn()

vi.mock('../src/lib/api.js', () => ({
  apiGet,
  apiPost: vi.fn(),
}))

const { fetchEventRegistrationSummary } = await import('../src/services/eventRegistrationApi.js')

describe('fetchEventRegistrationSummary', () => {
  it('conserva la foto temporal del atleta sin exponer una ruta de storage', async () => {
    apiGet.mockResolvedValue({
      summary: {
        capacity: 80,
        registered: 1,
        remaining: 79,
        recent: [
          {
            displayName: 'Ana T.',
            gym: 'Fuerza Sur',
            photoUrl: 'https://storage.example.test/portrait?token=temporary',
            photoPath: 'ath-1/private-photo.jpg',
            registeredAt: '2026-08-21T12:00:00Z',
          },
        ],
      },
    })

    await expect(fetchEventRegistrationSummary('pitbull-classic-2026')).resolves.toEqual({
      capacity: 80,
      registered: 1,
      registeredToday: 0,
      remaining: 79,
      progressPublic: true,
      recent: [
        {
          displayName: 'Ana T.',
          gym: 'Fuerza Sur',
          photoUrl: 'https://storage.example.test/portrait?token=temporary',
          registeredAt: '2026-08-21T12:00:00Z',
        },
      ],
    })
    expect(apiGet).toHaveBeenCalledWith('/api/events/pitbull-classic-2026/registration-summary')
  })

  it('propaga progressPublic cuando el organizador oculta la ocupación', async () => {
    apiGet.mockResolvedValue({
      summary: {
        capacity: 180,
        registered: 50,
        remaining: 130,
        progressPublic: false,
        recent: [],
      },
    })

    await expect(fetchEventRegistrationSummary('pitbull-classic-2026')).resolves.toEqual({
      capacity: 180,
      registered: 50,
      registeredToday: 0,
      remaining: 130,
      progressPublic: false,
      recent: [],
    })
  })

  it('propaga registeredToday del summary', async () => {
    apiGet.mockResolvedValue({
      summary: {
        capacity: 180,
        registered: 12,
        registeredToday: 4,
        remaining: 168,
        progressPublic: true,
        recent: [],
      },
    })

    await expect(fetchEventRegistrationSummary('pitbull-classic-2026')).resolves.toMatchObject({
      registeredToday: 4,
    })
  })
})
