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

describe('Atletas — barra de filtros (facetas etiquetadas)', () => {
  it('muestra búsqueda y rieles de afiliación/inscripción, con el resto en Más criterios', () => {
    const { filterBar } = renderAthletes()

    expect(filterBar.classList.contains('admin-filters--panel')).toBe(false)
    expect(within(filterBar).getByPlaceholderText(/Buscar/i)).toBeTruthy()
    expect(within(filterBar).getByText('Afiliación')).toBeTruthy()
    expect(within(filterBar).getByText('Inscripción')).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /Afiliado activo/ })).toBeTruthy()
    expect(within(filterBar).queryByText('Maximal Power')).toBeNull()
    expect(within(filterBar).getByRole('button', { name: /Más criterios/ })).toBeTruthy()
  })

  it('abre gimnasio y fecha detrás de Más criterios', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Más criterios/ }))
    const advanced = filterBar.querySelector('.admin-filters__advanced-popover')
    expect(advanced).toBeTruthy()
    expect(within(advanced).getByLabelText('Gimnasio')).toBeTruthy()
    expect(within(advanced).getByText('Fecha de alta')).toBeTruthy()
  })

  it('elige un gimnasio desde Más criterios', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Más criterios/ }))
    const advanced = filterBar.querySelector('.admin-filters__advanced-popover')
    fireEvent.change(within(advanced).getByLabelText('Gimnasio'), {
      target: { value: 'pitbull barbell' },
    })

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()
    expect(within(filterBar).getByRole('button', { name: /Limpiar filtros/ })).toBeTruthy()
  })

  it('filtra por Afiliación y limpia los criterios activos', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Afiliado activo/ }))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Limpiar filtros/ }))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })
})
