import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import NavbarPublic from '../src/components/layout/NavbarPublic.jsx'
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
})

afterEach(cleanup)

function renderNav(session) {
  return render(
    <I18nProvider>
      <ThemeProvider>
        <MotionProvider>
          <NavbarPublic
            activeView="profile"
            onNavigate={vi.fn()}
            onLogout={vi.fn()}
            session={session}
          />
        </MotionProvider>
      </ThemeProvider>
    </I18nProvider>,
  )
}

describe('NavbarPublic profile menu', () => {
  it('opens Mi perfil and logout when tapping the account mark', () => {
    renderNav({ name: 'Agustin Di Santo', role: 'athlete_plu' })

    const trigger = document.getElementById('plu-profile-menu-trigger')
    expect(trigger).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)

    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /mi perfil/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toBeTruthy()
    expect(screen.getByText('Atleta oficial')).toBeTruthy()
  })
})
