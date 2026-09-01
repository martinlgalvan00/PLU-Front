// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El tracker corre dentro de flujos de negocio: `trackEvent('payment_submitted')`
 * se emite en el mismo `onSubmit` que envia el pago. Estos tests fijan que la
 * medicion no pueda propagar una excepcion hacia el llamador ni capturar lo que
 * alguien tipea.
 */

async function loadTracker(envValue, { consent = true } = {}) {
  vi.resetModules()
  vi.doMock('../src/config/env.js', () => ({ env: envValue }))
  // El tracker sólo mide con consentimiento explícito de cookies: los tests
  // que verifican medición parten de una decisión ya aceptada.
  window.localStorage.setItem(
    'plu-cookie-consent-v1',
    JSON.stringify({ analytics: consent !== false }),
  )
  return import('../src/services/analyticsService.js')
}

afterEach(() => {
  vi.doUnmock('../src/config/env.js')
  vi.resetModules()
  window.localStorage.clear()
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

  it('no mide sin consentimiento explicito: el silencio no es un si', async () => {
    // La decision de cookies es opt-in. Sin ella el tracker queda callado
    // aunque la configuracion este habilitada y nadie haya pedido salir.
    const tracker = await loadTracker(FULL_ENV, { consent: false })
    window.history.replaceState({}, '', '/afiliarse')
    tracker.resetAnalyticsForTests()

    tracker.trackEvent('membership_view')
    expect(tracker.peekQueueForTests()).toHaveLength(0)

    // Aceptar despues de navegar habilita la medicion en el acto.
    window.localStorage.setItem('plu-cookie-consent-v1', JSON.stringify({ analytics: true }))
    tracker.trackEvent('membership_view')
    expect(tracker.peekQueueForTests()).toHaveLength(1)
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

/**
 * Tiempo activo. Lo que se mide es atencion, no pestañas abiertas: la duracion
 * que ya guardaba la base es `last_seen - started`, y contaba igual una pestaña
 * olvidada en segundo plano que una lectura real. Sobre datos del sitio daba
 * 5m17s de permanencia media.
 */
describe('tiempo activo', () => {
  /** Fija `visibilityState`, que en jsdom es de solo lectura. */
  function setVisibility(value) {
    Object.defineProperty(document, 'visibilityState', {
      value,
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('acumula solo el tramo con la pestaña visible', async () => {
    vi.useFakeTimers()
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/afiliarse')
    tracker.resetAnalyticsForTests()
    setVisibility('visible')

    const sent = collectPayloads()

    tracker.startAnalytics()
    vi.advanceTimersByTime(20_000)

    // Se va a otra pestaña: a partir de aca el reloj se detiene. Ocultarla
    // ademas descarga lo acumulado, asi que el total se lee sumando los lotes.
    setVisibility('hidden')
    vi.advanceTimersByTime(600_000)
    setVisibility('visible')
    vi.advanceTimersByTime(10_000)

    tracker.trackEvent('membership_view')
    tracker.flush()

    const total = sent().reduce((sum, p) => sum + (p.context.activeMs ?? 0), 0)
    // 30s de lectura real, no los 630s que estuvo abierta la pestaña.
    expect(total).toBeGreaterThanOrEqual(29_000)
    expect(total).toBeLessThan(35_000)

    tracker.stopAnalytics()
  })

  it('reporta la lectura de quien no toca nada', async () => {
    // Sin latido, alguien que abre una nota y la lee entera no genera un solo
    // evento, y su lectura no queda registrada en ningun lado.
    vi.useFakeTimers()
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/reglamento')
    tracker.resetAnalyticsForTests()
    setVisibility('visible')

    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.fetch = fetchSpy

    tracker.startAnalytics()
    // Nadie hace nada: ni un click, ni un scroll, ni una vista.
    vi.advanceTimersByTime(45_000)

    expect(fetchSpy).toHaveBeenCalled()
    const payload = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(payload.events).toHaveLength(0)
    expect(payload.context.activeMs).toBeGreaterThanOrEqual(30_000)

    tracker.stopAnalytics()
  })

  it('no envia nada si la pestaña nunca estuvo visible', async () => {
    vi.useFakeTimers()
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/reglamento')
    tracker.resetAnalyticsForTests()

    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }))
    globalThis.fetch = fetchSpy
    setVisibility('hidden')

    tracker.startAnalytics()
    vi.advanceTimersByTime(120_000)

    expect(fetchSpy).not.toHaveBeenCalled()
    tracker.stopAnalytics()
  })

  it('devuelve el tiempo activo a la cola si el beacon se rechaza', async () => {
    // Perder el lote final es perder justo el tramo de lectura mas largo.
    vi.useFakeTimers()
    const tracker = await loadTracker(FULL_ENV)
    window.history.replaceState({}, '', '/afiliarse')
    tracker.resetAnalyticsForTests()
    setVisibility('visible')

    navigator.sendBeacon = vi.fn(() => false)

    tracker.startAnalytics()
    vi.advanceTimersByTime(25_000)
    tracker.flush({ useBeacon: true })

    expect(tracker.peekActiveMsForTests()).toBeGreaterThanOrEqual(24_000)
    tracker.stopAnalytics()
  })

  /**
   * Captura todos los lotes que salen.
   *
   * `sendBeacon` se retira a proposito: el cuerpo de un beacon es un `Blob` y
   * solo se lee de forma asincronica, lo que obligaria a este test a esperar
   * dentro de temporizadores falsos. Sin `sendBeacon`, `flush` cae al `fetch`
   * incluso en el camino de salida, que es lo que aca interesa observar.
   */
  function collectPayloads() {
    const payloads = []
    delete navigator.sendBeacon
    globalThis.fetch = vi.fn((_url, init) => {
      payloads.push(JSON.parse(init.body))
      return Promise.resolve({ ok: true })
    })
    return () => payloads
  }
})
