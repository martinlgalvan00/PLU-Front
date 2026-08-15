import { afterEach, describe, expect, it, vi } from 'vitest'

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('no muestra instrucciones locales cuando el servicio falla en produccion', async () => {
    vi.doMock('../src/config/env.js', () => ({
      env: {
        apiUrl: '',
        isDev: false,
      },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve(''),
    }))

    const { apiGet } = await import('../src/lib/api.js')

    await expect(apiGet('/api/payments/preferences')).rejects.toThrow(
      'No pudimos iniciar el servicio en este momento. Intenta nuevamente o contacta soporte.',
    )
    await expect(apiGet('/api/payments/preferences')).rejects.toMatchObject({ status: 503 })
  })

  it('mantiene la instruccion local cuando falla en desarrollo', async () => {
    vi.doMock('../src/config/env.js', () => ({
      env: {
        apiUrl: '',
        isDev: true,
      },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve(''),
    }))

    const { apiGet } = await import('../src/lib/api.js')

    await expect(apiGet('/api/payments/preferences')).rejects.toThrow(
      'El servicio no esta disponible en este momento. En local levanta la API con npm run dev:api (o npm run dev:services).',
    )
    await expect(apiGet('/api/payments/preferences')).rejects.toMatchObject({ status: 502 })
  })

  it('conserva el requestId del 5xx y lo deja en el log del browser', async () => {
    vi.doMock('../src/config/env.js', () => ({
      env: { apiUrl: '', isDev: false },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify({ error: 'Error interno', requestId: 'req-123' })),
    }))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { apiGet } = await import('../src/lib/api.js')

    await expect(apiGet('/api/admin-queue')).rejects.toMatchObject({
      status: 500,
      requestId: 'req-123',
    })
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('req-123'))
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('/api/admin-queue'))
  })

  it('toma el requestId del header cuando el cuerpo no lo trae', async () => {
    vi.doMock('../src/config/env.js', () => ({
      env: { apiUrl: '', isDev: false },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: (name) => (name === 'X-Request-Id' ? 'req-desde-header' : null) },
      text: () => Promise.resolve(''),
    }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { apiGet } = await import('../src/lib/api.js')

    await expect(apiGet('/api/admin-queue')).rejects.toMatchObject({
      requestId: 'req-desde-header',
    })
  })

  // Los mocks de fetch de este archivo no definen `headers`; el acceso tiene que
  // seguir siendo tolerante para no romper a quien mockee una respuesta minima.
  it('no falla cuando la respuesta mockeada no expone headers', async () => {
    vi.doMock('../src/config/env.js', () => ({
      env: { apiUrl: '', isDev: false },
    }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(''),
    }))

    const { apiGet } = await import('../src/lib/api.js')

    await expect(apiGet('/api/admin-queue')).rejects.toMatchObject({ requestId: null })
  })
})
