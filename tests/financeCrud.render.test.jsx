import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import FinanceSection from '../src/pages/admin/FinanceSection.jsx'

/**
 * CRUD de egresos de la caja: alta desde el botón del header, edición y
 * borrado desde las acciones de la fila, confirmación con snapshot del
 * asiento. El service se ejercita por el camino real (fetch interceptado),
 * mismo criterio que las stories de Finanzas.
 */

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(cleanup)

const ROWS = [
  {
    id: 'income-1',
    kind: 'income',
    occurredOn: '2026-08-10',
    category: 'Afiliación',
    description: 'Afiliación — Ana Torres',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1042',
    party: 'Ana Torres',
  },
  {
    id: 'expense-1',
    kind: 'expense',
    occurredOn: '2026-08-05',
    category: 'Logística',
    description: 'Alquiler de plataforma y discos',
    amount: 38000,
    currency: 'ARS',
    reference: null,
    party: null,
  },
]

function totalsFor(rows) {
  const totals = rows.reduce((acc, row) => ({ ...acc, [row.kind]: acc[row.kind] + row.amount }), {
    income: 0,
    expense: 0,
  })
  return { ...totals, balance: totals.income - totals.expense }
}

function renderFinance({ canEdit = true, rows = ROWS } = {}) {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), body: init?.body })
    if (url.includes('/api/finance/expenses')) {
      if ((init?.method ?? 'POST').toUpperCase() === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ expense: { id: 'expense-upserted' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/api/finance')) {
      return new Response(JSON.stringify({ rows, totals: totalsFor(rows) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch ? originalFetch(input, init) : new Response('{}', { status: 200 })
  })

  const utils = render(
    <I18nProvider>
      <FinanceSection canEdit={canEdit} />
    </I18nProvider>,
  )
  return { ...utils, calls }
}

function expenseCalls(calls) {
  return calls.filter((call) => call.url.includes('/api/finance/expenses'))
}

describe('Finanzas — CRUD de egresos', () => {
  it('registra un egreso desde el botón del header con el modal', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Alquiler de plataforma y discos')
    fireEvent.click(screen.getByRole('button', { name: /Cargar egreso/ }))

    const dialog = screen.getByRole('dialog')
    fireEvent.change(withinFields(dialog).description, { target: { value: 'Catering día 1' } })
    fireEvent.change(withinFields(dialog).category, { target: { value: 'Insumos' } })
    fireEvent.change(withinFields(dialog).amount, { target: { value: '15000' } })
    fireEvent.click(within(dialog).getByText('Registrar egreso'))

    await waitFor(() => {
      const writes = expenseCalls(calls).filter((call) => call.method === 'POST')
      expect(writes).toHaveLength(1)
      expect(JSON.parse(writes[0].body)).toMatchObject({
        category: 'Insumos',
        description: 'Catering día 1',
        amount: 15000,
      })
    })
  })

  it('edita un egreso desde la fila con el form precargado', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Alquiler de plataforma y discos')
    fireEvent.click(screen.getByRole('button', { name: 'Editar egreso' }))

    const dialog = screen.getByRole('dialog')
    expect(withinFields(dialog).amount.value).toBe('38000')
    expect(within(dialog).getByText('Guardar cambios')).toBeTruthy()

    fireEvent.change(withinFields(dialog).amount, { target: { value: '41000' } })
    fireEvent.click(within(dialog).getByText('Guardar cambios'))

    await waitFor(() => {
      const patches = expenseCalls(calls).filter((call) => call.method === 'PATCH')
      expect(patches).toHaveLength(1)
      expect(patches[0].url.endsWith('/api/finance/expenses/expense-1')).toBe(true)
      expect(JSON.parse(patches[0].body)).toMatchObject({ amount: 41000 })
    })
  })

  it('borra un egreso con confirmación y snapshot del asiento', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Alquiler de plataforma y discos')
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar egreso' }))

    const confirm = screen.getByRole('dialog')
    expect(within(confirm).getByText(/Alquiler de plataforma y discos/)).toBeTruthy()
    expect(within(confirm).getByText(/38.000/)).toBeTruthy()

    fireEvent.click(within(confirm).getByText('Eliminar'))

    await waitFor(() => {
      const deletes = expenseCalls(calls).filter((call) => call.method === 'DELETE')
      expect(deletes).toHaveLength(1)
      expect(deletes[0].url.endsWith('/api/finance/expenses/expense-1')).toBe(true)
    })
  })

  it('sin permiso de edición no expone alta ni acciones por fila', async () => {
    renderFinance({ canEdit: false })

    await screen.findByText('Alquiler de plataforma y discos')

    expect(screen.queryByRole('button', { name: /Cargar egreso/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar egreso' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar egreso' })).toBeNull()
  })
})

/** Helper: inputs del diálogo por label text. */
function withinFields(dialog) {
  const inputByLabel = (label) =>
    [...dialog.querySelectorAll('label')].find((node) => node.textContent.trim() === label)
      ?.querySelector('input')
  return {
    get category() {
      return inputByLabel('Categoría')
    },
    get description() {
      return inputByLabel('Descripción')
    },
    get amount() {
      return inputByLabel('Importe')
    },
  }
}
