import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const fetchFinanceReport = vi.fn()
const createExpense = vi.fn()

vi.mock('../src/services/financeService.js', () => ({
  fetchFinanceReport: (...args) => fetchFinanceReport(...args),
  createExpense: (...args) => createExpense(...args),
}))

const FinanceSection = (await import('../src/pages/admin/FinanceSection.jsx')).default

afterEach(() => {
  cleanup()
  fetchFinanceReport.mockReset()
  createExpense.mockReset()
})

describe('Finanzas del panel', () => {
  it('muestra caja, filtros con label y el formulario de egreso', async () => {
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
    expect(screen.getByRole('heading', { name: /cargar egreso/i })).toBeTruthy()
    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalled())
  })
})
