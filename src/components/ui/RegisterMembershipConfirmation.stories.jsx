// register.css es CSS de ruta lazy (lo importa RegisterPage, no el entry
// global): sin esto la story renderiza el componente sin ninguno de sus
// estilos y la auditoría visual sería falsa.
import '../../styles/pages/design-phase2.css'
import '../../styles/pages/register.css'
import RegisterMembershipConfirmation from './RegisterMembershipConfirmation.jsx'

const order = {
  athleteName: 'Martina Rivas',
  amount: 42000,
  concept: 'Afiliación anual 2026',
  reference: 'PLU-MEM-2026-000184',
  status: 'aprobado',
  paymentMethod: 'mercado_pago',
  paymentId: 'pay_9f2a7c41',
}

const cardData = {
  athleteName: 'Martina Rivas',
  athleteCode: 'PLU-ARG-2026-001',
  qrCode: 'PLU-ARG-2026-001',
  membershipExpiration: '31 ene 2027',
  variant: 'membership',
  eventSlug: 'afiliacion',
}

export default {
  title: 'UI/RegisterMembershipConfirmation',
  component: RegisterMembershipConfirmation,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="register-page register-page--premium register-page--membership">
        <div className="register-card register-card--confirmation" style={{ maxWidth: 520 }}>
          <Story />
        </div>
      </div>
    ),
  ],
}

/** Afiliación acreditada: la card real es la pieza y compartirla es la acción. */
export const ActivaConCard = {
  args: {
    order,
    memberCode: 'PLU-ARG-2026-001',
    membershipExpiration: '31 ene 2027',
    cardData,
    showCardAction: true,
    onNavigate: () => {},
    onOpenCard: () => {},
  },
}

/** Con foto de perfil — el retrato es el material de la pieza. */
export const ActivaConFoto = {
  args: {
    ...ActivaConCard.args,
    cardData: {
      ...cardData,
      athletePhotoUrl: 'https://picsum.photos/seed/plu-athlete/600/600',
    },
  },
}

/** Orden por transferencia sin acreditar: todavía no hay card emitida. */
export const PendienteTransferencia = {
  args: {
    order: {
      ...order,
      status: 'pendiente',
      paymentMethod: 'manual_link',
    },
    memberCode: 'PLU-ARG-2026-001',
    membershipExpiration: '31 ene 2027',
    showCardAction: false,
    onNavigate: () => {},
    onOpenTransfer: () => {},
  },
}
