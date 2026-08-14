import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import AccountNav from '../src/pages/profile/AccountNav.jsx'

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
  Element.prototype.scrollTo ??= function scrollTo() {}
})

afterEach(cleanup)

function renderNav(activeId = 'account-qr', onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <I18nProvider>
        <MotionProvider>
          <AccountNav activeId={activeId} onChange={onChange} />
        </MotionProvider>
      </I18nProvider>,
    ),
  }
}

describe('AccountNav', () => {
  it('muestra labels enteros y avisa el tab activo', () => {
    renderNav('account-personal-data')

    expect(screen.getByRole('tablist')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Credencial' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Mis datos' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Seguridad' }).getAttribute('aria-selected')).toBe('false')
  })

  it('cambia de sección al elegir otro tab', () => {
    const { onChange } = renderNav()

    fireEvent.click(screen.getByRole('tab', { name: 'Afiliación' }))
    expect(onChange).toHaveBeenCalledWith('account-membership')
  })
})
