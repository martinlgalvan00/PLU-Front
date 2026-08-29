import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByLabelText(/^buscar$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^tipo$/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /este mes/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /mes anterior/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /últimos 30 días/i })).toBeTruthy()
    // El formulario de egreso vive en un diálogo: a la vista queda el botón
    // de alta, no los campos.
    expect(screen.queryByLabelText(/^categoría$/i)).toBeNull()
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
})
