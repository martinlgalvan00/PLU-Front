import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import LedgerTotalsBar from '../src/components/admin/LedgerTotalsBar.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

// Intl usa espacios no cortantes entre el símbolo y el importe.
const flat = (text) => text.replace(/\s/g, ' ')

function renderBar(props) {
  return render(
    <I18nProvider>
      <LedgerTotalsBar income={0} expense={0} balance={0} count={0} total={0} {...props} />
    </I18nProvider>,
  )
}

function itemValue(label) {
  const term = screen.getByText(label)
  return flat(term.parentElement.querySelector('dd').textContent)
}

describe('LedgerTotalsBar', () => {
  it('muestra ingresos, egresos y saldo de las filas visibles', () => {
    renderBar({ income: 150000, expense: 40000, balance: 110000, count: 12, total: 12 })

    expect(itemValue('Ingresos')).toBe('$ 150.000')
    expect(itemValue('Egresos')).toBe('$ 40.000')
    expect(itemValue('Saldo')).toBe('$ 110.000')
  })

  it('sin filtros informa la cantidad de movimientos', () => {
    renderBar({ count: 12, total: 12, filtered: false })

    expect(screen.getByText('12 movimientos')).toBeTruthy()
    expect(screen.queryByText(/Mostrando/)).toBeNull()
  })

  it('con filtros informa "N de M" y nombra el grupo con ese texto', () => {
    renderBar({ count: 3, total: 12, filtered: true })

    const group = screen.getByRole('group', { name: 'Mostrando 3 de 12' })
    expect(within(group).getByText('Mostrando 3 de 12')).toBeTruthy()
  })

  it('un saldo negativo conserva el signo', () => {
    renderBar({ income: 0, expense: 207000, balance: -207000, count: 6, total: 34, filtered: true })

    expect(itemValue('Saldo')).toMatch(/^-\s?\$ 207\.000$/)
  })
})
