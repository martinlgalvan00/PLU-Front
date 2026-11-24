import BuyerTicketsWallet from './BuyerTicketsWallet.jsx'

const ticket = {
  id: 'tk-story-1',
  attendeeName: 'Agustin Di santo',
  attendeeDni: '30111222',
  ticketCode: 'TCK-1',
  ticketTypeName: 'PÚBLICO GENERAL 2 DÍAS (Incluye el ingreso los dos días del evento)',
  accessDays: [
    { label: 'Día 1', date: '2026-12-12', dayIndex: 0 },
    { label: 'Día 2', date: '2026-12-13', dayIndex: 1 },
  ],
}

export default {
  title: 'Cuenta/BuyerTicketsWallet',
  component: BuyerTicketsWallet,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 666 }}>
        <Story />
      </div>
    ),
  ],
}

/** Compra todavía sin acreditar: la fila es el objeto, el QR no está. */
export const Pendiente = {
  args: {
    orderStatus: 'pendiente',
    event: { title: 'Pitbull Classic', slug: 'pitbull-classic' },
    tickets: [ticket],
  },
}
