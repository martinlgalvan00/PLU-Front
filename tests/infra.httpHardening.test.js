import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

/**
 * infra.httpHardening.test.js — PLU ARG
 *
 * La aplicacion levantada de verdad, respondiendo pedidos reales, sin base.
 *
 * Es la capa que ningun test de ruta mira: cabeceras de seguridad, CORS, limite
 * de cuerpo, forma del 404 y -- sobre todo -- que una ruta privada sin sesion
 * conteste 401 y no 500. La diferencia importa: un 500 significa que el guard
 * no corto y la request llego a tocar la base o el proveedor antes de romperse,
 * que es exactamente la clase de error que se convierte en filtracion cuando el
 * handler de abajo devuelve algo util.
 */

const ENV = { AUTH_SECRET: 'plu-http-hardening-tests', APP_URL: 'http://localhost:5173' }

let target

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

beforeAll(() => {
  target = listen(createApp({ env: ENV, supabaseAdmin: null }))
})

afterAll(async () => {
  await target?.close()
})

describe('endurecimiento HTTP de la aplicacion', () => {
  it('responde vida sin depender de la base', async () => {
    // `/api/health` es lo que mira el smoke de despliegue: tiene que contestar
    // aunque Supabase este caido, o cada incidente de base se vuelve un
    // rollback automatico.
    const response = await fetch(`${target.url}/api/health`)
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe('ok')
  })

  it('no revela el motor que corre detras', async () => {
    const response = await fetch(`${target.url}/api/health`)
    expect(response.headers.get('x-powered-by')).toBeNull()
  })

  it('manda las cabeceras de seguridad de helmet', async () => {
    const response = await fetch(`${target.url}/api/health`)
    // La CSP la define vercel.json (incluye los tiles del mapa): helmet no debe
    // emitir otra, porque el browser interseca las dos y rompe el mapa.
    expect(response.headers.get('content-security-policy')).toBeNull()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBeTruthy()
    expect(response.headers.get('x-frame-options')?.toLowerCase()).toBe('sameorigin')
  })

  it('correlaciona cada respuesta con un requestId', async () => {
    // Es la llave de toda la forense de cobros: sin esto, un error del socio no
    // se puede cruzar contra el log ni contra la bitacora.
    const response = await fetch(`${target.url}/api/health`)
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })

  it('rechaza un origen ajeno', async () => {
    const response = await fetch(`${target.url}/api/payments/plans`, {
      headers: { Origin: 'https://sitio-ajeno.example' },
    })
    expect(response.status).toBe(403)
  })

  it('rechaza una mutacion sin la marca de cliente confiable', async () => {
    // `requireTrustedMutation` corta los POST que no vienen del front (o de un
    // origen server-to-server declarado): es la defensa contra CSRF por
    // formulario cruzado.
    const response = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ email: 'nadie@pluarg.test', password: 'x' }),
    })
    expect(response.status).toBe(403)
  })

  it('corta un cuerpo desmedido antes de procesarlo', async () => {
    const response = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        'X-PLU-Request': 'browser',
      },
      body: JSON.stringify({ email: 'a@b.test', password: 'x'.repeat(200_000) }),
    })
    expect(response.status).toBe(413)
  })

  it('una ruta inexistente responde 404 sin filtrar el stack', async () => {
    const response = await fetch(`${target.url}/api/no-existe`)
    expect(response.status).toBe(404)
    const body = await response.text()
    expect(body).not.toMatch(/at \w+ \(/)
    expect(body).not.toContain('node_modules')
  })

  it('las rutas privadas contestan 401 sin sesion, no 500', async () => {
    // Sin cookie no hay nada que consultar: el guard tiene que cortar antes de
    // tocar Supabase (que en este test ni siquiera esta configurado).
    const privadas = [
      '/api/payments/operations',
      '/api/payments/subscriptions',
      '/api/athletes/admin/payment-orders',
      '/api/audit/overview',
      '/api/users',
    ]

    for (const path of privadas) {
      const response = await fetch(`${target.url}${path}`)
      expect([401, 403], `${path} respondio ${response.status}`).toContain(response.status)
    }
  })

  it('las acciones sobre plata contestan 401 sin sesion', async () => {
    const acciones = [
      '/api/payments/operations/recover',
      '/api/payments/operations/revalidate',
      '/api/payments/orders/3f7c6a41-2b8d-4e5f-9a1b-2c3d4e5f6a7b/revalidate',
    ]

    for (const path of acciones) {
      const response = await fetch(`${target.url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
          'X-PLU-Request': 'browser',
        },
        body: JSON.stringify({}),
      })
      expect([401, 403], `${path} respondio ${response.status}`).toContain(response.status)
    }
  })

  it('el webhook de Mercado Pago no acredita sin firma', async () => {
    // Los dos paths registrados en el panel del proveedor, incluido el alias
    // legacy: si uno solo quedara sin verificar, alcanzaria para acreditar
    // cualquier cosa.
    for (const path of ['/api/payments/webhook/mercadopago', '/api/payments/webhook']) {
      const response = await fetch(`${target.url}${path}?type=payment&data.id=1234`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, type: 'payment', data: { id: '1234' } }),
      })
      expect([400, 401, 503], `${path} respondio ${response.status}`).toContain(response.status)
    }
  })

  it('los jobs internos exigen el secreto del cron', async () => {
    const response = await fetch(`${target.url}/api/internal/jobs/payment-recovery`, {
      headers: { Authorization: 'Bearer no-es-el-secreto' },
    })
    expect([401, 403, 503]).toContain(response.status)
  })
})
