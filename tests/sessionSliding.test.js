import { afterEach, describe, expect, it, vi } from 'vitest'

const HOUR = 1000 * 60 * 60

function buildSessionDouble({ createdAt, expiresAt }) {
  return {
    id: 'session-1',
    tokenHash: 'abc123',
    userId: 'user-1',
    createdAt: new Date(createdAt),
    expiresAt: new Date(expiresAt),
  }
}

function buildDoubles({ createdAt, expiresAt }) {
  const session = buildSessionDouble({ createdAt, expiresAt })
  const update = vi.fn().mockResolvedValue({})
  const prisma = { session: { update } }
  const req = { cookies: { plu_session: 'tok' } }
  const res = { cookie: vi.fn() }
  return { session, prisma, req, res, update }
}

const { extendSessionIfActive, SESSION_COOKIE_NAME } = await import(
  '../server/services/sessionService.js'
)

afterEach(async () => {
  const { resetSessionCaches } = await import('../server/lib/sessionCache.js')
  resetSessionCaches()
  vi.clearAllMocks()
})

describe('extendSessionIfActive', () => {
  it('no renueva una sesión que sigue en la primera mitad de su ventana', async () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const login = now.getTime() - 1 * HOUR
    const { session, prisma, req, res, update } = buildDoubles({
      createdAt: login,
      expiresAt: login + 8 * HOUR,
    })

    const result = await extendSessionIfActive({
      prisma,
      result: { session, user: {} },
      req,
      res,
      now,
    })

    expect(result).toBe(null)
    expect(update).not.toHaveBeenCalled()
    expect(res.cookie).not.toHaveBeenCalled()
  })

  it('renueva pasada la mitad de la ventana y refresca la cookie', async () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const login = now.getTime() - 5 * HOUR
    const { session, prisma, req, res, update } = buildDoubles({
      createdAt: login,
      expiresAt: login + 8 * HOUR,
    })

    const next = await extendSessionIfActive({
      prisma,
      result: { session, user: {} },
      req,
      res,
      now,
    })

    // 8 h desde ahora, sin superar el tope absoluto de 7 días.
    expect(next.getTime()).toBe(now.getTime() + 8 * HOUR)
    expect(update).toHaveBeenCalledWith({
      where: { id: session.id },
      data: { expiresAt: next },
    })
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE_NAME, 'tok', expect.any(Object))
    const [, , options] = res.cookie.mock.calls[0]
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('strict')
  })

  it('el tope absoluto de 7 días manda sobre la renovación', async () => {
    const now = new Date('2026-08-30T12:00:00Z')
    // Login hace 7 días menos 4 horas: la sesión se renovó por actividad toda
    // la semana y el tope absoluto cae dentro de 4 h, antes que las 8 h que
    // pediría la ventana deslizante.
    const login = now.getTime() - (7 * 24 * HOUR - 4 * HOUR)
    const { session, prisma, req, res, update } = buildDoubles({
      createdAt: login,
      expiresAt: now.getTime() + 30 * 60 * 1000,
    })

    const next = await extendSessionIfActive({
      prisma,
      result: { session, user: {} },
      req,
      res,
      now,
    })

    expect(next.getTime()).toBe(login + 7 * 24 * HOUR)
    expect(update).toHaveBeenCalled()
  })

  it('no renueva cuando el vencimiento vigente ya está en el tope absoluto', async () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const login = now.getTime() - 7 * 24 * HOUR
    const { session, prisma, req, res, update } = buildDoubles({
      createdAt: login,
      expiresAt: now.getTime() + 2 * HOUR,
    })

    const next = await extendSessionIfActive({
      prisma,
      result: { session, user: {} },
      req,
      res,
      now,
    })

    // El tope absoluto ya quedó detrás del vencimiento actual: nada que ganar.
    expect(next).toBe(null)
    expect(update).not.toHaveBeenCalled()
  })

  it('no extiende más allá del vencimiento que ya tiene', async () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const login = now.getTime() - 20 * HOUR
    // Ya venció pero el reloj absoluto está a 6 días: nextExpires (ahora + 8 h)
    // es mayor que expiresAt actual, así que SÍ renueva. Este caso documenta
    // que la comparación es contra el vencimiento vigente.
    const { session, prisma, req, res } = buildDoubles({
      createdAt: login,
      expiresAt: now.getTime() - 1 * HOUR,
    })

    const next = await extendSessionIfActive({
      prisma,
      result: { session, user: {} },
      req,
      res,
      now,
    })

    expect(next.getTime()).toBe(now.getTime() + 8 * HOUR)
  })

  it('es best-effort: sin prisma usable no hace nada', async () => {
    const now = new Date('2026-08-30T12:00:00Z')
    const { session } = buildDoubles({
      createdAt: now.getTime() - 5 * HOUR,
      expiresAt: now.getTime() + 3 * HOUR,
    })

    const result = await extendSessionIfActive({
      prisma: {},
      result: { session, user: {} },
      req: {},
      res: {},
      now,
    })

    expect(result).toBe(null)
  })
})

describe('apiRequest: expiración de sesión', () => {
  it('un 401 fuera del flujo de auth avisa a la app', async () => {
    const events = []
    window.addEventListener('plu:auth-expired', (e) => events.push(e.detail))
    const { apiRequest } = await import('../src/lib/api.js')

    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: 'No autenticado.' })),
        headers: { get: () => null },
      }),
    )
    globalThis.fetch = fetchMock

    await expect(apiRequest('/api/users')).rejects.toMatchObject({ status: 401 })
    expect(events).toEqual([{ path: '/api/users' }])
  })

  it('el probe de sesión y el login no disparan el aviso', async () => {
    const events = []
    window.addEventListener('plu:auth-expired', (e) => events.push(e.detail))
    const { apiRequest } = await import('../src/lib/api.js')

    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ error: 'No autenticado.' })),
        headers: { get: () => null },
      }),
    )
    globalThis.fetch = fetchMock

    await expect(apiRequest('/api/auth/me')).rejects.toMatchObject({ status: 401 })
    await expect(apiRequest('/api/athletes/session')).rejects.toMatchObject({ status: 401 })
    await expect(apiRequest('/api/auth/login', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
    })
    expect(events).toEqual([])
  })
})
