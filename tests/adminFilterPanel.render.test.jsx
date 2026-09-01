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

describe('Atletas — barra de filtros (panel único)', () => {
  it('muestra search + Filtros sin exponer facetas hasta abrir el panel', () => {
    const { filterBar } = renderAthletes()

    expect(filterBar.classList.contains('admin-filters--panel')).toBe(true)
    expect(within(filterBar).getByRole('button', { name: /Filtros/ })).toBeTruthy()
    expect(filterBar.querySelector('.admin-filter-panel')).toBeNull()
    expect(within(filterBar).queryByText('Afiliado activo')).toBeNull()
    expect(within(filterBar).queryByText('Maximal Power')).toBeNull()
  })

  it('abre el panel con rieles de chips y meta (gimnasio + fecha)', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Filtros/ }))
    const panel = filterBar.querySelector('.admin-filter-panel')
    expect(panel).toBeTruthy()
    expect(panel.querySelector('.admin-filter-panel__stack')).toBeTruthy()
    expect(panel.querySelector('.admin-filter-panel__meta')).toBeTruthy()
    expect(panel.querySelector('.admin-filter-panel__field--select')).toBeTruthy()
    expect(panel.querySelector('.admin-filter-panel__field--date')).toBeTruthy()
    expect(within(panel).getByText('Afiliación')).toBeTruthy()
    expect(within(panel).getByText('Inscripción')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: /Afiliado activo/ })).toBeTruthy()
  })

  it('elige un gimnasio desde el combobox del panel', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Filtros/ }))
    const panel = filterBar.querySelector('.admin-filter-panel')
    fireEvent.click(within(panel).getByRole('option', { name: 'Pitbull Barbell' }))

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()
    expect(within(filterBar).getByRole('button', { name: 'Quitar filtro' })).toBeTruthy()
  })

  it('filtra por Afiliación y limpia con el chip activo del panel', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Filtros/ }))
    const panel = filterBar.querySelector('.admin-filter-panel')
    fireEvent.click(within(panel).getByRole('button', { name: /Afiliado activo/ }))

    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    fireEvent.click(within(filterBar).getByRole('button', { name: 'Quitar filtro' }))
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })
})
