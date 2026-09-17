import TicketPurchaseSection from './TicketPurchaseSection.jsx'

const event = {
  title: 'Apertura Nacional 2026',
  slug: 'apertura-nacional-2026',
  eventDays: [
    { dayIndex: 0, label: 'Día 1', date: '2026-12-11' },
    { dayIndex: 1, label: 'Día 2', date: '2026-12-12' },
  ],
}

const pricing = {
  ticketTypes: [
    {
      id: 'day1',
      name: 'Jornada inaugural',
      description: 'Acceso general válido únicamente durante el primer día del torneo.',
      price: 15000,
      quota: null,
      includedAddonIds: [],
      accessDays: [event.eventDays[0]],
    },
    {
      id: 'both',
      name: 'Experiencia completa',
      description: 'Viví las dos jornadas y todas las finales desde la tribuna general.',
      price: 25000,
      quota: null,
      includedAddonIds: [],
      accessDays: event.eventDays,
    },
  ],
  addons: [
    {
      id: 'meet-greet',
      label: 'Meet & Greet',
      price: 5000,
      description: 'Encuentro con atletas destacados.',
    },
  ],
}

export default {
  title: 'UI/TicketPurchaseSection',
  component: TicketPurchaseSection,
  tags: ['autodocs'],
  args: {
    event,
    pricing,
    tickets: [],
    createdOrder: null,
    onSubmit: async () => ({}),
    onApprovePayment: () => {},
    onUploadPaymentProof: async () => ({}),
  },
}

export const Standard = {}

export const Editorial = {
  args: { editorial: true },
}

export const Confirmation = {
  args: {
    createdOrder: {
      type: 'tickets',
      orderId: 'order-1',
      eventTitle: event.title,
      quantity: 1,
      amount: 15000,
      status: 'pagada',
      paymentMethod: 'mercado_pago',
    },
    tickets: [
      {
        id: 'ticket-1',
        orderId: 'order-1',
        attendeeName: 'Juan Pérez',
        attendeeDni: '30111222',
        ticketCode: 'TCK-0001',
        ticketTypeId: 'both',
        ticketTypeName: 'Ambos días',
        status: 'pagada',
        eventTitle: event.title,
      },
    ],
  },
}

/** Confirmación en el checkout público: acá vive "Compartir por WhatsApp". */
export const ConfirmationEditorial = {
  args: {
    ...Confirmation.args,
    editorial: true,
  },
}
