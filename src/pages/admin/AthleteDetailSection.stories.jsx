import AthleteDetailSection from './AthleteDetailSection.jsx'
import { AppConfigProvider } from '../../providers/AppConfigProvider.jsx'
import { derivePaymentProgress } from '../../lib/paymentProgress.js'
// Las dos hojas, en este orden, igual que el resto de las stories del panel:
// `admin.css` trae el detalle del atleta y `admin-minimal.css` pisa la densidad
// de tablas. Con una sola, la ficha se ve sin estilos y la QA visual no mide
// nada.
import '../../styles/pages/admin.css'
import '../../styles/pages/admin-minimal.css'

/**
 * Ficha del atleta en el panel, con los estados que se reportaron como
 * contradictorios: afiliación "Activa" y, dos tabs más allá, el pago de esa
 * misma afiliación en "Cancelado".
 *
 * Los datos son los de la fila real (Michelle Sofía Correa, orden 321e2026): la
 * orden de Mercado Pago venció sin un solo intento de cobro y un operador activó
 * la afiliación a mano cuatro horas después, porque la plata había llegado por
 * transferencia. Las dos cosas son ciertas; lo que faltaba era el hecho que las
 * une.
 *
 * Las tres variantes cubren lo que cambia la lectura de la pantalla: la
 * divergencia explicada, la que nadie explicó (el pendiente real), y el caso
 * sano donde el cobro respalda al derecho y no hay aviso que mostrar.
 */

const ORDER_ID = '321e2026-0db4-4968-9f7e-a57d874cf3cc'

const athlete = {
  id: '734ce483-038a-47cb-8016-93a8df5e8597',
  fullName: 'Michelle Sofía Correa',
  documentId: '41575917',
  email: 'michelle@example.com',
  phone: '1130975160',
  city: 'Berazategui',
  province: 'Buenos Aires',
  gym: 'Strength',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 67.5,
  status: 'afiliado_activo',
}

const EXPLAINED_OVERRIDE = {
  status: 'activa',
  channel: 'bank_transfer',
  reason: 'Pagó por transferencia el 20/08, comprobante en el grupo de Finanzas.',
  by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
  at: '2026-08-20T23:35:55.487078+00:00',
}

const PLACEHOLDER_OVERRIDE = {
  ...EXPLAINED_OVERRIDE,
  channel: null,
  reason: 'Sin motivo registrado (anterior a 20260910100000).',
}

function buildDetail({ override, orderStatus = 'cancelado', cancellationCode }) {
  const order = {
    status: orderStatus,
    method: 'mercado_pago',
    expiresAt: '2026-08-20T19:36:32.131105+00:00',
    updatedAt: '2026-08-20T19:39:00.100422+00:00',
    cancellationCode,
    cancellationReason: null,
  }

  const membership = {
    id: 'd5fe8171-fd58-4906-a3bd-2d08f5c66073',
    year: '2026',
    status: 'activa',
    memberCode: 'PLU-ARG-2026-00000792',
    startDate: '2026-08-20',
    expirationDate: '2027-08-20',
    paymentOrderId: ORDER_ID,
    manualOverride: override,
  }

  return {
    athlete,
    memberships: [membership],
    registrations: [
      {
        id: 'd91ff8a2-4309-4feb-a6a3-bc749f53b3b5',
        event: 'Pitbull Classic',
        division: 'Open',
        category: 'Raw',
        status: 'cancelada',
        paymentOrderId: 'order-registration',
      },
    ],
    payments: [
      {
        id: ORDER_ID,
        concept: 'Afiliación anual 2026',
        conceptType: 'membership',
        amount: 85000,
        method: 'mercado_pago',
        status: orderStatus,
        reference: 'MORD-c943ca6cde2df28c',
        createdAt: '2026-08-20T19:06:32.131105+00:00',
        cancellationCode,
        progress: derivePaymentProgress({
          order,
          attempts: [],
          outcome: { kind: 'membership', status: 'activa', manualOverride: override },
        }),
      },
      {
        id: 'order-registration',
        concept: 'Inscripción Pitbull Classic',
        conceptType: 'registration',
        amount: 85000,
        method: 'mercado_pago',
        status: 'cancelado',
        reference: 'RORD-ffd5097a3c1399eb',
        createdAt: '2026-08-20T19:02:54.160519+00:00',
        cancellationCode: 'expired_without_payment',
        progress: derivePaymentProgress({
          order: {
            status: 'cancelado',
            method: 'mercado_pago',
            expiresAt: '2026-08-20T19:32:54.160519+00:00',
            updatedAt: '2026-08-20T19:33:00.100236+00:00',
            cancellationCode: 'expired_without_payment',
          },
          attempts: [],
          outcome: { kind: 'registration', status: 'cancelada' },
        }),
      },
    ],
  }
}

function Frame({ detail }) {
  return (
    <AppConfigProvider>
      <div className="admin-shell" style={{ background: 'var(--admin-canvas)', padding: '24px' }}>
        <AthleteDetailSection detail={detail} canEdit={false} onBack={() => {}} />
      </div>
    </AppConfigProvider>
  )
}

export default {
  title: 'Admin/AthleteDetailSection',
  component: AthleteDetailSection,
  tags: ['autodocs'],
}

/** Divergencia explicada: alguien registró canal y motivo al activar a mano. */
export const DivergenciaExplicada = {
  render: () => (
    <Frame
      detail={buildDetail({
        override: EXPLAINED_OVERRIDE,
        cancellationCode: 'resolved_off_platform',
      })}
    />
  ),
}

/** El pendiente real: se activó a mano cuando el panel todavía no pedía motivo. */
export const DivergenciaSinMotivo = {
  render: () => (
    <Frame
      detail={buildDetail({
        override: PLACEHOLDER_OVERRIDE,
        cancellationCode: 'resolved_off_platform',
      })}
    />
  ),
}

/** El cobro respalda al derecho: no hay aviso, y el estado no necesita motivo. */
export const CobroAcreditado = {
  render: () => (
    <Frame
      detail={buildDetail({
        override: null,
        orderStatus: 'aprobado',
        cancellationCode: null,
      })}
    />
  ),
}
