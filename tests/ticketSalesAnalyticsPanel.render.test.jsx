import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

/**
 * Las claves de i18n de este panel viven en `admin.ticketSalesAnalysis.*`
 * (`admin.es.js`/`admin.en.js`). El render por defecto de `I18nProvider` es
 * español (`src/i18n/I18nProvider.jsx`), así que estos tests verifican
 * contra el texto real en español.
 */

const fetchSummary = vi.fn()

vi.mock('../src/services/ticketSalesAnalyticsService.js', () => ({
  fetchTicketSalesSummary: (...args) => fetchSummary(...args),
}))

const TicketSalesAnalyticsPanel = (
  await import('../src/components/admin/TicketSalesAnalyticsPanel.jsx')
).default

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
})

afterEach(() => {
  cleanup()
  fetchSummary.mockReset()
})

const EVENTS = [
  {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic 2026',
    ticketTypes: [{ id: 'tt-general', name: 'General', active: true }],
  },
]

function summaryFixture(overrides = {}) {
  return {
    event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
    capacity: {
      byType: [{ ticketTypeId: 'tt-general', name: 'General', quota: 100, sold: 40, reserved: 45, pending: 5 }],
      totals: { sold: 40, reserved: 45, pending: 5, eventLimit: 100, remaining: 55 },
    },
    revenue: {
      byCurrency: [{ currency: 'ARS', amount: 400000, orders: 40 }],
      byChannel: [
        { key: 'mercado_pago', currency: 'ARS', amount: 300000, orders: 30 },
        { key: 'cash_pitbull', currency: 'ARS', amount: 100000, orders: 10 },
      ],
    },
    daily: [
      { date: '2026-03-01', count: 3 },
      { date: '2026-03-02', count: 7 },
    ],
    rangeDays: 30,
    ...overrides,
  }
}

function renderPanel(props = {}) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <TicketSalesAnalyticsPanel events={EVENTS} {...props} />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('TicketSalesAnalyticsPanel', () => {
  it('sin eventos con entradas configuradas, no pide nada al servicio', () => {
    renderPanel({ events: [] })
    expect(fetchSummary).not.toHaveBeenCalled()
    expect(screen.getByText('Sin eventos con entradas configuradas')).toBeTruthy()
  })

  it('elige el primer evento con entradas por defecto y pide su resumen', async () => {
    fetchSummary.mockResolvedValue(summaryFixture())
    renderPanel()
    await waitFor(() => expect(fetchSummary).toHaveBeenCalledWith('pitbull-classic-2026'))
  })

  it('muestra vendidas, pendientes, cupo restante y recaudado ARS', async () => {
    fetchSummary.mockResolvedValue(summaryFixture())
    renderPanel()

    await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())

    expect(screen.getByText('40')).toBeTruthy() // vendidas
    expect(screen.getByText('5')).toBeTruthy() // pendientes
    expect(screen.getByText('55')).toBeTruthy() // cupo restante
    expect(screen.getByText('$ 400.000')).toBeTruthy() // recaudado ARS (money())
  })

  it('una moneda distinta de ARS (Wise) se muestra aparte, no sumada', async () => {
    fetchSummary.mockResolvedValue(
      summaryFixture({
        revenue: {
          byCurrency: [
            { currency: 'ARS', amount: 400000, orders: 40 },
            { currency: 'USD', amount: 120, orders: 2 },
          ],
          byChannel: [
            { key: 'mercado_pago', currency: 'ARS', amount: 300000, orders: 30 },
            { key: 'cash_pitbull', currency: 'ARS', amount: 100000, orders: 10 },
            { key: 'wise_transfer', currency: 'USD', amount: 120, orders: 2 },
          ],
        },
      }),
    )
    renderPanel()

    await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())

    expect(screen.getByText('$ 400.000')).toBeTruthy()
    expect(screen.getByText('US$ 120,00')).toBeTruthy()
    // El bloque "por canal" (ARS) no incluye la fila de Wise (USD).
    const byChannelBlock = screen.getByText('Por medio de pago').closest('section')
    expect(within(byChannelBlock).queryByText('US$ 120,00')).toBeNull()
  })

  it('acorta el nombre del tipo y cuenta las ventas por medio', async () => {
    fetchSummary.mockResolvedValue(
      summaryFixture({
        capacity: {
          byType: [
            {
              ticketTypeId: 'tt-day',
              name: 'PÚBLICO GENERAL 1 DÍA (Incluye el ingreso solamente para un día del evento)',
              quota: 100,
              sold: 2,
              reserved: 2,
              pending: 0,
            },
          ],
          totals: { sold: 2, reserved: 2, pending: 0, eventLimit: 100, remaining: 98 },
        },
      }),
    )
    renderPanel()

    await waitFor(() => expect(screen.queryByText(/cargando/i)).toBeNull())

    expect(screen.getByText('PÚBLICO GENERAL 1 DÍA')).toBeTruthy()
    expect(screen.getByText('Incluye el ingreso solamente para un día del evento')).toBeTruthy()
    expect(screen.getByText('30 ventas')).toBeTruthy()
    expect(screen.getByText('Pitbull Classic 2026')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('sin ninguna venta todavía, muestra el estado vacío en vez de tiles en cero', async () => {
    fetchSummary.mockResolvedValue(
      summaryFixture({
        capacity: { byType: [], totals: { sold: 0, reserved: 0, pending: 0, eventLimit: 100, remaining: 100 } },
        daily: [],
      }),
    )
    renderPanel()

    await waitFor(() => expect(screen.getByText('Todavía no hay ventas')).toBeTruthy())
  })

  it('un error de carga ofrece reintentar', async () => {
    fetchSummary.mockRejectedValueOnce(new Error('offline'))
    renderPanel()

    await waitFor(() => expect(screen.getByText('offline')).toBeTruthy())

    fetchSummary.mockResolvedValueOnce(summaryFixture())
    screen.getByRole('button', { name: /reintentar|retry/i }).click()

    await waitFor(() => expect(fetchSummary).toHaveBeenCalledTimes(2))
  })
})
