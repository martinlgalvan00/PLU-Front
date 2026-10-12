import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import FinanceSection from '../src/pages/admin/FinanceSection.jsx'

/**
 * CRUD de asientos manuales de la caja (egresos e ingresos): alta desde la
 * fila de carga, edición y borrado desde las acciones de la fila, confirmación
 * con snapshot del asiento. El service se ejercita por el camino real (fetch
 * interceptado), mismo criterio que las stories de Finanzas.
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
    conceptKey: 'membership',
    description: 'Afiliación — Ana Torres',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1042',
    party: 'Ana Torres',
  },
  {
    id: 'expense-1',
    kind: 'expense',
    manual: true,
    occurredOn: '2026-08-05',
    category: 'Logística',
    conceptKey: 'expense',
    description: 'Alquiler de plataforma y discos',
    amount: 38000,
    currency: 'ARS',
    reference: null,
    party: null,
  },
  {
    id: 'manual-income-1',
    kind: 'income',
    manual: true,
    occurredOn: '2026-08-07',
    category: 'Sponsor',
    conceptKey: 'manual_income',
    description: 'Aporte anual Gym Titan',
    amount: 150000,
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
    if (/\/api\/finance\/(expenses|incomes)/.test(url)) {
      if ((init?.method ?? 'POST').toUpperCase() === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ expense: { id: 'entry-upserted' } }), {
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

function entryCalls(calls, path = 'expenses') {
  return calls.filter((call) => call.url.includes(`/api/finance/${path}`))
}

describe('Finanzas — CRUD de asientos manuales', () => {
  it('registra un egreso desde la fila de carga', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Alquiler de plataforma y discos')
    const composer = screen.getByRole('form', { name: /cargar un movimiento/i })
    fireEvent.click(within(composer).getByRole('radio', { name: /^egreso$/i }))
    fireEvent.change(within(composer).getByLabelText('Descripción'), {
      target: { value: 'Catering día 1' },
    })
    fireEvent.change(within(composer).getByLabelText('Categoría'), { target: { value: 'Insumos' } })
    fireEvent.change(within(composer).getByLabelText('Importe'), { target: { value: '15000' } })
    fireEvent.click(within(composer).getByRole('button', { name: /agregar egreso/i }))

    await waitFor(() => {
      const writes = entryCalls(calls).filter((call) => call.method === 'POST')
      expect(writes).toHaveLength(1)
      expect(JSON.parse(writes[0].body)).toMatchObject({
        category: 'Insumos',
        description: 'Catering día 1',
        amount: 15000,
      })
    })
  })

  it('registra un ingreso manual en su propio endpoint', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Alquiler de plataforma y discos')
    const composer = screen.getByRole('form', { name: /cargar un movimiento/i })
    fireEvent.change(within(composer).getByLabelText('Descripción'), {
      target: { value: 'Donación torneo' },
    })
    fireEvent.change(within(composer).getByLabelText('Categoría'), { target: { value: 'Donación' } })
    fireEvent.change(within(composer).getByLabelText('Importe'), { target: { value: '20000' } })
    fireEvent.click(within(composer).getByRole('button', { name: /agregar ingreso/i }))

    await waitFor(() => {
      const writes = entryCalls(calls, 'incomes').filter((call) => call.method === 'POST')
      expect(writes).toHaveLength(1)
      expect(JSON.parse(writes[0].body)).toMatchObject({ category: 'Donación', amount: 20000 })
    })
    expect(entryCalls(calls, 'expenses').filter((call) => call.method === 'POST')).toHaveLength(0)
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
      const patches = entryCalls(calls).filter((call) => call.method === 'PATCH')
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
      const deletes = entryCalls(calls).filter((call) => call.method === 'DELETE')
      expect(deletes).toHaveLength(1)
      expect(deletes[0].url.endsWith('/api/finance/expenses/expense-1')).toBe(true)
    })
  })

  it('edita un ingreso manual contra el endpoint de ingresos', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Aporte anual Gym Titan')
    fireEvent.click(screen.getByRole('button', { name: 'Editar ingreso' }))

    const dialog = screen.getByRole('dialog')
    expect(withinFields(dialog).amount.value).toBe('150000')
    fireEvent.change(withinFields(dialog).amount, { target: { value: '160000' } })
    fireEvent.click(within(dialog).getByText('Guardar cambios'))

    await waitFor(() => {
      const patches = entryCalls(calls, 'incomes').filter((call) => call.method === 'PATCH')
      expect(patches).toHaveLength(1)
      expect(patches[0].url.endsWith('/api/finance/incomes/manual-income-1')).toBe(true)
      expect(JSON.parse(patches[0].body)).toMatchObject({ amount: 160000 })
    })
  })

  it('borra un ingreso manual con confirmación', async () => {
    const { calls } = renderFinance()

    await screen.findByText('Aporte anual Gym Titan')
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ingreso' }))

    const confirm = screen.getByRole('dialog')
    expect(within(confirm).getByText(/Aporte anual Gym Titan/)).toBeTruthy()
    fireEvent.click(within(confirm).getByText('Eliminar'))

    await waitFor(() => {
      const deletes = entryCalls(calls, 'incomes').filter((call) => call.method === 'DELETE')
      expect(deletes).toHaveLength(1)
      expect(deletes[0].url.endsWith('/api/finance/incomes/manual-income-1')).toBe(true)
    })
  })

  it('los cobros aprobados no se editan desde el libro', async () => {
    renderFinance()

    await screen.findByText('Afiliación — Ana Torres')
    // Una fila de pago no tiene acciones: sólo los asientos manuales (un
    // egreso y un ingreso) exponen editar y eliminar.
    expect(screen.getAllByRole('button', { name: /^editar (egreso|ingreso)$/i })).toHaveLength(2)
  })

  it('sin permiso de edición no expone alta ni acciones por fila', async () => {
    renderFinance({ canEdit: false })

    await screen.findByText('Alquiler de plataforma y discos')

    expect(screen.queryByRole('form', { name: /cargar un movimiento/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^editar (egreso|ingreso)$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^eliminar (egreso|ingreso)$/i })).toBeNull()
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
