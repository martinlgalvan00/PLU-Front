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
})
