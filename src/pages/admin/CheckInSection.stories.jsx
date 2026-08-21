import CheckInSection from './CheckInSection.jsx'
// Mismo juego de hojas que importa AdminPage: el layout de las secciones de
// lista vive en `admin-minimal.css` y `admin-institutional.css`, scopeado bajo
// `.admin-shell .admin-page`. Con sólo `admin.css` la sección se renderiza sin
// restricción de ancho y el mobile parece roto cuando en la app está bien.
import '../../styles/layout/admin-shell.css'
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-institutional.css'
import '../../styles/pages/admin-minimal.css'

/**
 * Puerta del evento. La sección existía sin renderizarse: AdminPage devolvía
 * `null` para `checkin`, así que el acceso directo de la consola de Eventos
 * llevaba a una pantalla en blanco.
 *
 * Estas historias fijan lo que hay que poder ver de un vistazo: quién puede
 * entrar, quién no, y cuál de los que no puede se resuelve cobrando ahí mismo.
 */

const ATHLETES = [
  { id: 'ath-1', fullName: 'Ana Torres', documentId: '30111222' },
  { id: 'ath-2', fullName: 'Lucas Ferro', documentId: '31222333' },
  { id: 'ath-3', fullName: 'Camila Ruiz', documentId: '32333444' },
]

const EVENT_DAYS = [
  { id: 'day-1', dayIndex: 0, label: 'Día 1', date: '2026-11-13' },
  { id: 'day-2', dayIndex: 1, label: 'Día 2', date: '2026-11-14' },
]

const REGISTRATIONS = [
  {
    id: 'reg-1',
    athleteId: 'ath-1',
    eventSlug: 'pitbull-classic-2026',
    category: 'Open',
    division: 'Raw',
    status: 'confirmada',
    paymentOrderId: 'ord-1',
    schedule: { dayIndex: 0 },
    checkedInAt: null,
  },
  {
    id: 'reg-2',
    athleteId: 'ath-2',
    eventSlug: 'pitbull-classic-2026',
    category: 'Junior',
    division: 'Raw',
    status: 'pendiente_pago',
    paymentOrderId: 'ord-2',
    schedule: { dayIndex: 1 },
    checkedInAt: null,
  },
  {
    id: 'reg-3',
    athleteId: 'ath-3',
    eventSlug: 'pitbull-classic-2026',
    category: 'Master',
    division: 'Equipado',
    status: 'pendiente_pago',
    paymentOrderId: 'ord-3',
    schedule: null,
    checkedInAt: null,
  },
]

const PAYMENTS = [
  {
    id: 'ord-1',
    athleteId: 'ath-1',
    concept: 'combo',
    amount: 150000,
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
    status: 'aprobado',
    reference: 'PLU-COMBO-1',
    paymentProofPath: 'ord-1/comprobante.jpg',
  },
  // Efectivo en sede: se cobra en la mesa y no trae archivo. Es el caso que
  // obligaba a ir a Finanzas desde otra pantalla.
  {
    id: 'ord-2',
    athleteId: 'ath-2',
    concept: 'registration',
    amount: 45000,
    method: 'manual_link',
    manualPaymentChannel: 'cash_pitbull',
    status: 'validacion_manual',
    reference: 'PLU-INS-2',
    paymentProofPath: null,
  },
  // Transferencia con comprobante subido, esperando revisión.
  {
    id: 'ord-3',
    athleteId: 'ath-3',
    concept: 'combo',
    amount: 150000,
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
    status: 'validacion_manual',
    reference: 'PLU-COMBO-3',
    paymentProofPath: 'ord-3/transferencia.jpg',
    paymentProofUploadedAt: '2026-11-12T18:30:00.000Z',
  },
]

export default {
  title: 'Admin/Check-in',
  component: CheckInSection,
  parameters: { layout: 'fullscreen' },
  // Casi todo el layout del panel está scopeado bajo `.admin-shell .admin-page`
  // (ver admin-minimal.css / admin-institutional.css). Sin esos dos
  // contenedores la sección se renderiza sin ninguna restricción de ancho y el
  // mobile se ve reventado por el harness, no por la pantalla.
  decorators: [
    (Story) => (
      <div className="admin-shell">
        <div className="admin-page">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    athletes: ATHLETES,
    canCheckIn: true,
    eventDays: EVENT_DAYS,
    eventSlug: 'pitbull-classic-2026',
    eventTitle: 'Pitbull Classic 2026',
    payments: PAYMENTS,
    registrations: REGISTRATIONS,
    tickets: [],
    onApprovePayment: async () => ({ order: { status: 'aprobado' } }),
    onRejectPayment: async () => ({ order: { status: 'rechazado' } }),
    onCheckInRegistration: async () => ({}),
    onCheckInTicket: async () => ({}),
    onRedeemTicketAddon: async () => ({}),
    onRefreshTickets: () => {},
  },
}

/** Finanzas en la puerta: cobra el efectivo, acredita y marca el ingreso. */
export const ConCobroEnPuerta = {
  args: { canValidatePayments: true },
}

/**
 * Rol de puerta sin `admin.payments.approve`: ve la deuda —para saber por qué
 * la persona no entra— pero no puede acreditarla.
 */
export const SinPermisoDeCobro = {
  args: { canValidatePayments: false },
}

/** Todos al día: la puerta queda con una sola acción por fila. */
export const TodoAlDia = {
  args: {
    canValidatePayments: true,
    payments: PAYMENTS.map((order) => ({ ...order, status: 'aprobado' })),
    registrations: REGISTRATIONS.map((registration) => ({
      ...registration,
      status: 'confirmada',
    })),
  },
}
