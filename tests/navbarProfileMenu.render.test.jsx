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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderNav(session, { onLogout = vi.fn(), onNavigate = vi.fn() } = {}) {
  return {
    onLogout,
    onNavigate,
    ...render(
      <I18nProvider>
        <ThemeProvider>
          <MotionProvider>
            <NavbarPublic
              activeView="profile"
              onNavigate={onNavigate}
              onLogout={onLogout}
              session={session}
            />
          </MotionProvider>
        </ThemeProvider>
      </I18nProvider>,
    ),
  }
}

describe('NavbarPublic profile menu', () => {
  it('opens Perfil and logout when tapping the account mark', () => {
    renderNav({ name: 'Agustin Di Santo', role: 'athlete_plu' })

    const trigger = document.getElementById('plu-profile-menu-trigger')
    expect(trigger).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(trigger)

    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /^perfil$/i })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toBeTruthy()
    expect(screen.getByText('Atleta oficial')).toBeTruthy()
  })

  it('centers the profile menu in a narrow viewport', () => {
    const viewportWidth = 360
    vi.stubGlobal('innerWidth', viewportWidth)

    renderNav({ name: 'Agustin Di Santo', role: 'admin' })

    const trigger = document.getElementById('plu-profile-menu-trigger-mobile')
    expect(trigger).toBeTruthy()
    fireEvent.click(trigger)

    const menu = screen.getByRole('menu')
    const menuWidth = Math.min(272, viewportWidth - 24)
    expect(menu.style.left).toBe(`${Math.round((viewportWidth - menuWidth) / 2)}px`)
    expect(menu.style.right).toBe('')
  })

  it('opens Cerrar sesión from the mobile account mark without navigating away', () => {
    const { onLogout, onNavigate } = renderNav({ name: 'Agustin Di Santo', role: 'athlete_plu' })

    const trigger = document.getElementById('plu-profile-menu-trigger-mobile')
    expect(trigger).toBeTruthy()

    fireEvent.click(trigger)

    expect(onNavigate).not.toHaveBeenCalled()
    const logout = screen.getByRole('menuitem', { name: /cerrar sesión/i })
    fireEvent.click(logout)

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
