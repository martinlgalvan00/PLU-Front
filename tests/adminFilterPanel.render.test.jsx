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
  const filterBar = utils.container.querySelector('.admin-filters')
  return { ...utils, filterBar }
}

describe('Atletas — barra de filtros (búsqueda + riel + pills)', () => {
  it('deja búsqueda, afiliación y colas a la vista; el catálogo va a Más criterios', () => {
    const { filterBar } = renderAthletes()

    expect(filterBar.classList.contains('admin-filters--popover')).toBe(true)
    expect(within(filterBar).getByPlaceholderText(/nombre, gimnasio, DNI o email/i)).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /Afiliado activo/ })).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /^perfil/i })).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /^inscripción/i })).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /Más criterios/ })).toBeTruthy()
    expect(within(filterBar).queryByRole('button', { name: /^gimnasio/i })).toBeNull()
    expect(within(filterBar).queryByRole('button', { name: /^pendiente de pago$/i })).toBeNull()
    expect(within(filterBar).queryByText('Maximal Power')).toBeNull()
    expect(within(filterBar).queryByText(/registros/i)).toBeNull()
  })

  it('abre gimnasio desde Más criterios y no usa un select nativo', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Más criterios/ }))
    const dialog = within(filterBar).getByRole('dialog', { name: /Más criterios/ })
    expect(within(dialog).getByRole('listbox', { name: 'Gimnasio' })).toBeTruthy()
    expect(dialog.querySelector('select')).toBeNull()
  })

  it('elige un gimnasio desde Más criterios', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Más criterios/ }))
    const dialog = within(filterBar).getByRole('dialog', { name: /Más criterios/ })
    fireEvent.click(within(dialog).getByRole('option', { name: 'Pitbull Barbell' }))

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()
    expect(within(filterBar).getByRole('button', { name: /Limpiar filtros/ })).toBeTruthy()
  })

  it('filtra por Afiliación en un clic y limpia los criterios activos', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Afiliado activo/ }))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Limpiar filtros/ }))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })

  it('filtra perfiles incompletos desde el pill de Perfil', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /^perfil/i }))
    const dialog = within(filterBar).getByRole('dialog', { name: /^perfil/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /perfil incompleto/i }))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /Limpiar filtros/ })).toBeTruthy()
  })
})
