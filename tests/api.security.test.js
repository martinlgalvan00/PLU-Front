import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

describe('api security baseline', () => {
  it('oculta x-powered-by y aplica headers basicos', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/health`)

    expect(response.headers.get('x-powered-by')).toBeNull()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')

    await target.close()
  })

  it('responde 404 json consistente', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/no-existe`)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Ruta no encontrada' })

    await target.close()
  })

  it('rechaza mutaciones cross-origin sin origen permitido', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/api/payments/preferences`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(403)

    await target.close()
  })

  it('rechaza mutaciones browser sin header custom anti-csrf', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/api/payments/preferences`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Solicitud no confiable' })

    await target.close()
  })

  it('permite mutaciones browser con origen y header confiables hasta validacion de dominio', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/api/payments/preferences`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(400)

    await target.close()
  })

  it('permite webhooks server-to-server sin header browser', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: 'mp-pay-001', type: 'payment', status: 'approved' }),
    })

    expect(response.status).toBe(202)

    await target.close()
  })
})
