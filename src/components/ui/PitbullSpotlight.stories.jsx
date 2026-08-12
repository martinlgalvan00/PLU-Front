import PitbullSpotlight from './PitbullSpotlight.jsx'

export default {
  title: 'UI/PitbullSpotlight',
  component: PitbullSpotlight,
  tags: ['autodocs'],
  args: {
    onDetail: () => {},
    onRegister: () => {},
    onJoin: () => {},
    onResults: () => {},
  },
}

export const Card = {
  args: { variant: 'card' },
}

export const Home = {
  args: { variant: 'home' },
}

/** Evento genérico sin foto/logo: template brand PLU (no fotos Pitbull). */
export const HomeGenericNoMedia = {
  args: {
    variant: 'home',
    event: {
      slug: 'test-13-ago',
      title: 'TEST 13-ago',
      description: 'Meet oficial de prueba · sede por confirmar.',
      status: 'inscripcion_abierta',
      venue: 'Sede por confirmar',
      location: 'Argentina',
      displayDate: '13 ago 2026',
      startsAt: '2026-08-13T09:00:00-03:00',
      dateISO: '2026-08-13',
      categories: [],
    },
  },
}

/** CTA real: "Inscribirme" — la inscripción está abierta. */
export const HomeRegistrationOpen = {
  args: { variant: 'home', event: { status: 'inscripcion_abierta' } },
}

/** CTA real: "Inscribirme" — quedan pocos cupos. */
export const HomeLimitedSlots = {
  args: { variant: 'home', event: { status: 'cupos_limitados' } },
}

/** CTA real: "Ver competencia" — todavía no abrió la inscripción (default sin evento). */
export const HomeUpcoming = {
  args: { variant: 'home', event: { status: 'proximamente' } },
}

/** CTA real: "Afiliarme" — inscripción cerrada, pivotea a afiliación. */
export const HomeRegistrationClosed = {
  args: { variant: 'home', event: { status: 'cerrado' } },
}

/** CTA real: "Ver resultados" — el evento ya finalizó. */
export const HomeFinished = {
  args: { variant: 'home', event: { status: 'finalizado' } },
}

export const Events = {
  args: { variant: 'events' },
}
