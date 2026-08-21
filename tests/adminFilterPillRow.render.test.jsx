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

describe('Atletas — barra de filtros (pills + popover)', () => {
  it('renderiza los 5 pills en una sola fila, sin caja de gimnasio rota', () => {
    const { container } = renderAthletes()

    const row = container.querySelector('.admin-filter-pillrow')
    expect(row).toBeTruthy()
    expect(row.querySelectorAll(':scope > .admin-filter-pill')).toHaveLength(5)
    // El bug original: el filtro de gimnasio se renderizaba como un <select>
    // nativo suelto en el panel. Ahora vive detrás de un pill + popover.
    expect(container.querySelector('.admin-filter-pillrow select')).toBeNull()

    for (const label of ['Afiliación', 'Inscripción', 'Gimnasio', 'División', 'Fecha de alta']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeTruthy()
    }
  })

  it('abre el combobox de Gimnasio con búsqueda y filtra la tabla al elegir uno', () => {
    renderAthletes()

    fireEvent.click(screen.getByRole('button', { name: 'Gimnasio' }))

    const popover = screen.getByRole('dialog', { name: 'Gimnasio' })
    expect(within(popover).getByPlaceholderText('Buscar…')).toBeTruthy()
    expect(within(popover).getByText('Maximal Power')).toBeTruthy()
    expect(within(popover).getByText('Pitbull Barbell')).toBeTruthy()

    fireEvent.click(within(popover).getByText('Pitbull Barbell'))

    // El popover se cierra solo al elegir, y el pill queda activo con clear.
    expect(screen.queryByRole('dialog', { name: 'Gimnasio' })).toBeNull()
    expect(screen.getByRole('button', { name: /Gimnasio.*Pitbull Barbell/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Quitar filtro' })).toHaveLength(1)

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()
  })

  it('el combobox de Gimnasio filtra la lista al tipear', () => {
    renderAthletes()

    fireEvent.click(screen.getByRole('button', { name: 'Gimnasio' }))
    const popover = screen.getByRole('dialog', { name: 'Gimnasio' })
    fireEvent.change(within(popover).getByPlaceholderText('Buscar…'), {
      target: { value: 'iron' },
    })

    expect(within(popover).getByText('Iron Temple')).toBeTruthy()
    expect(within(popover).queryByText('Maximal Power')).toBeNull()
    expect(within(popover).queryByText('Pitbull Barbell')).toBeNull()
  })

  it('abre el popover de Afiliación, aplica un chip y lo puede limpiar', () => {
    renderAthletes()

    fireEvent.click(screen.getByRole('button', { name: 'Afiliación' }))
    const popover = screen.getByRole('dialog', { name: 'Afiliación' })
    fireEvent.click(within(popover).getByText('Afiliado activo'))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })

  it('cierra el popover abierto con Escape', () => {
    renderAthletes()

    fireEvent.click(screen.getByRole('button', { name: 'División' }))
    expect(screen.getByRole('dialog', { name: 'División' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'División' })).toBeNull()
  })
})
