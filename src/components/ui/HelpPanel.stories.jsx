import HelpPanel from './HelpPanel.jsx'
import { resolveAthleteJourney } from '../../lib/athleteJourney.js'

const EVENT = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'inscripcion_abierta',
  requiresMembership: true,
}

const ATHLETE = { role: 'athlete_plu', athleteId: 'ath-1' }
const CURRENT_MEMBERSHIP = {
  athleteId: 'ath-1',
  status: 'activa',
  startDate: '2026-01-01',
  expirationDate: '2026-12-31',
}
const PAID_REGISTRATION = { athleteId: 'ath-1', eventSlug: EVENT.slug, status: 'pagada' }

function journey(input) {
  return resolveAthleteJourney({ event: EVENT, now: new Date('2026-08-20T12:00:00'), ...input })
}

export default {
  title: 'UI/HelpPanel',
  component: HelpPanel,
  tags: ['autodocs'],
  args: {
    onClose: () => {},
    onNavigate: () => {},
    onRunNext: () => {},
    onLogin: () => {},
    onStartTour: () => {},
    tourKind: 'orientation',
    view: 'members',
  },
}

/** Visitante sin cuenta: el único paso accionable es el primero. */
export const Guest = {
  args: { journey: journey({ session: null }) },
}

/** Con cuenta y sin afiliación: el tercer paso dice por qué está bloqueado. */
export const NeedsMembership = {
  args: { journey: journey({ session: ATHLETE, memberships: [] }) },
}

/** Afiliación vigente: la acción pasa a la inscripción y se ve el vencimiento. */
export const ReadyToRegister = {
  args: { journey: journey({ session: ATHLETE, memberships: [CURRENT_MEMBERSHIP] }) },
}

/** Trámite cerrado: cambia el título y la acción apunta a la credencial. */
export const Complete = {
  args: {
    journey: journey({
      session: ATHLETE,
      memberships: [CURRENT_MEMBERSHIP],
      registrations: [PAID_REGISTRATION],
    }),
  },
}

/** Sin meet abierto no se inventa un tercer paso accionable. */
export const NoOpenMeet = {
  args: {
    journey: resolveAthleteJourney({
      session: ATHLETE,
      memberships: [CURRENT_MEMBERSHIP],
      event: null,
      now: new Date('2026-08-20T12:00:00'),
    }),
  },
}

/** Pantalla con formulario: el recorrido se ofrece como tutorial campo por campo. */
export const FieldCoach = {
  args: { journey: journey({ session: null }), tourKind: 'coach', view: 'register' },
}

/** Un tutorial que quedó a medias se retoma en el paso donde se cortó. */
export const ResumeTour = {
  args: {
    journey: journey({ session: null }),
    tourKind: 'coach',
    view: 'register',
    resume: { step: 4, total: 13 },
  },
}

/** Ya estamos en la pantalla del próximo paso: el recorrido pasa a ser la acción
 *  principal, porque volver a navegar acá no cambiaría nada. */
export const AtDestination = {
  args: {
    journey: journey({ session: null }),
    tourKind: 'coach',
    view: 'register',
    atDestination: true,
  },
}

/** Pantalla sin recorrido guiado: quedan el interruptor asistido y el contacto. */
export const WithoutTour = {
  args: { journey: journey({ session: null }), onStartTour: null, tourKind: null, view: null },
}
