import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const createCsv = vi.fn(() => true)
vi.mock('../src/services/exportService.js', () => ({ createCsv: (...args) => createCsv(...args) }))

const { default: AdminEventRegistrationsPanel } =
  await import('../src/components/admin/AdminEventRegistrationsPanel.jsx')

afterEach(() => {
  cleanup()
  createCsv.mockClear()
})

const event = { id: 'evt-1', slug: 'copa-norte-2026', title: 'Copa Norte', slots: 40 }
const athletes = [
  { id: 'a1', fullName: 'Ana Pérez', documentId: '30111222' },
  { id: 'a2', fullName: 'Bruno Díaz', documentId: '30222333' },
  { id: 'a3', fullName: 'Carla Gómez', documentId: '30333444' },
]
const registrations = [
  {
    id: 'r1',
    athleteId: 'a1',
    eventSlug: event.slug,
    category: 'Raw',
    division: 'Masters',
    secondaryDivision: 'Open',
    modalities: ['full_power', 'bench'],
    status: 'confirmada',
    paymentOrderId: 'o1',
  },
  {
    id: 'r2',
    athleteId: 'a2',
    eventSlug: event.slug,
    category: 'Raw',
    division: 'Open',
    modalities: ['full_power'],
    status: 'pendiente_pago',
    paymentOrderId: 'o2',
  },
  {
    id: 'r3',
    athleteId: 'a3',
    eventSlug: event.slug,
    category: 'Equipped',
    division: 'Junior',
    modalities: ['push_pull'],
    status: 'validacion_manual',
    paymentOrderId: 'o3',
  },
]
const payments = [
  { id: 'o1', athleteId: 'a1', amount: 90000, status: 'aprobado', method: 'mercado_pago' },
  { id: 'o2', athleteId: 'a2', amount: 60000, status: 'pendiente', method: 'mercado_pago' },
  {
    id: 'o3',
    athleteId: 'a3',
    amount: 60000,
    status: 'validacion_manual',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
  },
]

function renderPanel(props = {}) {
  return render(
    <I18nProvider>
      <AdminEventRegistrationsPanel
        athletes={athletes}
        event={event}
        payments={payments}
        registrations={registrations}
        {...props}
      />
    </I18nProvider>,
  )
}

const names = () =>
  [...document.querySelectorAll('.admin-event-regs__identity strong')].map(
    (node) => node.textContent,
  )

describe('seguimiento de inscripciones del evento', () => {
  it('resume inscriptos contra el cupo, confirmadas, pendientes y lo cobrado', () => {
    renderPanel()
    const summary = document.querySelector('.admin-event-regs__summary')
    expect(summary.textContent).toContain('Inscriptos3de 40 lugares')
    expect(summary.textContent).toContain('Confirmadas1')
    expect(summary.textContent).toContain('Pendientes de pago2')
    expect(summary.textContent).toMatch(/Cobrado\$\s?90\.000/)
    expect(summary.textContent).toMatch(/Por cobrar\$\s?120\.000/)
  })

  it('cada fila dice la segunda división al 50%, la modalidad, el importe y el medio', () => {
    renderPanel()
    const row = screen.getByText('Ana Pérez').closest('li')
    expect(row.textContent).toContain('Masters + Open (50%)')
    expect(row.textContent).toContain('Full Power + Especialista en banco')
    expect(row.textContent).toMatch(/\$\s?90\.000/)
    expect(row.textContent).toContain('Mercado Pago')
  })

  it('filtra por división (incluida la segunda), medio y búsqueda, y se limpia', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('División'), { target: { value: 'Open' } })
    expect(names()).toEqual(['Ana Pérez', 'Bruno Díaz'])
    expect(screen.getByText('2 de 3 inscripciones')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Medio de pago'), {
      target: { value: 'mercado_pago' },
    })
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre, DNI o email'), {
      target: { value: 'diaz' },
    })
    expect(names()).toEqual(['Bruno Díaz'])

    const count = document.querySelector('.admin-event-regs__count')
    fireEvent.click(within(count).getByRole('button', { name: 'Quitar filtros' }))
    expect(names()).toEqual(['Ana Pérez', 'Bruno Díaz', 'Carla Gómez'])
  })

  it('"Pago aprobado" ahora encuentra las inscripciones con la orden acreditada', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /Pago aprobado/ }))
    expect(names()).toEqual(['Ana Pérez'])
  })

  it('descarga el CSV de lo filtrado con columnas legibles', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Equipped' } })
    fireEvent.click(screen.getByRole('button', { name: /Descargar CSV filtrado/ }))
    expect(createCsv).toHaveBeenCalledTimes(1)
    const [filename, rows] = createCsv.mock.calls[0]
    expect(filename).toBe('inscripciones-copa-norte-2026.csv')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      Atleta: 'Carla Gómez',
      División: 'Junior',
      Modalidad: 'Push-Pull',
      'Medio de pago': 'Transferencia',
      Importe: 60000,
    })
  })

  it('sin inscripciones no muestra un resumen en cero ni filtros', () => {
    renderPanel({ registrations: [], payments: [] })
    expect(document.querySelector('.admin-event-regs__summary')).toBeNull()
    expect(screen.queryByPlaceholderText('Buscar por nombre, DNI o email')).toBeNull()
    expect(screen.getByText('Todavía no hay inscripciones')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Descargar CSV/ }).disabled).toBe(true)
  })
})
