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

describe('Atletas — barra de filtros (pills + popover)', () => {
  it('muestra las 5 facetas como pills compactos, sin chips ni conteos a la vista', () => {
    const { filterBar } = renderAthletes()

    // Un pill por faceta: la barra es una sola fila silenciosa, los chips y
    // conteos viven dentro del popover de cada uno.
    for (const label of ['Afiliación', 'Inscripción', 'Gimnasio', 'División', 'Fecha de alta']) {
      expect(within(filterBar).getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy()
    }

    // Nada de la maquinaria interna queda expuesta sin abrir un popover.
    expect(filterBar.querySelector('.admin-filter-chips')).toBeNull()
    expect(within(filterBar).queryByText('Maximal Power')).toBeNull()
    expect(within(filterBar).queryByText('Afiliado activo')).toBeNull()
  })

  it('abre opciones de inscripción como menú vertical en el popover', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /^Inscripción/ }))
    const popover = filterBar.querySelector('.admin-filter-popover')
    expect(popover).toBeTruthy()
    expect(popover.querySelector('.admin-filter-group--menu')).toBeTruthy()
    expect(popover.querySelector('.admin-filter-chips--menu')).toBeTruthy()
    expect(within(popover).getByRole('button', { name: /^Todos/ })).toBeTruthy()
  })

  it('elige un gimnasio desde el popover y lo refleja en el pill', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /^Gimnasio/ }))

    // El select de gimnasio es un combobox con búsqueda: opciones como botones.
    const popover = filterBar.querySelector('.admin-filter-popover')
    expect(popover).toBeTruthy()
    fireEvent.click(within(popover).getByRole('option', { name: 'Pitbull Barbell' }))

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()

    // El pill activo muestra el valor elegido y su botón de limpieza.
    expect(within(filterBar).getByRole('button', { name: /^Gimnasio/ }).textContent).toContain(
      'Pitbull Barbell',
    )
    expect(within(filterBar).getByRole('button', { name: 'Quitar filtro' })).toBeTruthy()
  })

  it('filtra por Afiliación desde el popover y limpia con la X del pill', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /^Afiliación/ }))
    const popover = filterBar.querySelector('.admin-filter-popover')
    fireEvent.click(within(popover).getByRole('button', { name: /Afiliado activo/ }))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    // La X del pill activo vuelve al neutro sin reabrir el popover.
    fireEvent.click(within(filterBar).getByRole('button', { name: 'Quitar filtro' }))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })
})
