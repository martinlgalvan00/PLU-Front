import TicketsPage from './TicketsPage.jsx'

/**
 * Página de entradas completa, con venta abierta. Los tipos, precios y extras
 * son datos de ejemplo de Storybook, no el catálogo real de ningún evento.
 * Sin API, la disponibilidad cae al default (Mercado Pago abierto).
 */
const eventDays = [
  { dayIndex: 0, label: 'Sábado', date: '2026-12-12' },
  { dayIndex: 1, label: 'Domingo', date: '2026-12-13' },
]

const event = {
  id: 'evento-ejemplo',
  slug: 'evento-ejemplo',
  title: 'Evento de ejemplo',
  date: '12 y 13 de diciembre',
  venue: 'Sede de ejemplo',
  status: 'abierto',
  pricing: {
    ticketsEnabled: true,
    ticketAddons: [
      {
        id: 'remera',
        label: 'Remera del evento',
        price: 8000,
        description: 'Se retira en puerta.',
      },
    ],
  },
  eventDays,
  ticketTypes: [
    {
      id: 'general',
      name: 'Público general',
      description: 'Tribuna general las dos jornadas.',
      price: 20000,
      sortOrder: 0,
    },
    {
      id: 'coach',
      name: 'Entrenadores',
      price: 10000,
      sortOrder: 1,
      credentials: [
        { label: 'Puerta', zoneScopes: ['gate_tickets'] },
        { label: 'Entrada en calor', zoneScopes: ['athletes_coaches'] },
      ],
    },
    {
      id: 'sabado',
      name: 'Solo sábado',
      price: 12000,
      sortOrder: 2,
      dayIndexes: [0],
    },
  ],
}

export default {
  title: 'Pages/TicketsPage',
  component: TicketsPage,
  parameters: { layout: 'fullscreen' },
  args: {
    event,
    events: [event],
    tickets: [],
    createdOrder: null,
    onNavigate: () => {},
    onLookupTicketOrder: async () => ({}),
    onSubmitTicketPurchase: async () => ({}),
    onUploadPaymentProof: async () => ({}),
  },
}

export const VentaAbierta = {}

export const UnSoloTipo = {
  args: {
    event: { ...event, ticketTypes: [event.ticketTypes[0]] },
    events: [{ ...event, ticketTypes: [event.ticketTypes[0]] }],
  },
}

/** Con la sesión abierta: datos precargados y la compra va a Mis entradas. */
export const ConCuenta = {
  args: {
    account: {
      name: 'Persona de ejemplo',
      email: 'persona@example.com',
      dni: '30111222',
      emailVerified: true,
    },
  },
}

/** Confirmación de una compra hecha con la cuenta abierta. */
export const ConfirmacionConCuenta = {
  args: {
    ...ConCuenta.args,
    tickets: [
      {
        id: 't1',
        orderId: 'order-1',
        ticketCode: 'TCK-00000001',
        qrToken: '00000000-0000-4000-8000-000000000001',
        attendeeName: 'Persona de ejemplo',
        attendeeDni: '30111222',
        ticketTypeId: 'general',
        ticketTypeName: 'Público general',
        status: 'pagada',
        credentialScopes: ['gate_tickets'],
        eventTitle: event.title,
        eventSlug: event.slug,
      },
    ],
    createdOrder: {
      type: 'tickets',
      orderId: 'order-1',
      eventTitle: event.title,
      eventSlug: event.slug,
      quantity: 1,
      amount: 20000,
      currency: 'ARS',
      reference: 'TORD-EJEMPLO',
      paymentMethod: 'mercado_pago',
      status: 'aprobado',
    },
  },
}
