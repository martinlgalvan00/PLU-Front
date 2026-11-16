import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import ProfileHero from '../src/pages/profile/ProfileHero.jsx'

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

function renderHero(props) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <ProfileHero onNavigateSection={vi.fn()} {...props} />
      </MotionProvider>
    </I18nProvider>,
  )
}

afterEach(cleanup)

describe('ProfileHero', () => {
  it('una ficha nueva no abre con cero inscripciones', () => {
    renderHero({
      athlete: { fullName: 'Ana Torres' },
      membership: null,
      athleteRegistrations: [],
      nextEvent: null,
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Ana Torres' })).toBeTruthy()
    expect(screen.getByText(/Tu ficha está creada/)).toBeTruthy()
    expect(screen.queryByText(/0 inscripciones/)).toBeNull()
    expect(screen.getByRole('button', { name: /Editar mis datos/ })).toBeTruthy()
  })

  it('con una inscripción vigente muestra el conteo', () => {
    renderHero({
      athlete: { fullName: 'Ana Torres' },
      membership: null,
      athleteRegistrations: [{ id: 'reg-1', status: 'confirmada' }],
      nextEvent: { title: 'Pitbull Classic' },
    })

    expect(screen.getByText('1 inscripción activa')).toBeTruthy()
    expect(screen.getByText('Pitbull Classic')).toBeTruthy()
    expect(screen.queryByText(/Tu ficha está creada/)).toBeNull()
  })
})
