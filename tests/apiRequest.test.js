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
})
