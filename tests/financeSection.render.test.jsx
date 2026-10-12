import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const fetchFinanceReport = vi.fn()
const createEntry = vi.fn()
const updateEntry = vi.fn()
const deleteEntry = vi.fn()

vi.mock('../src/services/financeService.js', () => ({
  fetchFinanceReport: (...args) => fetchFinanceReport(...args),
  createEntry: (...args) => createEntry(...args),
  updateEntry: (...args) => updateEntry(...args),
  deleteEntry: (...args) => deleteEntry(...args),
}))

const FinanceSection = (await import('../src/pages/admin/FinanceSection.jsx')).default

afterEach(() => {
  cleanup()
  fetchFinanceReport.mockReset()
  createEntry.mockReset()
  updateEntry.mockReset()
  deleteEntry.mockReset()
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
    manual: true,
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
    manual: true,
    category: 'Premios',
    conceptKey: 'expense',
    description: 'Medallas Open',
    amount: 5000,
    currency: 'ARS',
    reference: null,
    party: null,
  },
]

/** El selector de categoría del listado (la fila de carga tiene otro campo "Categoría"). */
function categorySelect() {
  return screen
    .getAllByRole('combobox', { name: /^categoría$/i })
    .find((element) => element.tagName === 'SELECT')
}

describe('Finanzas del panel', () => {
  it('muestra caja compacta, presets de período y fila de carga', async () => {
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
    // Las fechas a mano viven detrás del chip "Personalizado": el período se
    // elige casi siempre con un preset.
    expect(screen.queryByLabelText(/^desde$/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /personalizado/i }))
    expect(screen.getByLabelText(/^desde$/i)).toBeTruthy()
    expect(screen.getByLabelText(/^hasta$/i)).toBeTruthy()
    expect(screen.getByRole('search')).toBeTruthy()
    expect(screen.getByRole('group', { name: /^tipo$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /este mes/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /mes anterior/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /últimos 30 días/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /este año/i })).toBeTruthy()
    // La carga es una fila en línea (sin diálogo): tipo, fecha, rubro, detalle
    // e importe, con un solo botón que nombra el tipo elegido.
    expect(screen.queryByRole('dialog')).toBeNull()
    const composer = screen.getByRole('form', { name: /cargar un movimiento/i })
    expect(within(composer).getByRole('radio', { name: /^ingreso$/i })).toBeTruthy()
    expect(within(composer).getByRole('radio', { name: /^egreso$/i })).toBeTruthy()
    expect(within(composer).getByRole('button', { name: /agregar ingreso/i })).toBeTruthy()
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

  it('filtra por categoría y actualiza filas + conteo', async () => {
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
    expect(within(overview).getByText(/4 movimientos/i)).toBeTruthy()

    // Un solo selector de categoría: cobros por concepto, lo manual por rubro.
    fireEvent.change(categorySelect(), { target: { value: 'concept:membership' } })

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

    expect(categorySelect()).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^limpiar filtros$/i }))

    await waitFor(() => {
      expect(screen.getByText('Afiliación — Ana Torres')).toBeTruthy()
      expect(screen.getByText('Inscripción — Bruno Diaz')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^limpiar filtros$/i })).toBeNull()
    })
  })

  it('carga un ingreso manual desde la fila y limpia el detalle al guardarlo', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })
    createEntry.mockResolvedValue({})

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    const composer = await screen.findByRole('form', { name: /cargar un movimiento/i })
    fireEvent.change(within(composer).getByLabelText(/^categoría$/i), {
      target: { value: 'Sponsor' },
    })
    fireEvent.change(within(composer).getByLabelText(/^descripción$/i), {
      target: { value: 'Aporte anual Gym Titan' },
    })
    fireEvent.change(within(composer).getByLabelText(/^importe$/i), {
      target: { value: '150000' },
    })
    fireEvent.click(within(composer).getByRole('button', { name: /agregar ingreso/i }))

    await waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))
    const [kind, payload] = createEntry.mock.calls[0]
    expect(kind).toBe('income')
    expect(payload).toMatchObject({
      category: 'Sponsor',
      description: 'Aporte anual Gym Titan',
      amount: 150000,
    })
    await waitFor(() => expect(within(composer).getByLabelText(/^descripción$/i).value).toBe(''))
    // Tipo y fecha se conservan: se suelen cargar varios seguidos.
    expect(within(composer).getByRole('radio', { name: /^ingreso$/i }).checked).toBe(true)
  })

  it('al elegir egreso la fila carga un egreso', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })
    createEntry.mockResolvedValue({})

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    const composer = await screen.findByRole('form', { name: /cargar un movimiento/i })
    fireEvent.click(within(composer).getByRole('radio', { name: /^egreso$/i }))
    fireEvent.change(within(composer).getByLabelText(/^categoría$/i), {
      target: { value: 'Logística' },
    })
    fireEvent.change(within(composer).getByLabelText(/^descripción$/i), {
      target: { value: 'Flete de discos' },
    })
    fireEvent.change(within(composer).getByLabelText(/^importe$/i), { target: { value: '9000' } })
    fireEvent.click(within(composer).getByRole('button', { name: /agregar egreso/i }))

    await waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))
    expect(createEntry.mock.calls[0][0]).toBe('expense')
  })

  it('un error al guardar conserva lo tipeado y lo informa', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })
    createEntry.mockRejectedValue(new Error('Datos de ingreso inválidos.'))

    render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    const composer = await screen.findByRole('form', { name: /cargar un movimiento/i })
    fireEvent.change(within(composer).getByLabelText(/^categoría$/i), { target: { value: 'Sponsor' } })
    fireEvent.change(within(composer).getByLabelText(/^descripción$/i), { target: { value: 'Aporte' } })
    fireEvent.change(within(composer).getByLabelText(/^importe$/i), { target: { value: '500' } })
    fireEvent.click(within(composer).getByRole('button', { name: /agregar ingreso/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/datos de ingreso inválidos/i)
    expect(within(composer).getByLabelText(/^descripción$/i).value).toBe('Aporte')
  })

  it('sin permiso de edición no muestra la fila de carga', async () => {
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })

    render(
      <I18nProvider>
        <FinanceSection canEdit={false} />
      </I18nProvider>,
    )

    await waitFor(() => expect(fetchFinanceReport).toHaveBeenCalled())
    expect(screen.queryByRole('form', { name: /cargar un movimiento/i })).toBeNull()
  })

  it('la vista Tabla es una alternativa que se recuerda entre sesiones', async () => {
    window.localStorage.removeItem('plu.admin.ledger.view')
    fetchFinanceReport.mockResolvedValue({
      totals: { income: 0, expense: 0, balance: 0 },
      rows: [],
    })

    const { container, unmount } = render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )

    const section = container.querySelector('section.admin-finance')
    const views = await screen.findByRole('group', { name: /^vista$/i })
    // Por defecto: Resumen, con el saldo en grande.
    expect(section.className).toContain('admin-finance--view-summary')
    expect(within(views).getByRole('button', { name: /resumen/i }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(views).getByRole('button', { name: /tabla/i }))
    expect(section.className).toContain('admin-finance--view-table')
    expect(within(views).getByRole('button', { name: /tabla/i }).getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('plu.admin.ledger.view')).toBe('table')

    // Al volver a abrir el libro, la vista elegida sigue ahí.
    unmount()
    const again = render(
      <I18nProvider>
        <FinanceSection canEdit />
      </I18nProvider>,
    )
    expect(again.container.querySelector('section.admin-finance').className).toContain(
      'admin-finance--view-table',
    )
    window.localStorage.removeItem('plu.admin.ledger.view')
  })
})
