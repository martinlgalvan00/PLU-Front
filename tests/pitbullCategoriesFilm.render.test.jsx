import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PitbullCategoriesFilm from '../src/components/ui/PitbullCategoriesFilm.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

function mockMatchMedia(matchesQuery) {
  window.matchMedia = (query) => ({
    matches: matchesQuery(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

const ACTS = [
  {
    id: 'modalities',
    label: 'Modalidades',
    hint: 'Cómo armás tu inscripción',
    rows: ['Full Power', 'Push-Pull', 'Especialista en banca'],
  },
  {
    id: 'equipment',
    label: 'Equipamiento',
    hint: 'Categoría de equipo',
    rows: ['Raw', 'Single ply'],
  },
  {
    id: 'divisions',
    label: 'Divisiones',
    hint: 'Clase de edad',
    rows: ['Open', 'Youth', 'Masters'],
  },
]

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
})

beforeEach(() => mockMatchMedia(() => false))
afterEach(cleanup)

function renderFilm() {
  return render(
    <I18nProvider>
      <MotionProvider>
        <PitbullCategoriesFilm acts={ACTS} />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('PitbullCategoriesFilm', () => {
  it('lista los tres capítulos con sus filas reales', () => {
    const { container } = renderFilm()

    for (const act of ACTS) {
      expect(screen.getByRole('heading', { level: 3, name: act.label })).toBeTruthy()
      for (const row of act.rows) expect(screen.getAllByText(row).length).toBeGreaterThan(0)
    }
    expect(container.querySelectorAll('.pitbull-film__row')).toHaveLength(8)
  })

  it('arranca en el primer capítulo con el reproductor y los tres levantamientos encendidos', () => {
    const { container } = renderFilm()

    expect(container.querySelector('.pitbull-film')?.getAttribute('data-stage')).toBe('true')
    expect(container.querySelector('.film-screen__chapter[data-state="active"]')?.textContent).toBe(
      'Modalidades',
    )
    // "Full Power" incluye sentadilla, banca y peso muerto.
    expect(container.querySelectorAll('.film-lift[data-on="true"]')).toHaveLength(3)
  })

  it('con reduced motion queda solo la lista, sin reproductor', () => {
    mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))
    const { container } = renderFilm()

    expect(container.querySelector('.film-screen')).toBeNull()
    expect(container.querySelector('.pitbull-film')?.getAttribute('data-stage')).toBeNull()
    expect(container.querySelectorAll('.pitbull-film__row')).toHaveLength(8)
  })
})
