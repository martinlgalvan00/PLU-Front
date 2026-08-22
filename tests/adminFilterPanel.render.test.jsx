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
  return render(
    <I18nProvider>
      <AthletesSection athletes={athletes} onSelectAthlete={vi.fn()} {...props} />
    </I18nProvider>,
  )
}

function openFiltersPanel() {
  fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
  return screen.getByRole('dialog', { name: 'Filtros' })
}

describe('Atletas — barra de filtros (panel único)', () => {
  it('renderiza un solo botón "Filtros" con las 5 facetas agrupadas adentro, sin caja de gimnasio rota', () => {
    const { container } = renderAthletes()

    // Un solo trigger, no un pill por filtro.
    expect(screen.getAllByRole('button', { name: /^Filtros/ })).toHaveLength(1)
    expect(container.querySelector('.admin-filter-pillrow')).toBeNull()

    const panel = openFiltersPanel()

    // El bug original: el filtro de gimnasio se renderizaba como un <select>
    // nativo suelto en el panel. Ahora es un combobox con búsqueda.
    expect(within(panel).queryByRole('combobox')).toBeNull()
    expect(within(panel).getByRole('listbox')).toBeTruthy()

    for (const label of ['Afiliación', 'Inscripción', 'Gimnasio', 'División', 'Fecha de alta']) {
      expect(within(panel).getByText(label)).toBeTruthy()
    }
  })

  it('busca y elige un gimnasio en el panel, y filtra la tabla sin cerrar el panel', () => {
    renderAthletes()
    const panel = openFiltersPanel()

    expect(within(panel).getByText('Maximal Power')).toBeTruthy()
    expect(within(panel).getByText('Pitbull Barbell')).toBeTruthy()

    fireEvent.click(within(panel).getByText('Pitbull Barbell'))

    // Agrupa varios filtros: elegir uno no cierra el panel (a diferencia del
    // popover por pill, donde cada uno cerraba al elegir).
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Quitar filtro' })).toHaveLength(1)

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()
  })

  it('el combobox de Gimnasio filtra la lista al tipear', () => {
    renderAthletes()
    const panel = openFiltersPanel()

    fireEvent.change(within(panel).getByPlaceholderText('Buscar…'), {
      target: { value: 'iron' },
    })

    expect(within(panel).getByText('Iron Temple')).toBeTruthy()
    expect(within(panel).queryByText('Maximal Power')).toBeNull()
    expect(within(panel).queryByText('Pitbull Barbell')).toBeNull()
  })

  it('elige un chip de Afiliación y lo puede limpiar desde el resumen', () => {
    renderAthletes()
    const panel = openFiltersPanel()

    fireEvent.click(within(panel).getByText('Afiliado activo'))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })

  it('cierra el panel abierto con Escape', () => {
    renderAthletes()
    openFiltersPanel()
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull()
  })
})
