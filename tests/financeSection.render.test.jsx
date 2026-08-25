import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
  it('muestra caja, filtros con label y el botón de alta de egreso', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 75000, expense: 0, balance: 75000 },
      rows: [],
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    expect(await screen.findByRole('heading', { name: /caja del período/i })).toBeTruthy()
    expect(screen.getByLabelText(/resumen de caja/i)).toBeTruthy()
    expect(screen.getByLabelText(/^desde$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^hasta$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^buscar$/i)).toBeTruthy()
    // El formulario de egreso vive en un diálogo: a la vista queda el botón
    // de alta, no los campos.
    expect(screen.queryByLabelText(/^categoría$/i)).toBeNull()
    expect(screen.getByRole('button', { name: /cargar egreso/i })).toBeTruthy()
    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalled())
  })
})
