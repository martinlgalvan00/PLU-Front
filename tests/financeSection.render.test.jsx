import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const fetchFinanceReport = vi.fn()
const createExpense = vi.fn()
const updateExpense = vi.fn()
const deleteExpense = vi.fn()

vi.mock('../src/services/financeService.js', () => ({
  fetchFinanceReport: (...args) => fetchFinanceReport(...args),
  createExpense: (...args) => createExpense(...args),
  updateExpense: (...args) => updateExpense(...args),
  deleteExpense: (...args) => deleteExpense(...args),
}))

const FinanceSection = (await import('../src/pages/admin/FinanceSection.jsx')).default

afterEach(() => {
  cleanup()
  fetchFinanceReport.mockReset()
  createExpense.mockReset()
  updateExpense.mockReset()
  deleteExpense.mockReset()
})

const SAMPLE_ROWS = [
  {
    id: 'income-m',
    kind: 'income',
    occurredOn: '2026-08-10',
    category: 'Afiliación',
    conceptKey: 'membership',
    description: 'Afiliación — Ana Torres',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1042',
    party: 'Ana Torres',
  },
  {
    id: 'income-r',
    kind: 'income',
    occurredOn: '2026-08-11',
    category: 'Inscripción',
    conceptKey: 'registration',
    description: 'Inscripción — Bruno Diaz',
    amount: 85000,
    currency: 'ARS',
    reference: 'ORD-1043',
    party: 'Bruno Diaz',
  },
  {
    id: 'expense-1',
    kind: 'expense',
    occurredOn: '2026-08-05',
    category: 'Logística',
    conceptKey: 'expense',
    description: 'Alquiler de plataforma',
    amount: 10000,
    currency: 'ARS',
    reference: null,
    party: null,
  },
  {
    id: 'expense-2',
    kind: 'expense',
    occurredOn: '2026-08-06',
    category: 'Premios',
    conceptKey: 'expense',
    description: 'Medallas Open',
    amount: 5000,
    currency: 'ARS',
    reference: null,
    party: null,
  },
]

describe('Finanzas del panel', () => {
  it('muestra caja compacta, presets de período y alta de egreso', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 75000, expense: 0, balance: 75000 },
      rows: [],
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    expect(await screen.findByRole('heading', { name: /libro de caja/i })).toBeTruthy()
    expect(screen.getByLabelText(/resumen de caja/i)).toBeTruthy()
    expect(screen.getByLabelText(/^desde$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^hasta$/i)).toBeTruthy()
    expect(screen.getByRole('search')).toBeTruthy()
    expect(screen.getByRole('group', { name: /^tipo$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /este mes/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /mes anterior/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /últimos 30 días/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /este año/i })).toBeTruthy()
    // El formulario de egreso vive en un diálogo: a la vista queda el botón
    // de alta, no los campos del modal.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /cargar egreso/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /actualizar/i })).toBeTruthy()
    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalled())
  })

  it('al elegir mes anterior cambia el rango y vuelve a cargar', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /mes anterior/i }))

    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalledTimes(2))
    const lastCall = fetchFinanceReport.mock.calls.at(-1)?.[0]
    expect(lastCall?.from).toMatch(/^\d{4}-\d{2}-01$/)
    expect(lastCall?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(lastCall.from).not.toBe(lastCall.to)
  })

  it('al elegir este año fija el rango desde el 1 de enero', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /este año/i }))

    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalledTimes(2))
    const lastCall = fetchFinanceReport.mock.calls.at(-1)?.[0]
    const year = new Date().getFullYear()
    expect(lastCall?.from).toBe(`${year}-01-01`)
    expect(lastCall?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('filtra por composición del período y actualiza filas + conteo', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 127000, expense: 15000, balance: 112000 },
      rows: SAMPLE_ROWS,
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    expect(await screen.findByText('Afiliación — Ana Torres')).toBeTruthy()
    expect(screen.getByText('Inscripción — Bruno Diaz')).toBeTruthy()
    expect(screen.getByText('Alquiler de plataforma')).toBeTruthy()

    const overview = screen.getByLabelText(/resumen de caja/i)
    const breakdown = screen.getByRole('group', { name: /composición del período/i })
    expect(breakdown).toBeTruthy()
    expect(within(overview).getByText(/4 movimientos/i)).toBeTruthy()

    fireEvent.click(within(breakdown).getByRole('button', { name: /afiliación/i }))

    await waitFor(() => {
      expect(screen.getByText('Afiliación — Ana Torres')).toBeTruthy()
      expect(screen.queryByText('Inscripción — Bruno Diaz')).toBeNull()
      expect(screen.queryByText('Alquiler de plataforma')).toBeNull()
      expect(within(overview).getByText(/1 movimientos/i)).toBeTruthy()
      expect(screen.getByRole('button', { name: /^limpiar filtros$/i })).toBeTruthy()
    })
  })

  it('filtra por tipo con chips y limpia todos los filtros del listado', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 127000, expense: 15000, balance: 112000 },
      rows: SAMPLE_ROWS,
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    expect(await screen.findByText('Afiliación — Ana Torres')).toBeTruthy()

    const kindGroup = screen.getByRole('group', { name: /^tipo$/i })
    fireEvent.click(within(kindGroup).getByRole('button', { name: /egresos/i }))

    await waitFor(() => {
      expect(screen.queryByText('Afiliación — Ana Torres')).toBeNull()
      expect(screen.getByText('Alquiler de plataforma')).toBeTruthy()
      expect(screen.getByText('Medallas Open')).toBeTruthy()
    })

    expect(screen.getByRole('group', { name: /rubro de egreso/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^limpiar filtros$/i }))

    await waitFor(() => {
      expect(screen.getByText('Afiliación — Ana Torres')).toBeTruthy()
      expect(screen.getByText('Inscripción — Bruno Diaz')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^limpiar filtros$/i })).toBeNull()
    })
  })
})
