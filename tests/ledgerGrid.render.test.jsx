import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import FinanceSection from '../src/pages/admin/FinanceSection.jsx'

/**
 * Libro de caja como grilla: edición en celda, teclado estilo planilla y
 * pegado desde Excel. El service corre por el camino real (fetch interceptado).
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
    occurredOn: '2026-10-10',
    category: 'Afiliación',
    conceptKey: 'membership',
    description: 'Afiliación — Ana Torres',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1042',
    party: 'Ana Torres',
  },
  {
    id: 'manual-income-1',
    kind: 'income',
    manual: true,
    occurredOn: '2026-10-07',
    category: 'Sponsor',
    conceptKey: 'manual_income',
    description: 'Aporte anual Gym Titan',
    amount: 150000,
    currency: 'ARS',
  },
  {
    id: 'expense-1',
    kind: 'expense',
    manual: true,
    occurredOn: '2026-10-05',
    category: 'Logística',
    conceptKey: 'expense',
    description: 'Alquiler de plataforma',
    amount: 38000,
    currency: 'ARS',
  },
]

function totalsFor(rows) {
  const totals = rows.reduce((acc, row) => ({ ...acc, [row.kind]: acc[row.kind] + row.amount }), {
    income: 0,
    expense: 0,
  })
  return { ...totals, balance: totals.income - totals.expense }
}

function renderGrid({ patchStatus = 200, canEdit = true } = {}) {
  const calls = []
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push({ url, method, body: init?.body })
    if (url.includes('/api/finance/entries/bulk')) {
      return new Response(JSON.stringify({ created: 2 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (/\/api\/finance\/(expenses|incomes)\//.test(url) && method === 'PATCH') {
      return new Response(JSON.stringify(patchStatus === 200 ? { ok: true } : { error: 'Rechazado' }), {
        status: patchStatus,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/api/finance')) {
      return new Response(JSON.stringify({ rows: ROWS, totals: totalsFor(ROWS) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('{}', { status: 200 })
  })
  render(
    <I18nProvider>
      <FinanceSection canEdit={canEdit} />
    </I18nProvider>,
  )
  return { calls }
}

const reports = (calls) =>
  calls.filter((call) => call.method === 'GET' && call.url.includes('/api/finance?'))
const patches = (calls) => calls.filter((call) => call.method === 'PATCH')

/** Celda por columna dentro de la fila que contiene `text`. */
function cellOf(text, column) {
  const row = screen.getByText(text).closest('tr')
  return row.querySelector(`[data-ledger-cell][data-column="${column}"]`)
}

describe('Libro de caja — edición en celda', () => {
  it('Enter abre la edición y Enter guarda sin recargar todo el libro', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    const cell = cellOf('Alquiler de plataforma', 'amount')
    cell.focus()
    fireEvent.keyDown(cell, { key: 'Enter' })

    const input = within(cellOf('Alquiler de plataforma', 'amount')).getByRole('spinbutton')
    expect(input.value).toBe('38000')
    fireEvent.change(input, { target: { value: '41000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(patches(calls)).toHaveLength(1))
    const [patch] = patches(calls)
    expect(patch.url.endsWith('/api/finance/expenses/expense-1')).toBe(true)
    // El PATCH lleva el asiento completo: el contrato reemplaza todos los campos.
    expect(JSON.parse(patch.body)).toMatchObject({
      occurredOn: '2026-10-05',
      category: 'Logística',
      description: 'Alquiler de plataforma',
      amount: 41000,
    })
    // El cambio se ve al instante y no dispara otra lectura del reporte.
    await waitFor(() =>
      expect(cellOf('Alquiler de plataforma', 'amount').textContent).toMatch(/41\.000/),
    )
    // Los totales del período se recalculan con el cambio.
    expect(screen.getAllByText(/\$ 41\.000/).length).toBeGreaterThan(1)
    expect(reports(calls)).toHaveLength(1)
  })

  it('tipear sobre una celda la reemplaza, como en una planilla', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    const cell = cellOf('Alquiler de plataforma', 'category')
    cell.focus()
    fireEvent.keyDown(cell, { key: 'F' })

    const input = within(cellOf('Alquiler de plataforma', 'category')).getByRole('combobox')
    expect(input.value).toBe('F')
    fireEvent.change(input, { target: { value: 'Flete' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(patches(calls)).toHaveLength(1))
    expect(JSON.parse(patches(calls)[0].body)).toMatchObject({ category: 'Flete' })
  })

  it('tipear sobre una celda de importe o de fecha no rompe la edición', async () => {
    renderGrid()
    await screen.findByText('Alquiler de plataforma')

    // Regresión: `setSelectionRange` lanza en inputs number/date.
    const amount = cellOf('Alquiler de plataforma', 'amount')
    fireEvent.keyDown(amount, { key: '5' })
    expect(within(cellOf('Alquiler de plataforma', 'amount')).getByRole('spinbutton').value).toBe('5')

    const date = cellOf('Aporte anual Gym Titan', 'date')
    fireEvent.keyDown(date, { key: '1' })
    expect(cellOf('Aporte anual Gym Titan', 'date').querySelector('input[type="date"]')).toBeTruthy()
  })

  it('Escape descarta el cambio sin llamar al servidor', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    const cell = cellOf('Alquiler de plataforma', 'amount')
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = within(cellOf('Alquiler de plataforma', 'amount')).getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '99999' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() =>
      expect(within(cellOf('Alquiler de plataforma', 'amount')).queryByRole('spinbutton')).toBeNull(),
    )
    expect(patches(calls)).toHaveLength(0)
    expect(screen.queryByText(/99\.999/)).toBeNull()
  })

  it('un valor inválido no se guarda y muestra el motivo', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    fireEvent.keyDown(cellOf('Alquiler de plataforma', 'amount'), { key: 'Enter' })
    const input = within(cellOf('Alquiler de plataforma', 'amount')).getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect((await screen.findByRole('alert')).textContent).toMatch(/importe entero mayor a cero/i)
    expect(patches(calls)).toHaveLength(0)
    expect(within(cellOf('Alquiler de plataforma', 'amount')).getByRole('spinbutton')).toBeTruthy()
  })

  it('si el servidor rechaza el cambio, vuelve al valor anterior', async () => {
    const { calls } = renderGrid({ patchStatus: 500 })
    await screen.findByText('Alquiler de plataforma')

    fireEvent.keyDown(cellOf('Alquiler de plataforma', 'amount'), { key: 'Enter' })
    const input = within(cellOf('Alquiler de plataforma', 'amount')).getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '41000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(patches(calls)).toHaveLength(1))
    await waitFor(() =>
      expect(cellOf('Alquiler de plataforma', 'amount').textContent).toMatch(/38\.000/),
    )
  })

  it('los cobros aprobados son navegables pero no se editan', async () => {
    renderGrid()
    await screen.findByText('Afiliación — Ana Torres')

    const cell = cellOf('Afiliación — Ana Torres', 'description')
    expect(cell.getAttribute('role')).toBeNull()
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(within(cell).queryByRole('textbox')).toBeNull()
  })

  it('sin permiso de edición ninguna celda abre la edición', async () => {
    renderGrid({ canEdit: false })
    await screen.findByText('Alquiler de plataforma')

    const cell = cellOf('Alquiler de plataforma', 'amount')
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(within(cell).queryByRole('spinbutton')).toBeNull()
  })
})

describe('Libro de caja — teclado', () => {
  it('las flechas recorren las celdas en el orden que se ve', async () => {
    renderGrid()
    await screen.findByText('Alquiler de plataforma')

    const first = cellOf('Afiliación — Ana Torres', 'date')
    first.focus()

    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cellOf('Afiliación — Ana Torres', 'description'))

    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cellOf('Aporte anual Gym Titan', 'description'))

    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cellOf('Alquiler de plataforma', 'description'))

    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(cellOf('Aporte anual Gym Titan', 'description'))
  })

  it('Fin y Inicio saltan a los bordes de la fila y Tab avanza a la celda siguiente', async () => {
    renderGrid()
    await screen.findByText('Alquiler de plataforma')

    const date = cellOf('Alquiler de plataforma', 'date')
    date.focus()
    fireEvent.keyDown(date, { key: 'End' })
    expect(document.activeElement).toBe(cellOf('Alquiler de plataforma', 'amount'))

    fireEvent.keyDown(document.activeElement, { key: 'Home' })
    expect(document.activeElement).toBe(date)

    fireEvent.keyDown(date, { key: 'Tab' })
    expect(document.activeElement).toBe(cellOf('Alquiler de plataforma', 'description'))
  })

  it('Enter al confirmar baja a la celda de abajo', async () => {
    renderGrid()
    await screen.findByText('Alquiler de plataforma')

    fireEvent.keyDown(cellOf('Aporte anual Gym Titan', 'amount'), { key: 'Enter' })
    const input = within(cellOf('Aporte anual Gym Titan', 'amount')).getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '160000' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(document.activeElement).toBe(cellOf('Alquiler de plataforma', 'amount')),
    )
  })
})

describe('Libro de caja — pegado desde Excel', () => {
  function paste(text) {
    const target = screen.getByRole('form', { name: /cargar un movimiento/i })
    act(() => {
      fireEvent.paste(target, { clipboardData: { getData: () => text } })
    })
  }

  it('muestra una vista previa y carga el lote al confirmar', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    paste(
      'Fecha\tCategoría\tDetalle\tImporte\tTipo\n' +
        '05/10/2026\tSponsor\tAporte de marca\t100.000\tIngreso\n' +
        '06/10/2026\tLogística\tFlete de discos\t9.000\tEgreso',
    )

    const preview = await screen.findByRole('region', { name: /filas pegadas/i })
    expect(within(preview).getByText('Aporte de marca')).toBeTruthy()
    expect(within(preview).getByText(/2 de 2 filas listas/i)).toBeTruthy()
    // Nada se guarda hasta confirmar.
    expect(calls.some((call) => call.url.includes('/entries/bulk'))).toBe(false)

    fireEvent.click(within(preview).getByRole('button', { name: /cargar 2 movimientos/i }))

    await waitFor(() => {
      const bulk = calls.find((call) => call.url.includes('/entries/bulk'))
      expect(bulk).toBeTruthy()
      expect(JSON.parse(bulk.body).entries).toEqual([
        {
          kind: 'income',
          occurredOn: '2026-10-05',
          category: 'Sponsor',
          description: 'Aporte de marca',
          amount: 100000,
        },
        {
          kind: 'expense',
          occurredOn: '2026-10-06',
          category: 'Logística',
          description: 'Flete de discos',
          amount: 9000,
        },
      ])
    })
    await waitFor(() => expect(screen.queryByRole('region', { name: /filas pegadas/i })).toBeNull())
  })

  it('las filas inválidas se marcan y se omiten sin frenar a las demás', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    paste('31/02/2026\tSponsor\tAporte de marca\t100000\n06/10/2026\tLogística\tFlete de discos\t9000')

    const preview = await screen.findByRole('region', { name: /filas pegadas/i })
    expect(within(preview).getByText(/1 de 2 filas listas/i)).toBeTruthy()
    expect(within(preview).getByText(/fecha inválida/i)).toBeTruthy()

    fireEvent.click(within(preview).getByRole('button', { name: /cargar 1 movimiento/i }))
    await waitFor(() => {
      const bulk = calls.find((call) => call.url.includes('/entries/bulk'))
      expect(JSON.parse(bulk.body).entries).toHaveLength(1)
    })
  })

  it('Descartar cierra la vista previa sin guardar', async () => {
    const { calls } = renderGrid()
    await screen.findByText('Alquiler de plataforma')

    paste('06/10/2026\tLogística\tFlete de discos\t9000\n07/10/2026\tPremios\tMedallas\t5000')
    const preview = await screen.findByRole('region', { name: /filas pegadas/i })
    fireEvent.click(within(preview).getByRole('button', { name: /descartar/i }))

    expect(screen.queryByRole('region', { name: /filas pegadas/i })).toBeNull()
    expect(calls.some((call) => call.url.includes('/entries/bulk'))).toBe(false)
  })

  it('un valor suelto se pega normal, sin abrir la vista previa', async () => {
    renderGrid()
    await screen.findByText('Alquiler de plataforma')

    paste('Logística')

    expect(screen.queryByRole('region', { name: /filas pegadas/i })).toBeNull()
  })
})
