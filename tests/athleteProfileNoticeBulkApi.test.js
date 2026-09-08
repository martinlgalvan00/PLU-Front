import { describe, expect, it, vi } from 'vitest'

const apiPost = vi.fn()

vi.mock('../src/lib/api.js', () => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiGetMeta: vi.fn(),
  apiPatch: vi.fn(),
  apiPost,
  apiRequest: vi.fn(),
}))

const { sendAthleteProfileNoticesBulk } = await import('../src/services/athleteApi.js')

function ids(count) {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  )
}

describe('sendAthleteProfileNoticesBulk', () => {
  it('parte 201 ids en 5 requests de hasta 50', async () => {
    apiPost.mockImplementation(async (_url, body) => ({
      sent: body.athleteIds.map((athleteId) => ({
        athleteId,
        notice: { id: `notice-${athleteId}`, athlete_id: athleteId },
      })),
      skipped: [],
      failed: [],
    }))

    const athleteIds = ids(201)
    const progress = []
    const result = await sendAthleteProfileNoticesBulk(athleteIds, 'Completá tu cuenta.', {
      onProgress: (step) => progress.push(step),
    })

    expect(apiPost).toHaveBeenCalledTimes(5)
    expect(apiPost.mock.calls[0][1].athleteIds).toHaveLength(50)
    expect(apiPost.mock.calls[4][1].athleteIds).toHaveLength(1)
    expect(result.sent).toHaveLength(201)
    expect(progress).toEqual([
      { from: 1, to: 50, total: 201 },
      { from: 51, to: 100, total: 201 },
      { from: 101, to: 150, total: 201 },
      { from: 151, to: 200, total: 201 },
      { from: 201, to: 201, total: 201 },
    ])
  })

  it('conserva lo enviado si un lote posterior falla', async () => {
    apiPost.mockReset()
    apiPost
      .mockResolvedValueOnce({
        sent: ids(50).map((athleteId) => ({
          athleteId,
          notice: { id: `notice-${athleteId}`, athlete_id: athleteId },
        })),
        skipped: [],
        failed: [],
      })
      .mockRejectedValueOnce(new Error('rate limited'))

    await expect(sendAthleteProfileNoticesBulk(ids(51), 'Nota')).rejects.toMatchObject({
      message: 'rate limited',
      partial: { sent: { length: 50 }, remaining: 1 },
    })
  })
})
