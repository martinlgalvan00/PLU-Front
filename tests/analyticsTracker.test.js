// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El tracker corre dentro de flujos de negocio: `trackEvent('payment_submitted')`
 * se emite en el mismo `onSubmit` que envia el pago. Estos tests fijan que la
 * medicion no pueda propagar una excepcion hacia el llamador ni capturar lo que
 * alguien tipea.
 */

async function loadTracker(envValue) {
  vi.resetModules()
  vi.doMock('../src/config/env.js', () => ({ env: envValue }))
  return import('../src/services/analyticsService.js')
}

afterEach(() => {
  vi.doUnmock('../src/config/env.js')
  vi.resetModules()
})

const FULL_ENV = {
  analytics: { enabled: true, excludedPrefixes: ['/admin'] },
}

describe('el tracker nunca rompe al llamador', () => {
  it('no lanza si la configuracion de analitica no existe', async () => {
    // Escenario real: un test que mockea `env` solo con lo que le interesa, o
    // una configuracion a medio migrar. Antes esto tiraba un TypeError dentro
    // del submit del checkout.
    const tracker = await loadTracker({ mercadoPago: { configured: true } })

    expect(() => tracker.trackEvent('payment_submitted')).not.toThrow()
    expect(() => tracker.trackConversion('payment_approved', { value: 75000 })).not.toThrow()
    expect(() => tracker.trackPageView({ route: 'home' })).not.toThrow()
    expect(tracker.peekQueueForTests()).toHaveLength(0)
  })

  it('no lanza con el kill switch apagado y no encola nada', async () => {
    const tracker = await loadTracker({ analytics: { enabled: false, excludedPrefixes: [] } })

    expect(() => tracker.trackEvent('membership_view')).not.toThrow()
    expect(tracker.peekQueueForTests()).toHaveLength(0)
  })
})

describe('alcance de la medicion', () => {
  it('no mide el panel administrativo', async () => {
    // La actividad de staff ya vive en la auditoria operativa; mezclarla
    // distorsiona visitantes, rebote y embudo.
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/admin/pagos')
    tracker.resetAnalyticsForTests()

    tracker.trackEvent('algo_en_el_panel')
    expect(tracker.peekQueueForTests()).toHaveLength(0)
  })

  it('mide el sitio publico', async () => {
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/afiliarse')
    tracker.resetAnalyticsForTests()

    tracker.trackEvent('membership_view')
    const queue = tracker.peekQueueForTests()

    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ name: 'membership_view', path: '/afiliarse' })
  })

  it('respeta la salida explicita del visitante', async () => {
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/afiliarse')
    tracker.resetAnalyticsForTests()

    tracker.setOptedOut(true)
    tracker.trackEvent('membership_view')
    expect(tracker.peekQueueForTests()).toHaveLength(0)

    tracker.setOptedOut(false)
    tracker.trackEvent('membership_view')
    expect(tracker.peekQueueForTests()).toHaveLength(1)
  })
})
