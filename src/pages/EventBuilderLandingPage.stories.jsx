import { fn } from 'storybook/test'
import EventBuilderLandingPage from './EventBuilderLandingPage.jsx'
import EventUnderConstructionPage from './EventUnderConstructionPage.jsx'
import { normalizeEventLanding } from '../lib/eventLanding.js'

/**
 * Landing Constructor: la misma página con el tema por defecto y con paleta
 * propia (oscura y clara), y la pantalla "Plataforma en construcción" que ve el
 * público cuando el interruptor está apagado.
 */

const EVENT = {
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  description: 'El encuentro de fuerza donde el estándar técnico es la regla.',
  startsAt: '2027-03-06T10:00:00-03:00',
  endsAt: '2027-03-06T20:00:00-03:00',
  venue: 'Virtus Fitness',
  location: 'Berazategui, Buenos Aires',
  status: 'proximamente',
  published: true,
}

const BLOCKS = [
  { id: 'hero', type: 'hero' },
  { id: 'facts', type: 'facts' },
  {
    id: 'text-1',
    type: 'text',
    props: {
      eyebrow: 'Formato',
      title: 'Cómo se compite',
      body: 'Tres intentos por movimiento, jueces internacionales y un estándar único para todas las divisiones.',
    },
  },
  { id: 'experience', type: 'experience' },
  { id: 'faq', type: 'faq' },
  {
    id: 'cta-1',
    type: 'cta',
    props: {
      title: 'Reglamento oficial',
      body: 'Leelo antes de inscribirte.',
      label: 'Leer reglamento',
      href: 'https://plu.com.ar/reglamento',
    },
  },
]

const SLOTS = {
  heroLead: 'Una jornada de powerlifting con el estándar PLU ARG.',
  experienceTitle: 'Jueces y equipo técnico',
  experienceBody: 'Jueces internacionales, speaker y transmisión en vivo durante toda la jornada.',
  faq1Question: '¿Hace falta estar afiliado?',
  faq1Answer: 'Sí, la afiliación vigente es requisito para competir.',
}

function eventWith(layoutPalette, extra = {}) {
  return {
    ...EVENT,
    landing: normalizeEventLanding({
      templateId: 'builder',
      publicVisible: true,
      themeId: 'plu-default',
      slots: SLOTS,
      layout: { blocks: BLOCKS, palette: layoutPalette },
      ...extra,
    }),
  }
}

export default {
  title: 'Pages/Eventos/Landing Constructor',
  parameters: { layout: 'fullscreen' },
}

function Page({ event }) {
  return (
    <EventBuilderLandingPage
      eventSlug={event.slug}
      events={[event]}
      onNavigate={fn()}
      onSelectEvent={fn()}
    />
  )
}

export const TemaPorDefecto = { render: () => <Page event={eventWith({})} /> }

export const PaletaOscuraPropia = {
  render: () => (
    <Page event={eventWith({ accent: '#ff8a1f', action: '#ff8a1f', background: '#14110d' })} />
  ),
}

export const PaletaClaraPropia = {
  render: () => (
    <Page event={eventWith({ accent: '#0b5cad', action: '#0b2a6f', background: '#f4f1ea' })} />
  ),
}

export const EnConstruccion = {
  render: () => (
    <EventUnderConstructionPage
      event={eventWith({ accent: '#ff8a1f', action: '#ff8a1f', background: '#14110d' }, {
        publicVisible: false,
      })}
      onNavigate={fn()}
    />
  ),
}

export const EnConstruccionTemaPorDefecto = {
  render: () => (
    <EventUnderConstructionPage
      event={eventWith({}, { publicVisible: false })}
      onNavigate={fn()}
    />
  ),
}

const withMotion = (motion, extra = {}) =>
  eventWith({}, { layout: { blocks: BLOCKS, palette: {}, motion }, ...extra })

export const AnimacionMarcada = { render: () => <Page event={withMotion('bold')} /> }

export const SinAnimaciones = { render: () => <Page event={withMotion('none')} /> }

export const EnConstruccionAnimacionMarcada = {
  render: () => (
    <EventUnderConstructionPage
      event={withMotion('bold', { publicVisible: false })}
      onNavigate={fn()}
    />
  ),
}

export const EnConstruccionSinAnimaciones = {
  render: () => (
    <EventUnderConstructionPage
      event={withMotion('none', { publicVisible: false })}
      onNavigate={fn()}
    />
  ),
}

export const EnConstruccionPaletaClara = {
  render: () => (
    <EventUnderConstructionPage
      event={eventWith(
        { accent: '#0b5cad', action: '#0b2a6f', background: '#f4f1ea' },
        { publicVisible: false },
      )}
      onNavigate={fn()}
    />
  ),
}
