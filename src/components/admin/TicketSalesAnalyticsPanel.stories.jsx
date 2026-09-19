import TicketSalesAnalyticsPanel from './TicketSalesAnalyticsPanel.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'
import '../../styles/pages/admin-analytics.css'

/**
 * KPIs de ventas de entradas del tab "Análisis" de Pagos: cuántas se
 * vendieron, por qué medio, de qué tipo, y la curva diaria. A diferencia del
 * Libro de caja (sólo Mercado Pago), acá entra todo lo manual también.
 */
export default {
  title: 'Admin/TicketSalesAnalyticsPanel',
  component: TicketSalesAnalyticsPanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="admin-shell" style={{ display: 'block', padding: 20 }}>
        <Story />
      </div>
    ),
  ],
}

const EVENTS = [
  {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic 2026',
    ticketTypes: [
      { id: 'tt-general', name: 'General', active: true },
      { id: 'tt-vip', name: 'VIP', active: true },
    ],
  },
]

const SUMMARY = {
  event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
  capacity: {
    byType: [
      { ticketTypeId: 'tt-general', name: 'General', quota: 300, sold: 214, reserved: 228, pending: 14 },
      { ticketTypeId: 'tt-vip', name: 'VIP', quota: 40, sold: 36, reserved: 38, pending: 2 },
    ],
    totals: { sold: 250, reserved: 266, pending: 16, eventLimit: 340, remaining: 74 },
  },
  revenue: {
    byCurrency: [
      { currency: 'ARS', amount: 18_500_000, orders: 240 },
      { currency: 'USD', amount: 420, orders: 6 },
    ],
    byChannel: [
      { key: 'mercado_pago', currency: 'ARS', amount: 12_800_000, orders: 170 },
      { key: 'bank_transfer', currency: 'ARS', amount: 4_100_000, orders: 52 },
      { key: 'cash_pitbull', currency: 'ARS', amount: 1_600_000, orders: 18 },
      { key: 'wise_transfer', currency: 'USD', amount: 420, orders: 6 },
    ],
  },
  daily: Array.from({ length: 30 }, (_, index) => ({
    date: new Date(2026, 1, index + 1).toISOString().slice(0, 10),
    count: Math.max(0, Math.round(12 + 10 * Math.sin(index / 3))),
  })),
  rangeDays: 30,
}

export const ConVentas = {
  args: {
    events: EVENTS,
    fetchSummary: async () => SUMMARY,
  },
}

export const SinVentasTodavia = {
  args: {
    events: EVENTS,
    fetchSummary: async () => ({
      ...SUMMARY,
      capacity: { byType: [], totals: { sold: 0, reserved: 0, pending: 0, eventLimit: null, remaining: null } },
      revenue: { byCurrency: [], byChannel: [] },
      daily: [],
    }),
  },
}

export const SinEventosConEntradas = {
  args: {
    events: [],
    fetchSummary: async () => SUMMARY,
  },
}

export const Cargando = {
  args: {
    events: EVENTS,
    fetchSummary: () => new Promise(() => {}),
  },
}

export const ErrorDeConexion = {
  args: {
    events: EVENTS,
    fetchSummary: async () => {
      throw new Error('No se pudo contactar al servidor de PLU ARG.')
    },
  },
}
