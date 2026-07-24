import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

describe('api health', () => {
  it('responde ok', async () => {
    const app = createApp()
    const server = app.listen(0)
    const { port } = server.address()

    const response = await fetch(`http://127.0.0.1:${port}/health`)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')

    await new Promise((resolve) => server.close(resolve))
  })

  it('expone health y readiness bajo /api para el deploy same-origin', async () => {
    const prisma = { $queryRaw: async () => [{ value: 1 }] }
    const supabaseAdmin = {
      from: () => ({
        select: () => ({
          limit: async () => ({ error: null }),
        }),
      }),
    }
    const server = createApp({ prisma, supabaseAdmin }).listen(0)
    const { port } = server.address()

    const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`)
    const readyResponse = await fetch(`http://127.0.0.1:${port}/api/ready`)

    expect(healthResponse.status).toBe(200)
    expect(healthResponse.headers.get('cache-control')).toBe('no-store')
    expect(readyResponse.status).toBe(200)
    expect(await readyResponse.json()).toMatchObject({
      status: 'ready',
      checks: { prisma: true, supabase: true },
    })

    await new Promise((resolve) => server.close(resolve))
  })
})
