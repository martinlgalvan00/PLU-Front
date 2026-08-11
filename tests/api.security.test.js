import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import {
  isServerToServerMutationPath,
  resolveMutationPathname,
} from '../server/lib/security.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

describe('api security baseline', () => {
  it('resuelve el path de webhook Mercado Pago aunque originalUrl traiga query', () => {
    const req = {
      path: '/api/index',
      originalUrl: '/api/payments/webhook/mercadopago?data.id=1&type=payment',
      url: '/api/index?data.id=1&type=payment',
      get: () => undefined,
    }

    expect(resolveMutationPathname(req)).toBe('/api/payments/webhook/mercadopago')
    expect(isServerToServerMutationPath(req)).toBe(true)
  })

  it('oculta x-powered-by y aplica headers basicos', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/health`)

    expect(response.headers.get('x-powered-by')).toBeNull()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    // El CSP del documento vive en vercel.json (OpenFreeMap). La API no debe
    // emitir otra política que el browser intersecte y bloquee tiles.
    expect(response.headers.get('content-security-policy')).toBeNull()

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

  it('acepta orígenes locales de Vite fuera del 5173', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/api/payments/preferences`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5175',
        'Content-Type': 'application/json',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({}),
    })

    // Llega a validación de dominio (400), no se corta por CORS/origen.
    expect(response.status).toBe(400)

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

  it('permite el canal server-to-server pero rechaza webhooks sin firma', async () => {
    const target = listen(createApp({
      paymentRepository: {},
      mercadoPago: {},
      env: { MERCADO_PAGO_WEBHOOK_SECRET: 'test-secret' },
    }))

    const response = await fetch(`${target.url}/api/payments/webhook/mercadopago?data.id=mp-pay-001&type=payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'notification-1',
        type: 'payment',
        action: 'payment.updated',
        data: { id: 'mp-pay-001' },
      }),
    })

    expect(response.status).toBe(401)

    await target.close()
  })

  it('acepta el alias legacy /api/payments/webhook sin exigir header de browser', async () => {
    const target = listen(createApp({
      paymentRepository: {},
      mercadoPago: {},
      env: { MERCADO_PAGO_WEBHOOK_SECRET: 'test-secret' },
    }))

    const response = await fetch(`${target.url}/api/payments/webhook?data.id=mp-pay-001&type=payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'notification-legacy-1',
        type: 'payment',
        action: 'payment.updated',
        data: { id: 'mp-pay-001' },
      }),
    })

    expect(response.status).toBe(401)

    await target.close()
  })

  it('protege la consola operativa de Mercado Pago con sesion y rol', async () => {
    const target = listen(createApp({ paymentRepository: {} }))

    const response = await fetch(`${target.url}/api/payments/operations`)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'No autenticado.' })

    await target.close()
  })
})
