import AdminEventTicketsSoldSection from './AdminEventTicketsSoldSection.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/**
 * Entradas individuales vendidas de un evento -- capítulo "Entradas
 * vendidas" dentro de Ventas, en el workspace del evento. Separado del
 * scanner de Check-in (mezcla inscripciones) y del catálogo de tipos
 * (edita precio/cupo, no lista ventas).
 */
export default {
  title: 'Admin/AdminEventTicketsSoldSection',
  component: AdminEventTicketsSoldSection,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="admin-shell" style={{ display: 'block', padding: 20 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    event: { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' },
  },
}

const TICKETS = [
  {
    id: 'tk-1',
    ticketCode: 'TCK-00000001',
    attendeeName: 'Camila Rearte',
    attendeeDni: '30111222',
    ticketTypeId: 'tt-general',
    ticketTypeName: 'General',
    credentialLabel: 'General',
    unitPrice: 15000,
    status: 'pagada',
    checkIn: { scannedAt: '2026-08-15T15:40:00.000Z' },
    order: {
      id: 'ord-1',
      reference: 'TORD-a1b2c3',
      status: 'aprobado',
      provider: 'mercado_pago',
      manualPaymentChannel: null,
      buyerName: 'Camila Rearte',
      buyerEmail: 'camila@example.com',
    },
  },
  {
    id: 'tk-2',
    ticketCode: 'TCK-00000002',
    attendeeName: 'Juan Perez',
    attendeeDni: '28555111',
    ticketTypeId: 'tt-vip',
    ticketTypeName: 'VIP',
    credentialLabel: 'VIP',
    unitPrice: 30000,
    status: 'pendiente_pago',
    checkIn: null,
    order: {
      id: 'ord-2',
      reference: 'TORD-d4e5f6',
      status: 'pendiente',
      provider: 'manual',
      manualPaymentChannel: 'bank_transfer',
      buyerName: 'Juan Perez',
      buyerEmail: 'juan@example.com',
    },
  },
  {
    id: 'tk-3',
    ticketCode: 'TCK-00000003',
    attendeeName: 'Marina Sosa',
    attendeeDni: '31222444',
    ticketTypeId: 'tt-general',
    ticketTypeName: 'General',
    credentialLabel: 'General',
    unitPrice: 15000,
    status: 'pagada',
    checkIn: null,
    order: {
      id: 'ord-3',
      reference: 'TORD-g7h8i9',
      status: 'aprobado',
      provider: 'manual',
      manualPaymentChannel: 'cash_pitbull',
      buyerName: 'Marina Sosa',
      buyerEmail: 'marina@example.com',
    },
  },
]

export const ConVentas = {
  args: {
    fetchTickets: async () => ({ tickets: TICKETS }),
  },
}

export const SinVentas = {
  args: {
    fetchTickets: async () => ({ tickets: [] }),
  },
}

export const Cargando = {
  args: {
    fetchTickets: () => new Promise(() => {}),
  },
}

export const ErrorDeConexion = {
  args: {
    fetchTickets: async () => {
      throw new Error('No se pudo contactar al servidor de PLU ARG.')
    },
  },
}
