import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import NavbarPublic from '../src/components/layout/NavbarPublic.jsx'
import Footer from '../src/components/layout/Footer.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import { ThemeProvider } from '../src/providers/ThemeProvider.jsx'

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
})

const NAV_EVENTS = [
  { slug: 'nacional-2026', title: 'Nacional 2026', dateISO: '2026-12-20' },
  { slug: 'pitbull-classic-2026', title: 'Pitbull Classic', dateISO: '2026-08-15' },
]

function renderNav(props = {}) {
  const onNavigate = vi.fn()
  return {
    onNavigate,
    ...render(
      <I18nProvider>
        <ThemeProvider>
          <MotionProvider>
            <NavbarPublic
              activeView="home"
              navEvents={NAV_EVENTS}
              onNavigate={onNavigate}
              onLogout={vi.fn()}
              session={null}
              {...props}
            />
          </MotionProvider>
        </ThemeProvider>
      </I18nProvider>,
    ),
  }
}

describe('NavbarPublic Competencia', () => {
  it('lista Calendario y ambos eventos por nombre en el desplegable', () => {
    renderNav()

    fireEvent.click(screen.getByRole('button', { name: /competencia/i }))

    expect(screen.getByRole('menuitem', { name: /calendario/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /nacional 2026/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /pitbull classic/i })).toBeTruthy()
  })

  it('abre cada evento por slug y no por la vista pitbull', () => {
    const { onNavigate } = renderNav()

    fireEvent.click(screen.getByRole('button', { name: /competencia/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /nacional 2026/i }))

    expect(onNavigate).toHaveBeenCalledWith('events', { eventSlug: 'nacional-2026' })
  })

  it('marca activo el evento abierto por slug, no el calendario', () => {
    renderNav({ activeView: 'events', activeEventSlug: 'pitbull-classic-2026' })

    fireEvent.click(screen.getByRole('button', { name: /competencia/i }))

    const pitbull = screen.getByRole('menuitem', { name: /pitbull classic/i })
    const calendar = screen.getByRole('menuitem', { name: /calendario/i })
    expect(pitbull.getAttribute('aria-current')).toBe('page')
    expect(calendar.getAttribute('aria-current')).toBeNull()
  })
})

describe('Footer Competencia', () => {
  it('lista ambos eventos por nombre y navega por slug', () => {
    const onNavigate = vi.fn()
    render(
      <I18nProvider>
        <Footer onNavigate={onNavigate} navEvents={NAV_EVENTS} />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nacional 2026' }))
    expect(onNavigate).toHaveBeenCalledWith('events', { eventSlug: 'nacional-2026' })
    fireEvent.click(screen.getByRole('button', { name: 'Pitbull Classic' }))
    expect(onNavigate).toHaveBeenCalledWith('events', { eventSlug: 'pitbull-classic-2026' })
  })
})
