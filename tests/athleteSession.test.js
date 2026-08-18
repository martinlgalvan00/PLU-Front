import { describe, expect, it, vi } from 'vitest'
import {
  createAthleteSession,
  getAthleteSessionCookieOptions,
  readAthleteSession,
} from '../server/services/athleteSessionService.js'

describe('sesion opaca de atleta', () => {
  it('persiste solo el hash y configura una cookie HttpOnly', async () => {
    let inserted
    const client = {
      from: () => ({
        insert: async (data) => {
          inserted = data
          return { data: null, error: null }
        },
      }),
    }
    const result = await createAthleteSession({
      client,
      athleteId: '11111111-1111-4111-8111-111111111111',
      req: { get: () => 'vitest', ip: '127.0.0.1' },
      now: new Date('2026-07-16T00:00:00Z'),
    })
    expect(result.token).toHaveLength(43)
    expect(inserted.token_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(inserted.token_hash).not.toContain(result.token)
    expect(getAthleteSessionCookieOptions({ NODE_ENV: 'production' })).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    })
  })

  it('rechaza una sesion vencida', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'ses-1',
        athlete_id: 'ath-1',
        expires_at: '2026-07-15T00:00:00Z',
        revoked_at: null,
      },
      error: null,
    })
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    }
    const result = await readAthleteSession({
      client,
      token: 'token',
      now: new Date('2026-07-16T00:00:00Z'),
    })
    expect(result).toBeNull()
  })
})
