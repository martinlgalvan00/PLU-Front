import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AthletesSection from '../src/pages/admin/AthletesSection.jsx'

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(cleanup)

const athletes = [
  {
    id: 'ath-001',
    fullName: 'Martina Rivas',
    documentId: '40111222',
    email: 'martina.rivas@example.com',
    gym: 'Maximal Power',
    division: 'Open',
    status: 'afiliado_activo',
    createdAt: '2026-08-08T13:30:00Z',
  },
  {
    id: 'ath-002',
    fullName: 'Nicolás Aguirre',
    documentId: '36888999',
    email: 'nicolas.aguirre@example.com',
    gym: 'Pitbull Barbell',
    division: 'Junior',
    status: 'registrado',
    createdAt: '2026-08-10T16:45:00Z',
  },
  {
    id: 'ath-003',
    fullName: 'Florencia López',
    documentId: '38221004',
    email: 'florencia.lopez@example.com',
    gym: 'Iron Temple',
    division: 'Open',
    status: 'registrado',
    createdAt: '2026-07-15T10:00:00Z',
  },
]

function renderAthletes(props = {}) {
  const utils = render(
    <I18nProvider>
      <AthletesSection athletes={athletes} onSelectAthlete={vi.fn()} {...props} />
    </I18nProvider>,
  )
  // La tabla repite el label de cada columna (versión mobile + desktop en el
  // mismo DOM) y algunos valores de estado -- acotar al root de la barra de
  // filtros evita esas coincidencias con "Gimnasio", "Afiliado activo", etc.
  const filterBar = utils.container.querySelector('.admin-filters')
  return { ...utils, filterBar }
}

describe('Atletas — barra de filtros (chips siempre visibles)', () => {
  it('muestra las 5 facetas a la vista, sin botón "Filtros" ni caja de gimnasio rota', () => {
    const { filterBar } = renderAthletes()

    // Sin el botón único que abría un panel aparte: los grupos ya están en pantalla.
    expect(within(filterBar).queryByRole('button', { name: /^Filtros/ })).toBeNull()

    for (const label of ['Afiliación', 'Inscripción', 'Gimnasio', 'División', 'Fecha de alta']) {
      expect(within(filterBar).getByText(label)).toBeTruthy()
    }

    // Gimnasio es un <select> real y accesible, no una caja vacía flotando
    // (el bug original de esta suite: el label del select heredaba el
    // tratamiento de tarjeta del buscador y quedaba como un rectángulo sin
    // contenido -- ver admin.css, `label:not(.admin-filters__select-label)`).
    const gymSelect = within(filterBar).getByRole('combobox', { name: 'Gimnasio' })
    expect(gymSelect).toBeTruthy()
    expect(within(filterBar).getByText('Maximal Power')).toBeTruthy()
    expect(within(filterBar).getByText('Pitbull Barbell')).toBeTruthy()
  })

  it('elige un gimnasio y filtra la tabla', () => {
    const { filterBar } = renderAthletes()

    fireEvent.change(within(filterBar).getByRole('combobox', { name: 'Gimnasio' }), {
      target: { value: 'pitbull barbell' },
    })

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()
  })

  it('elige un chip de Afiliación y lo puede limpiar volviendo a tocarlo', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByText('Afiliado activo'))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    // El chip activo es `clearable`: tocarlo de nuevo vuelve al neutro
    // ("Todos") en vez de necesitar un botón de limpieza aparte.
    fireEvent.click(within(filterBar).getByText('Afiliado activo'))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })
})
