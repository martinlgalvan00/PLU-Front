import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

// El tracker real no debe correr en el test: sólo interesa que el servicio
// de consentimiento sincronice su opt-out.
const setOptedOut = vi.fn()

vi.mock('../src/config/env.js', () => ({
  env: { analytics: { enabled: true, excludedPrefixes: [] } },
}))

vi.mock('../src/services/analyticsService.js', () => ({
  setOptedOut,
  isOptedOut: vi.fn(() => false),
}))

const { decideConsent, getConsent, hasDecided, openCookiePreferences } = await import(
  '../src/services/cookieConsentService.js'
)

const CookieConsent = (await import('../src/components/ui/CookieConsent.jsx')).default

function renderConsent() {
  return render(
    <I18nProvider>
      <CookieConsent />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('cookieConsentService', () => {
  it('sin decisión no hay consentimiento y la analítica queda denegada', () => {
    expect(hasDecided()).toBe(false)
    expect(getConsent()).toBe(null)
  })

  it('decidir guarda la preferencia y sincroniza el opt-out del tracker', () => {
    decideConsent({ analytics: true })
    expect(hasDecided()).toBe(true)
    expect(getConsent()).toEqual({ necessary: true, analytics: true })
    expect(setOptedOut).toHaveBeenCalledWith(false)

    decideConsent({ analytics: false })
    expect(getConsent()).toEqual({ necessary: true, analytics: false })
    expect(setOptedOut).toHaveBeenCalledWith(true)
  })
})

describe('CookieConsent', () => {
  it('muestra la banda con la acción principal y la salida igual de accesible', () => {
    renderConsent()

    expect(screen.getByRole('region', { name: 'Preferencias de cookies' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aceptar todo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Solo necesarias' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preferencias' })).toBeTruthy()
  })

  it('aceptar todo guarda el consentimiento y retira la banda', async () => {
    renderConsent()

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar todo' }))

    expect(getConsent()).toEqual({ necessary: true, analytics: true })
    expect(setOptedOut).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Preferencias de cookies' })).toBe(null),
    )
  })

  it('solo necesarias deja la analítica apagada', () => {
    renderConsent()

    fireEvent.click(screen.getByRole('button', { name: 'Solo necesarias' }))

    expect(getConsent()).toEqual({ necessary: true, analytics: false })
    expect(setOptedOut).toHaveBeenCalledWith(true)
  })

  it('las preferencias exponen el switch de analítica y guardan la decisión', async () => {
    renderConsent()

    fireEvent.click(screen.getByRole('button', { name: 'Preferencias' }))

    const toggle = screen.getByRole('switch', { name: /Medición de uso/ })
    expect(screen.getByText('Necesarias')).toBeTruthy()
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }))
    expect(getConsent()).toEqual({ necessary: true, analytics: true })
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Preferencias de cookies' })).toBe(null),
    )
  })

  it('con decisión previa no muestra la banda hasta que el footer la reabre', async () => {
    decideConsent({ analytics: false })
    const { unmount } = renderConsent()
    expect(screen.queryByRole('region', { name: 'Preferencias de cookies' })).toBe(null)
    unmount()

    renderConsent()
    openCookiePreferences()

    const toggle = await screen.findByRole('switch', { name: /Medición de uso/ })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy()
  })
})
