// `account.css` está acotado a la ruta del perfil (lo importa
// AthleteProfilePage, no el entry global), igual que las stories hermanas.
import '../../styles/pages/account.css'
import PaymentsSection from './PaymentsSection.jsx'
import { derivePaymentProgress } from '../../lib/paymentProgress.js'

/**
 * El estado de cada cobro, del lado del atleta.
 *
 * La regla de la pantalla: manda el estado de la ORDEN, no el del último
 * intento. El caso `AcreditadoTrasRechazo` es el de producción que motivó la
 * sección — una afiliación que entró en el segundo intento y que la app venía
 * reportando por el primero.
 */
function pago({ id, order, attempts = [], outcome = null, ...rest }) {
  return {
    id,
    amount: 85000,
    reference: 'MORD-007fe4e3016a3dad',
    createdAt: '2026-08-20T14:23:21.048Z',
    concept: 'Afiliación PLU anual 2026',
    conceptType: 'membership',
    ...rest,
    progress: derivePaymentProgress({ order, attempts, outcome }),
  }
}

const ACREDITADO_TRAS_RECHAZO = pago({
  id: 'orden-acreditada',
  order: { status: 'aprobado', method: 'mercado_pago' },
  attempts: [
    {
      external_payment_id: '173831512161',
      status: 'rechazado',
      status_detail: 'cc_rejected_high_risk',
      created_at: '2026-08-20T14:37:56.471Z',
    },
    {
      external_payment_id: '174765196850',
      status: 'aprobado',
      confirmed_at: '2026-08-20T21:27:38.064Z',
    },
  ],
})

const TRANSFERENCIA_EN_REVISION = pago({
  id: 'orden-transferencia',
  concept: 'Afiliación PLU anual 2026 + Inscripción Pitbull Classic',
  conceptDetail: 'Open · Raw',
  conceptType: 'combo',
  amount: 150000,
  reference: 'MORD-4a91c2f0',
  createdAt: '2026-08-19T10:02:00.000Z',
  order: {
    status: 'validacion_manual',
    method: 'manual_link',
    manualPaymentChannel: 'bank_transfer',
    paymentProofUploadedAt: '2026-08-19T15:00:00.000Z',
  },
})

const RECHAZADO = pago({
  id: 'orden-rechazada',
  concept: 'Inscripción Pitbull Classic',
  conceptDetail: 'Masters · Raw',
  conceptType: 'registration',
  amount: 120000,
  reference: 'MORD-8b2ef113',
  createdAt: '2026-08-18T09:15:00.000Z',
  order: { status: 'rechazado', method: 'mercado_pago' },
  attempts: [
    { external_payment_id: '990', status: 'rechazado', status_detail: 'cc_rejected_insufficient_amount' },
  ],
})

const VENCIDO = pago({
  id: 'orden-vencida',
  concept: 'Afiliación PLU anual 2026',
  amount: 85000,
  reference: 'MORD-1c7d4402',
  createdAt: '2026-08-17T11:00:00.000Z',
  order: {
    status: 'cancelado',
    method: 'mercado_pago',
    expiresAt: '2026-08-17T11:30:00.000Z',
    updatedAt: '2026-08-17T11:31:00.000Z',
  },
})

/**
 * Caso real: la orden venció sin pago y la afiliación se activó a mano cuatro
 * horas después. La cuenta se leía como una contradicción —"Afiliación: activa"
 * contra "Pagos: afiliación cancelada"— hasta que la fila dijo las dos cosas.
 */
const CANCELADO_PERO_OTORGADO = pago({
  id: 'orden-michelle',
  concept: 'Afiliación PLU anual 2026',
  amount: 85000,
  reference: 'MORD-9f21ab07',
  createdAt: '2026-08-20T19:06:32.131Z',
  order: {
    status: 'cancelado',
    method: 'mercado_pago',
    expiresAt: '2026-08-20T19:36:32.131Z',
    updatedAt: '2026-08-20T19:39:00.100Z',
  },
  outcome: { kind: 'membership', status: 'activa' },
})

const EFECTIVO_EN_SEDE = pago({
  id: 'orden-efectivo',
  concept: 'Inscripción Pitbull Classic',
  conceptType: 'registration',
  amount: 150000,
  reference: 'MORD-55aa10de',
  createdAt: '2026-08-16T18:40:00.000Z',
  order: {
    status: 'pendiente',
    method: 'manual_link',
    manualPaymentChannel: 'cash_pitbull',
  },
})

export default {
  title: 'Cuenta/PaymentsSection',
  component: PaymentsSection,
  parameters: { layout: 'fullscreen' },
  args: {
    payments: [
      ACREDITADO_TRAS_RECHAZO,
      TRANSFERENCIA_EN_REVISION,
      RECHAZADO,
      VENCIDO,
      CANCELADO_PERO_OTORGADO,
      EFECTIVO_EN_SEDE,
    ],
    onNavigateSection: () => {},
    onRetryPayment: () => {},
  },
  decorators: [
    // Misma cadena de ancestros que AthleteProfilePage: el ancho de la lista
    // sale de `.account-main`.
    (Story) => (
      <main className="page page--design account-page--design">
        <div className="account-main">
          <div className="account-sections">
            <div className="account-tab-panel">
              <Story />
            </div>
          </div>
        </div>
      </main>
    ),
  ],
}

export const Todos = {}

/**
 * El caso de producción: la afiliación entró en el segundo intento. La orden
 * figura acreditada y el rechazo previo queda como historial explicado, no como
 * estado.
 */
export const AcreditadoTrasRechazo = {
  args: { payments: [ACREDITADO_TRAS_RECHAZO] },
}

/** Transferencia con comprobante subido, esperando la revisión de Finanzas. */
export const TransferenciaEnRevision = {
  args: { payments: [TRANSFERENCIA_EN_REVISION] },
}

/** Rechazo real: el motivo se explica en castellano y se ofrece salida. */
export const Rechazado = {
  args: { payments: [RECHAZADO] },
}

/**
 * Cobro cancelado por vencimiento cuya afiliación quedó activa por otra vía.
 * La fila explica el porqué de la cancelación y por qué no hay que pagar de
 * nuevo — y por eso mismo no ofrece reintentar.
 */
export const CanceladoPeroOtorgado = {
  args: { payments: [CANCELADO_PERO_OTORGADO] },
}

export const SinCobros = {
  args: { payments: [] },
}
