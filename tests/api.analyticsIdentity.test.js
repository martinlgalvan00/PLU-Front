import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Contrato de las dos lecturas que cierran el proceso de auditoría de uso:
 * el ranking de lo más usado (agregado) y el recorrido de un atleta puntual
 * (identificado).
 *
 * Lo que fijan estos tests es el límite entre las dos: ver métricas de producto
 * y abrir la navegación de una persona con nombre no pueden ser el mismo
 * acceso, y la segunda tiene que dejar rastro de quién consultó a quién.
 */

const ATHLETE_ID = '6f3b1e7c-1111-4222-8333-444455556666'

function createRepositoryDouble() {
  const repository = {
    ingest: vi.fn(async () => ({ sessionId: 'session-1', accepted: 1 })),
    overview: vi.fn(async () => ({ visitors: 12 })),
    pages: vi.fn(async () => [{ path: '/', pageviews: 20 }]),
    flows: vi.fn(async () => []),
    heatmap: vi.fn(async () => ({
      path: '/',
      total: 3,
      max: 2,
      aspectRatio: 4.18,
      cells: [],
      elements: [],
    })),
    funnel: vi.fn(async () => []),
    elements: vi.fn(async () => [
      {
        element_selector: '#cta-afiliarme',
        label: 'Afiliarme',
        clicks: 91,
        visitors: 44,
        paths: 3,
        sample_path: '/',
      },
    ]),
    athleteJourney: vi.fn(async () => ({
      athleteId: ATHLETE_ID,
      summary: { sessions: 2, pageviews: 9, clicks: 4, conversions: 1 },
      pages: [{ path: '/afiliarse', pageviews: 5 }],
      elements: [{ element_selector: '#cta-afiliarme', label: 'Afiliarme', clicks: 3 }],
      timeline: [],
    })),
  }
  return repository
}

async function setup({ role = 'admin_maximal', permissions } = {}) {
  const staff = await buildStaffUser({
    role,
    email: `${role}-${permissions ? 'custom' : 'base'}@analytics-identity.test`,
    ...(permissions ? { permissions } : {}),
  })
  const prisma = createPrismaDouble([staff])
  const repository = createRepositoryDouble()
  const target = listen(createApp({ prisma, analyticsRepository: repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, repository }
}

function get(url, path, cookie) {
  return fetch(`${url}${path}`, { headers: cookie ? { Cookie: cookie } : {} })
}

describe('ranking de lo más usado (/api/analytics/elements)', () => {
  it('devuelve clicks y personas por elemento con permiso de lectura', async () => {
    const { target, cookie, repository } = await setup()
    try {
      const response = await get(target.url, '/api/analytics/elements?days=30&limit=10', cookie)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.elements[0]).toMatchObject({
        element_selector: '#cta-afiliarme',
        clicks: 91,
        visitors: 44,
      })
      expect(repository.elements).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10 }),
      )
    } finally {
      await target.close()
    }
  })

  it('no responde sin sesión de staff', async () => {
    const { target } = await setup()
    try {
      const response = await get(target.url, '/api/analytics/elements?days=30')
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})

describe('mapa de calor por dispositivo', () => {
  it('pasa el filtro al repositorio y devuelve la proporción de la página', async () => {
    const { target, cookie, repository } = await setup()
    try {
      const response = await get(
        target.url,
        '/api/analytics/heatmap?path=/&days=30&deviceType=mobile',
        cookie,
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ aspectRatio: 4.18 })
      expect(repository.heatmap).toHaveBeenCalledWith(
        expect.objectContaining({ deviceType: 'mobile', path: '/' }),
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza un dispositivo que no existe en vez de ignorarlo', async () => {
    // Ignorarlo devolvería el mapa de todos los dispositivos con la etiqueta
    // de uno, que es peor que un error.
    const { target, cookie } = await setup()
    try {
      const response = await get(
        target.url,
        '/api/analytics/heatmap?path=/&days=30&deviceType=televisor',
        cookie,
      )
      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })
})

describe('recorrido de un atleta (/api/analytics/athletes/:id/journey)', () => {
  it('responde con el recorrido a quien tiene el permiso de identidad', async () => {
    const { target, cookie, repository } = await setup()
    try {
      const response = await get(
        target.url,
        `/api/analytics/athletes/${ATHLETE_ID}/journey?days=30`,
        cookie,
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.summary).toMatchObject({ sessions: 2, pageviews: 9 })
      expect(repository.athleteJourney).toHaveBeenCalledWith(
        expect.objectContaining({ athleteId: ATHLETE_ID }),
      )
    } finally {
      await target.close()
    }
  })

  it('el timeline se pide más largo que el limit de las tablas agregadas', async () => {
    // 25 filas alcanzan para un top de páginas; reconstruir un recorrido con 25
    // eventos no sirve para nada.
    const { target, cookie, repository } = await setup()
    try {
      await get(target.url, `/api/analytics/athletes/${ATHLETE_ID}/journey?days=30&limit=25`, cookie)
      const call = repository.athleteJourney.mock.calls.at(-1)[0]
      expect(call.limit).toBeGreaterThanOrEqual(50)
      expect(call.limit).toBeLessThanOrEqual(500)
    } finally {
      await target.close()
    }
  })

  it('rechaza un id que no es uuid antes de tocar la base', async () => {
    const { target, cookie, repository } = await setup()
    try {
      const response = await get(target.url, '/api/analytics/athletes/1/journey?days=30', cookie)
      expect(response.status).toBe(400)
      expect(repository.athleteJourney).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('no lo abre un rol sin el permiso de identidad', async () => {
    const { target, cookie, repository } = await setup({ role: 'seguridad_plu_arg' })
    try {
      const response = await get(
        target.url,
        `/api/analytics/athletes/${ATHLETE_ID}/journey?days=30`,
        cookie,
      )
      expect(response.status).toBe(403)
      expect(repository.athleteJourney).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('no responde sin sesión de staff', async () => {
    const { target } = await setup()
    try {
      const response = await get(
        target.url,
        `/api/analytics/athletes/${ATHLETE_ID}/journey?days=30`,
      )
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
