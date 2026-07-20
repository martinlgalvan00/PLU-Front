import TicketPurchaseSection from './TicketPurchaseSection.jsx'

const event = { title: 'Apertura Nacional 2026', slug: 'apertura-nacional-2026' }

const pricing = {
  ticketTypes: [
    { id: 'day1', name: 'Día 1', price: 15000, quota: null, includedAddonIds: [] },
    { id: 'both', name: 'Ambos días', price: 25000, quota: null, includedAddonIds: [] },
  ],
  addons: [
    { id: 'meet-greet', label: 'Meet & Greet', price: 5000, description: 'Encuentro con atletas destacados.' },
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
