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

  it('abre Más criterios debajo del botón, no en la esquina del panel', () => {
    const { filterBar } = renderAthletes()
    const button = within(filterBar).getByRole('button', { name: /Más criterios/ })
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 400,
      y: 180,
      top: 180,
      left: 400,
      bottom: 216,
      right: 520,
      width: 120,
      height: 36,
      toJSON() {},
    })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    fireEvent.click(button)
    const advanced = filterBar.querySelector('.admin-filters__advanced-popover')
    expect(advanced.style.position).toBe('fixed')
    expect(advanced.dataset.placed).toBe('true')
    expect(advanced.style.top).toBe('224px')
    expect(advanced.style.left).toBe('400px')
  })

  it('no mete Más criterios debajo del sidebar: respeta el main de admin', () => {
    const { filterBar } = renderAthletes()
    const button = within(filterBar).getByRole('button', { name: /Más criterios/ })
    const main = document.createElement('div')
    main.id = 'admin-main-content'
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      x: 80,
      y: 0,
      top: 0,
      left: 80,
      bottom: 800,
      right: 1024,
      width: 944,
      height: 800,
      toJSON() {},
    })
    vi.spyOn(button, 'closest').mockImplementation((selector) =>
      selector === '#admin-main-content' ? main : null,
    )
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 120,
      y: 180,
      top: 180,
      left: 120,
      bottom: 216,
      right: 240,
      width: 120,
      height: 36,
      toJSON() {},
    })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    fireEvent.click(button)
    const advanced = filterBar.querySelector('.admin-filters__advanced-popover')
    expect(Number.parseInt(advanced.style.left, 10)).toBeGreaterThanOrEqual(92)
    expect(advanced.style.left).toBe('120px')
  })

  it('abre gimnasio y fecha detrás de Más criterios', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Más criterios/ }))
    const advanced = filterBar.querySelector('.admin-filters__advanced-popover')
    expect(advanced).toBeTruthy()
    expect(within(advanced).getByRole('heading', { name: 'Más criterios' })).toBeTruthy()
    expect(within(advanced).getByLabelText('Gimnasio')).toBeTruthy()
    expect(within(advanced).getByRole('listbox', { name: 'Gimnasio' })).toBeTruthy()
    expect(within(advanced).getByText('Fecha de alta')).toBeTruthy()
    expect(within(advanced).getByRole('button', { name: 'Listo' })).toBeTruthy()
    expect(advanced.querySelector('select')).toBeNull()
  })

  it('elige un gimnasio desde Más criterios', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Más criterios/ }))
    const advanced = filterBar.querySelector('.admin-filters__advanced-popover')
    fireEvent.click(within(advanced).getByRole('option', { name: 'Pitbull Barbell' }))

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
