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
  const filterBar = utils.container.querySelector('.admin-toolbar')
  return { ...utils, filterBar }
}

describe('Atletas — barra de filtros (búsqueda + estado + atajos)', () => {
  it('deja búsqueda, estado y atajos a la vista; el catálogo va a Filtros', () => {
    const { filterBar } = renderAthletes()

    expect(within(filterBar).getByPlaceholderText(/nombre, gimnasio, DNI o email/i)).toBeTruthy()
    expect(within(filterBar).getByRole('group', { name: 'Afiliación' })).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /Afiliado activo/ })).toBeTruthy()
    // Atajos a lo que pide atención.
    expect(within(filterBar).getByRole('button', { name: /Perfil incompleto/ })).toBeTruthy()
    expect(within(filterBar).getByRole('button', { name: /^Filtros/ })).toBeTruthy()
    // Gimnasio y el resto de criterios no ocupan la barra hasta abrir «Filtros».
    expect(within(filterBar).queryByRole('combobox', { name: 'Gimnasio' })).toBeNull()
    expect(within(filterBar).queryByRole('dialog')).toBeNull()
  })

  it('abre Filtros con el gimnasio como select nativo, sin listas anidadas', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /^Filtros/ }))
    const dialog = within(filterBar).getByRole('dialog', { name: /^Filtros/ })
    expect(within(dialog).getByRole('combobox', { name: 'Gimnasio' })).toBeTruthy()
    expect(within(dialog).queryByRole('listbox')).toBeNull()
    expect(within(dialog).queryByPlaceholderText(/buscar/i)).toBeNull()
  })

  it('elige un gimnasio y queda como etiqueta que se puede quitar', () => {
    const { filterBar } = renderAthletes()

    fireEvent.click(within(filterBar).getByRole('button', { name: /^Filtros/ }))
    const dialog = within(filterBar).getByRole('dialog', { name: /^Filtros/ })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Gimnasio' }), {
      target: { value: 'pitbull barbell' },
    })

    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
    expect(screen.queryByText('Martina Rivas')).toBeNull()
    expect(screen.queryByText('Florencia López')).toBeNull()

    const quitar = within(filterBar).getByRole('button', { name: /Quitar filtro: Gimnasio/ })
    fireEvent.click(quitar)
    expect(screen.getByText('Martina Rivas')).toBeTruthy()
  })

  it('filtra por Afiliación en un clic y vuelve a todos al soltarlo', () => {
    const { filterBar } = renderAthletes()

    const segment = within(filterBar).getByRole('button', { name: /Afiliado activo/ })
    fireEvent.click(segment)

    expect(segment.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Martina Rivas')).toBeTruthy()
    expect(screen.queryByText('Nicolás Aguirre')).toBeNull()

    fireEvent.click(segment)
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })

  it('filtra perfiles incompletos desde el atajo y suma "Limpiar todo" con otro criterio', () => {
    const { filterBar } = renderAthletes()

    const quick = within(filterBar).getByRole('button', { name: /Perfil incompleto/ })
    fireEvent.click(quick)
    expect(quick.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Martina Rivas')).toBeTruthy()

    fireEvent.click(within(filterBar).getByRole('button', { name: /Afiliado activo/ }))
    fireEvent.click(within(filterBar).getByRole('button', { name: 'Limpiar todo' }))
    expect(quick.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Nicolás Aguirre')).toBeTruthy()
  })
})
