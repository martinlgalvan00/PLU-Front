import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

describe('POST /api/launch-interest', () => {
  it('persiste un email nuevo y es idempotente en reintentos', async () => {
    const upsertInterest = vi
      .fn()
      .mockResolvedValueOnce({ created: true, email: 'agus@example.com' })
      .mockResolvedValueOnce({ created: false, email: 'agus@example.com' })

    const target = listen(
      createApp({
        launchInterestRepository: { upsertInterest },
      }),
    )
    try {
      const first = await fetch(`${target.url}/api/launch-interest`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          email: 'agus@example.com',
          source: 'home',
          eventSlug: 'pitbull-classic-2026',
        }),
      })
      const second = await fetch(`${target.url}/api/launch-interest`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          email: 'agus@example.com',
          source: 'home',
        }),
      })

      expect(first.status).toBe(201)
      expect(await first.json()).toMatchObject({
        ok: true,
        created: true,
        email: 'agus@example.com',
      })
      expect(second.status).toBe(200)
      expect(await second.json()).toMatchObject({ ok: true, created: false })
      expect(upsertInterest).toHaveBeenCalledTimes(2)
    } finally {
      await target.close()
    }
  })

  it('rechaza email invalido', async () => {
    const upsertInterest = vi.fn()
    const target = listen(
      createApp({
        launchInterestRepository: { upsertInterest },
      }),
    )
    try {
      const response = await fetch(`${target.url}/api/launch-interest`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({ email: 'no-es-mail' }),
      })
      expect(response.status).toBe(400)
      expect(upsertInterest).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})
