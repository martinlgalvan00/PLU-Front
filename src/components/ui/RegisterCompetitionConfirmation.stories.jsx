// register.css es CSS de ruta lazy (lo importa RegisterPage, no el entry
// global): sin esto la story renderiza el componente sin ninguno de sus
// estilos y la auditoría visual sería falsa.
import '../../styles/pages/design-phase2.css'
import '../../styles/pages/register.css'
import RegisterCompetitionConfirmation from './RegisterCompetitionConfirmation.jsx'

const order = {
  athleteName: 'Ana Torres',
  amount: 75000,
  concept: 'Inscripción Pitbull Classic 2026',
  reference: 'RORD-2026-000317',
  status: 'confirmada',
  paymentMethod: 'mercado_pago',
  paymentId: 'pay_4d1c0f2a',
}

const cardData = {
  athleteName: 'Ana Torres',
  athleteCode: 'PLU-ARG-2026-014',
  qrCode: 'PLU-ARG-2026-014',
  eventTitle: 'Pitbull Classic 2026',
  eventDate: '12-13 Dic 2026',
  eventVenue: 'Maximal Strength Club',
  eventLocation: 'Buenos Aires',
  category: 'Open',
  division: 'Clásico',
  eventSlug: 'pitbull-classic-2026',
  variant: 'event',
}

export default {
  title: 'UI/RegisterCompetitionConfirmation',
  component: RegisterCompetitionConfirmation,
  parameters: { layout: 'padded' },
  // La página de competencia deja el `.register-card` transparente y sin
  // padding: el decorator replica esa cadena de clases para que la story
  // muestre el bloque tal como se ve en la ruta y no dentro de una card que
  // en producción no existe.
  decorators: [
    (Story) => (
      <div className="register-page register-page--premium register-page--competition">
        <div className="register-card register-card--confirmation" style={{ maxWidth: 640 }}>
          <Story />
        </div>
      </div>
    ),
  ],
}

/** Inscripción admitida: la card del meet es la pieza y compartirla es la acción. */
export const Admitida = {
  args: {
    order,
    cardData,
    slotLabel: 'Open · Clásico',
    onNavigate: () => {},
    onOpenCard: () => {},
  },
}

/** Con foto de perfil — el retrato pasa a ser el material de la pieza. */
export const AdmitidaConFoto = {
  args: {
    ...Admitida.args,
    cardData: {
      ...cardData,
      athletePhotoUrl: 'https://picsum.photos/seed/plu-competitor/600/600',
    },
  },
}

/**
 * Admitida sin card emitida: pasa cuando la inscripción está habilitada pero
 * todavía no hay token de credencial. El sello se sostiene solo y la pantalla
 * no promete una pieza que no existe.
 */
export const AdmitidaSinCard = {
  args: {
    order,
    cardData: null,
    slotLabel: 'Open · Clásico',
    onNavigate: () => {},
  },
}

/**
 * Sin división ni categoría en el formulario: el sello va sin detalle en vez de
 * dejar un renglón a medias.
 */
export const AdmitidaSinCategoria = {
  args: {
    order,
    cardData,
    onNavigate: () => {},
    onOpenCard: () => {},
  },
}
