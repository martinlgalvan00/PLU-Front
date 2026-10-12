import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-event-tickets.css'
import AdminTicketQrPanel from './AdminTicketQrPanel.jsx'

/**
 * Panel lateral de una entrada vendida: el QR y lo que el operador necesita
 * cuando alguien dice "no me llegó la entrada" o "no me deja pasar". Sólo
 * dibuja el QR con la entrada acreditada.
 */
export default {
  title: 'Admin/AdminTicketQrPanel',
  component: AdminTicketQrPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    canOverride: true,
    eventSlug: 'pitbull-classic-2026',
    onClose: () => {},
    onOverride: () => {},
  },
}

const baseTicket = {
  id: 'tk-1',
  ticketCode: 'TCK-00000001',
  qrToken: 'qr_0123456789abcdef',
  attendeeName: 'Camila Rearte',
  attendeeDni: '30111222',
  ticketTypeName: 'PÚBLICO GENERAL 1 DÍA (Incluye el ingreso solamente para un día del evento)',
  credentialLabel: 'Espectador',
  unitPrice: 25000,
  status: 'pagada',
  checkIn: null,
  order: {
    id: 'ord-1',
    reference: 'TORD-a1b2c3',
    buyerName: 'Camila Rearte',
    buyerEmail: 'camila@example.com',
  },
}

/** Acreditada y sin ingresar: QR, descargar, copiar enlace y excepción. */
export const Habilitada = { args: { ticket: baseTicket } }

/** Ya ingresó: dice cuándo y por qué puerta. */
export const YaIngreso = {
  args: {
    ticket: {
      ...baseTicket,
      checkIn: { scannedAt: '2026-12-11T14:10:00.000Z', gate: 'Puerta' },
    },
  },
}

/** Vencida: la excepción individual es la salida. */
export const Vencida = {
  args: {
    ticket: {
      ...baseTicket,
      validFrom: '2026-12-10T00:00:00.000Z',
      validUntil: '2026-12-11T00:00:00.000Z',
    },
  },
}

/** Sin acreditar: no hay QR ni acciones que lo compartan. */
export const SinAcreditar = {
  args: { ticket: { ...baseTicket, status: 'pendiente_pago' } },
}

/** Cancelada: el QR ya no abre ninguna puerta. */
export const Cancelada = {
  args: { ticket: { ...baseTicket, status: 'cancelada' } },
}
