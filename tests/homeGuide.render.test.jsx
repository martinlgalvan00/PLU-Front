import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import HomeGuideSheet from '../src/components/ui/HomeGuideSheet.jsx'
import StickyMobileCta from '../src/components/ui/StickyMobileCta.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { hasSeenHomeGuide, markHomeGuideSeen } from '../src/lib/homeGuideStorage.js'

const STORAGE_KEY = 'plu-home-guide-seen'

vi.mock('../src/services/eventRegistrationApi.js', () => ({
  fetchEventRegistrationSummary: () =>
    Promise.resolve({ capacity: 80, registered: 0, remaining: 80, recent: [] }),
}))

const HomePage = (await import('../src/pages/HomePage.jsx')).default

beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: String(query).includes('max-width: 640px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  window.localStorage.removeItem(STORAGE_KEY)
})

afterEach(cleanup)

describe('guía de la portada', () => {
  it('expone Cómo funciona junto a Afiliarme', () => {
    render(
      <I18nProvider>
        <StickyMobileCta onNavigate={() => {}} onOpenGuide={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: /cómo funciona/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /afiliarme/i })).toBeTruthy()
  })

  it('abre el recorrido de tres pasos y permite ir a afiliación', () => {
    const onAffiliate = vi.fn()
    const onClose = vi.fn()
    render(
      <I18nProvider>
        <HomeGuideSheet onAffiliate={onAffiliate} onClose={onClose} />
      </I18nProvider>,
    )

    expect(screen.getByRole('dialog', { name: /cómo funciona/i })).toBeTruthy()
    expect(screen.getByText(/afiliate/i)).toBeTruthy()
    expect(screen.getByText(/inscribite/i)).toBeTruthy()
    expect(screen.getByText(/llegá con tu qr/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^afiliarme$/i }))
    expect(onAffiliate).toHaveBeenCalledTimes(1)
  })

  it('recuerda que la guía ya se vio', () => {
    expect(hasSeenHomeGuide()).toBe(false)
    markHomeGuideSeen()
    expect(hasSeenHomeGuide()).toBe(true)
  })

  it('desde la portada abre la guía, y al cerrar no vuelve a insistir sola', () => {
    const onNavigate = vi.fn()
    render(
      <I18nProvider>
        <HomePage events={[]} onNavigate={onNavigate} onSelectEvent={() => {}} />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /cómo funciona/i }))
    expect(screen.getByRole('dialog', { name: /cómo funciona/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /cerrar cómo funciona/i }))
    expect(screen.queryByRole('dialog', { name: /cómo funciona/i })).toBeNull()
    expect(hasSeenHomeGuide()).toBe(true)
  })
})
