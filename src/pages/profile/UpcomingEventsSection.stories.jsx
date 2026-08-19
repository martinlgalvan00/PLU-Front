// `account.css` está acotado a la ruta del perfil (lo importa
// AthleteProfilePage, no el entry global): sin este import la sección se ve sin
// la grilla de filas, igual que en las stories hermanas de la cuenta.
import '../../styles/pages/account.css'
import UpcomingEventsSection from './UpcomingEventsSection.jsx'

/**
 * "Próximos torneos" en la cuenta del atleta: la fila donde la persona espera
 * leer si está inscripta.
 *
 * El estado sale de `findAthleteEventRegistration`, el mismo resolver que usan
 * la página del meet y el calendario público — antes esta sección comparaba el
 * título del evento contra el de la inscripción y contaba las canceladas como
 * vigentes, así que decía "Ya estás inscripto" a quien había cancelado y
 * "Inscripción abierta" a quien ya había pagado un meet renombrado.
 */

const EVENT = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'inscripcion_abierta',
  dateISO: '2026-12-12',
  date: '12 DIC',
  venue: 'Club Atlético',
  location: 'CABA',
  requiresMembership: false,
  price: 75000,
  pricing: { membership: 75000, registration: 75000 },
}

const ATHLETE = {
  id: 'ath-story-1',
  fullName: 'Martina Rivas',
  phone: '+54 9 11 3000-1188',
  city: 'La Plata',
  province: 'Buenos Aires',
  gym: 'Maximal Power',
}

function registration(status) {
  return {
    id: `reg-${status}`,
    athleteId: ATHLETE.id,
    event: 'Pitbull Classic',
    eventSlug: 'pitbull-classic-2026',
    division: 'Open',
    category: 'Raw',
    status,
  }
}

export default {
  title: 'Cuenta/UpcomingEventsSection',
  component: UpcomingEventsSection,
  parameters: { layout: 'fullscreen' },
  args: {
    availableEvents: [EVENT],
    athleteRegistrations: [],
    membership: null,
    athlete: ATHLETE,
    onNavigate: () => {},
    onSelectEvent: () => {},
    onNavigateSection: () => {},
  },
  decorators: [
    // Misma cadena de ancestros que AthleteProfilePage: la grilla de la fila
    // baja de `.account-main`.
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

/** Sin inscripción: el estado es el del calendario y el CTA invita a entrar. */
export const SinInscripcion = {}

/** Cupo pago: el CTA se apaga porque ya no hay nada que hacer acá. */
export const Confirmada = {
  args: { athleteRegistrations: [registration('confirmada')] },
}

/**
 * Inscripción cargada sin pago acreditado. No dice "confirmada" —y el CTA queda
 * habilitado, porque es la única salida para cerrar el pago.
 */
export const PagoPendiente = {
  args: { athleteRegistrations: [registration('pendiente_pago')] },
}

/** Canceló: vuelve a ser alguien que puede inscribirse. */
export const Cancelada = {
  args: { athleteRegistrations: [registration('cancelada')] },
}

/**
 * El staff renombró el meet después de que esta persona pagó. El slug es el
 * mismo, así que la inscripción se sigue reconociendo.
 */
export const MeetRenombrado = {
  args: {
    availableEvents: [{ ...EVENT, title: 'Pitbull Classic 2026' }],
    athleteRegistrations: [registration('confirmada')],
  },
}
