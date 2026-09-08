import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
]

describe('Atletas — selección de perfiles incompletos', () => {
  it('Seleccionar entra en modo elegir sin tildar a todo el lote', () => {
    const onSelectAthlete = vi.fn()
    render(
      <I18nProvider>
        <AthletesSection athletes={athletes} canEdit onSelectAthlete={onSelectAthlete} />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Elegir entre 2 perfiles incompletos/ }))

    expect(screen.getByText('Elegí en la lista')).toBeTruthy()
    expect(screen.getByRole('button', { name: /perfiles incompletos de esta página/ })).toBeTruthy()
    expect(screen.queryByLabelText(/atletas seleccionados/)).toBeNull()
    expect(onSelectAthlete).not.toHaveBeenCalled()
  })

  it('Esta página tilda solo los incompletos visibles y Listo sale del modo', () => {
    const onSelectAthlete = vi.fn()
    render(
      <I18nProvider>
        <AthletesSection athletes={athletes} canEdit onSelectAthlete={onSelectAthlete} />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Elegir entre 2 perfiles incompletos/ }))
    fireEvent.click(screen.getByRole('button', { name: /perfiles incompletos de esta página/ }))

    expect(screen.getByLabelText('2 atletas seleccionados')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(screen.getByRole('button', { name: /Elegir entre 2 perfiles incompletos/ })).toBeTruthy()
    expect(screen.getByLabelText('2 atletas seleccionados')).toBeTruthy()
  })
})
