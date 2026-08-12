import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Contrato de `/api/analytics`.
 *
 * Lo que fijan estos tests no es el informe sino las dos garantias que hacen
 * que el informe sirva: que el visitante y la ruta los decida el servidor (si
 * los pusiera el navegador, las metricas serian falseables) y que el detalle
 * crudo, que tiene identidad vinculada al atleta, solo se lea con permiso.
 */

function createAnalyticsRepositoryDouble() {
  const ingest = vi.fn(async () => ({ sessionId: 'session-1', accepted: 1 }))
  const overview = vi.fn(async () => ({ visitors: 12, sessions: 15, pageviews: 40 }))
  const pages = vi.fn(async () => [{ path: '/', pageviews: 20, visitors: 10 }])
  const flows = vi.fn(async () => [{ from_path: '/', to_path: '/afiliarse', transitions: 5 }])
  const heatmap = vi.fn(async () => ({ path: '/', total: 3, max: 2, cells: [], elements: [] }))
  const funnel = vi.fn(async () => [{ step_index: 1, step_name: 'landing_view', visitors: 10 }])
  return {
    repository: { ingest, overview, pages, flows, heatmap, funnel },
    ingest,
    overview,
    pages,
    heatmap,
    funnel,
  }
}

async function setup({ role = 'admin_maximal' } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@analytics.test` })
  const prisma = createPrismaDouble([staff])
  const analytics = createAnalyticsRepositoryDouble()
  const target = listen(createApp({ prisma, analyticsRepository: analytics.repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, analytics }
}

function collect(url, body, headers = {}) {
  return fetch(`${url}/api/analytics/collect`, {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:5173',
      'Content-Type': 'application/json',
      'X-PLU-Request': 'browser',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('ingesta publica (/api/analytics/collect)', () => {
  it('normaliza la ruta en el servidor y no acepta la que manda el navegador', async () => {
    const { target, analytics } = await setup()

    try {
      const response = await collect(target.url, {
        events: [
          { type: 'pageview', path: '/mi-cuenta/orden/6f3b1e7c-1111-4222-8333-444455556666' },
          { type: 'click', path: '/registro?email=alguien%40example.com', x: 0.5, y: 0.25 },
        ],
        context: { path: '/registro?email=alguien%40example.com' },
      })

      expect(response.status).toBe(202)
      const [call] = analytics.ingest.mock.calls
      expect(call[0].events[0].path).toBe('/mi-cuenta/orden/:id')
      // La querystring nunca se persiste: llevaba un email.
      expect(call[0].events[1].path).toBe('/registro')
      expect(JSON.stringify(call[0])).not.toContain('alguien@example.com')
    } finally {
      await target.close()
    }
  })

  it('deriva el visitante en el servidor e ignora cualquier id del cliente', async () => {
    const { target, analytics } = await setup()

    try {
      await collect(target.url, {
        events: [{ type: 'pageview', path: '/' }],
        // Un cliente manipulado mandando su propio identificador no puede
        // elegir a quien se le imputan las visitas.
        visitorId: 'visitante-elegido-por-el-cliente',
      })

      const [call] = analytics.ingest.mock.calls
      expect(call[0].visitorId).toMatch(/^[0-9a-f]{32}$/)
      expect(call[0].visitorId).not.toBe('visitante-elegido-por-el-cliente')
    } finally {
      await target.close()
    }
  })

  it('descarta el trafico de bots antes de tocar la base', async () => {
    const { target, analytics } = await setup()

    try {
      const response = await collect(
        target.url,
        { events: [{ type: 'pageview', path: '/' }] },
        { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' },
      )

      expect(response.status).toBe(202)
      expect(await response.json()).toMatchObject({ ignored: 'bot' })
      expect(analytics.ingest).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('rechaza un lote vacio o mas grande que el techo', async () => {
    const { target } = await setup()

    try {
      expect((await collect(target.url, { events: [] })).status).toBe(400)

      const oversized = Array.from({ length: 51 }, () => ({ type: 'pageview', path: '/' }))
      expect((await collect(target.url, { events: oversized })).status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('rechaza coordenadas fuera del rango normalizado', async () => {
    // El heatmap agrupa sobre 0..1: un valor en pixeles rompe la grilla.
    const { target } = await setup()

    try {
      const response = await collect(target.url, {
        events: [{ type: 'click', path: '/', x: 840, y: 1200 }],
      })
      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })
})

describe('lectura del informe', () => {
  it('devuelve el resumen a un rol con admin.analytics.read', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/analytics/overview?days=7`, {
        headers: { Cookie: cookie },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ visitors: 12 })
    } finally {
      await target.close()
    }
  })

  it('bloquea a un rol operativo sin el permiso', async () => {
    const { target, cookie } = await setup({ role: 'seguridad_plu_arg' })

    try {
      for (const path of ['overview', 'pages', 'flows', 'funnel']) {
        const response = await fetch(`${target.url}/api/analytics/${path}`, {
          headers: { Cookie: cookie },
        })
        expect(response.status).toBe(403)
      }
    } finally {
      await target.close()
    }
  })

  it('rechaza (401) sin sesion de staff', async () => {
    const { target } = await setup()

    try {
      expect((await fetch(`${target.url}/api/analytics/overview`)).status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('exige la ruta para el mapa de calor y la normaliza', async () => {
    const { target, cookie, analytics } = await setup()

    try {
      const missing = await fetch(`${target.url}/api/analytics/heatmap?days=7`, {
        headers: { Cookie: cookie },
      })
      expect(missing.status).toBe(400)

      await fetch(`${target.url}/api/analytics/heatmap?days=7&path=/EVENTOS/pitbull-classic`, {
        headers: { Cookie: cookie },
      })
      expect(analytics.heatmap).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/eventos/pitbull-classic' }),
      )
    } finally {
      await target.close()
    }
  })

  it('solo permite el embudo canonico, no pasos arbitrarios del cliente', async () => {
    const { target, cookie, analytics } = await setup()

    try {
      await fetch(`${target.url}/api/analytics/funnel?days=30&steps=lo_que_sea`, {
        headers: { Cookie: cookie },
      })

      expect(analytics.funnel).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: ['landing_view', 'membership_view', 'membership_checkout_opened', 'payment_submitted', 'payment_approved'],
        }),
      )
    } finally {
      await target.close()
    }
  })
})
