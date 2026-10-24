import { useRef } from 'react'
import { ArrowDown, ArrowLeft, CalendarDays, MapPin, Sparkles } from 'lucide-react'
import submissionHeroImage from '../assets/DSC01606-display.webp'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { normalizeLandingMotion } from '../lib/eventLandingMotion.js'
import useRevealOnScroll from '../hooks/useRevealOnScroll.js'
import { landingPaletteStyle } from '../lib/eventLandingPalette.js'
import { isEventRegistrationOpen } from '../lib/eventPublicActions.js'
import { eventPublicTitle } from '../lib/eventPublicSurface.js'
import EventPublicMaterials from '../components/ui/EventPublicMaterials.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/submission-landing.css'
import '../styles/pages/event-landing-motion.css'

function formatEventDate(event, locale) {
  const value = event?.startsAt ?? (event?.dateISO ? `${event.dateISO}T12:00:00` : '')
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * Textos por defecto (los slots del panel mandan). Los eyebrows y rótulos se
 * pasan a mayúsculas por CSS: acá van en caja normal, con tildes, para que los
 * títulos de sección no queden gritados.
 */
function copyFor(locale) {
  return locale === 'en'
    ? {
        back: 'Back to calendar',
        eyebrow: 'PLU ARG presents',
        comingSoon: 'In progress',
        comingSoonTitle: 'Registration will open soon.',
        comingSoonLead:
          'The event is already underway. Official information will be published here as it is confirmed.',
        published: 'Official event',
        overview: 'The event',
        overviewFallback:
          'A PLU ARG event built around technical standards, performance, and a clear competition experience.',
        experience: 'The experience',
        experienceFallback:
          'Barbell Submission brings athletes, coaches, and the technical team together around a single competitive standard.',
        categories: 'Competition information',
        categoriesFallback:
          'The official format, divisions, and registration requirements will be published on this page before registration opens.',
        date: 'Date',
        venue: 'Venue',
        location: 'Location',
        register: 'Register',
        calendar: 'View calendar',
        information: 'View event information',
        officialInfo: 'Official information',
        materials: 'Updates and materials',
      }
    : {
        back: 'Volver al calendario',
        eyebrow: 'PLU ARG presenta',
        comingSoon: 'En preparación',
        comingSoonTitle: 'Las inscripciones abren próximamente.',
        comingSoonLead:
          'El evento ya está en marcha. La información oficial se publicará acá a medida que se confirme.',
        published: 'Evento oficial',
        overview: 'El evento',
        overviewFallback:
          'Un evento PLU ARG construido alrededor de los estándares técnicos, el rendimiento y una experiencia de competencia clara.',
        experience: 'La experiencia',
        experienceFallback:
          'Barbell Submission reúne atletas, entrenadores y equipo técnico alrededor de un mismo estándar de competencia.',
        categories: 'Información de competencia',
        categoriesFallback:
          'El formato oficial, las divisiones y los requisitos de inscripción se publicarán en esta página antes de la apertura.',
        date: 'Fecha',
        venue: 'Sede',
        location: 'Ubicación',
        register: 'Inscribirme',
        calendar: 'Ver calendario',
        information: 'Ver información del evento',
        officialInfo: 'Información oficial',
        materials: 'Novedades y materiales',
      }
}

/** Landing propia de Barbell Submission, separada del dossier de Pitbull. */
export default function SubmissionLandingPage({
  eventSlug,
  events = [],
  onNavigate,
  onSelectEvent,
  checkoutAvailability = null,
}) {
  const { locale } = useI18n()
  const event = events.find((item) => item.slug === eventSlug) ?? null
  const landing = eventLandingFromEvent(event)
  const motion = normalizeLandingMotion(landing.layout?.motion)
  const mainRef = useRef(null)
  useRevealOnScroll(mainRef, motion, event?.slug)
  const copy = copyFor(locale)
  const comingSoon = landing.phase === 'coming_soon'
  const title = landing.slots.heroTitle || eventPublicTitle(event) || 'Barbell Submission'
  const lead = landing.slots.heroLead || event?.description || ''
  const date = formatEventDate(event, locale)
  // Misma regla que el calendario y el servidor: "Solo anuncio", la ventana y
  // la pausa general de inscripciones también cierran el botón.
  const registrationOpen = isEventRegistrationOpen(event, {
    registrationEnabled: checkoutAvailability?.registrationEnabled !== false,
  })
  const experienceTitle = landing.slots.experienceTitle || copy.experience
  const experienceBody = landing.slots.experienceBody || copy.experienceFallback
  const categoriesTitle = landing.slots.categoriesTitle || copy.categories
  const categoriesBody = landing.slots.categoriesBody || copy.categoriesFallback
  const overviewTitle = landing.slots.locationTitle || copy.overview
  const locationBody = landing.slots.locationBody || lead || copy.overviewFallback

  function openRegistration() {
    if (registrationOpen) onSelectEvent?.(event)
    else onNavigate?.('events')
  }

  return (
    <main
      ref={mainRef}
      className="page submission-landing event-landing-theme"
      data-event-theme={landing.themeId}
      data-motion={motion}
      data-phase={landing.phase}
      style={landingPaletteStyle(landing.layout, { withBackground: false })}
    >
      <section className="submission-landing__hero">
        <img
          alt=""
          className="submission-landing__hero-image"
          src={event?.heroImageUrl || submissionHeroImage}
        />
        <div className="submission-landing__hero-shade" aria-hidden />
        <div className="submission-landing__hero-inner" data-scene-content="">
          <button
            className="submission-landing__back"
            type="button"
            onClick={() => onNavigate?.('events')}
          >
            <ArrowLeft aria-hidden size={17} />
            {copy.back}
          </button>
          <div className="submission-landing__identity">
            {event?.logoUrl ? (
              <img
                alt={`Logo de ${title}`}
                className="submission-landing__logo"
                src={event.logoUrl}
              />
            ) : null}
            <p>{copy.eyebrow}</p>
            <h1>{title}</h1>
            {lead ? <p className="submission-landing__lead">{lead}</p> : null}
          </div>
          {comingSoon ? (
            <div className="submission-landing__progress" role="status">
              <Sparkles aria-hidden size={19} />
              <div>
                <span>{copy.comingSoon}</span>
                <strong>{copy.comingSoonTitle}</strong>
                <p>{copy.comingSoonLead}</p>
              </div>
            </div>
          ) : null}
          <a className="submission-landing__hero-action" href="#submission-information">
            {copy.information}
            <ArrowDown aria-hidden size={17} />
          </a>
        </div>
      </section>

      <section
        id="submission-information"
        className="submission-landing__details"
        aria-label={copy.overview}
        data-scene=""
      >
        <div className="submission-landing__details-inner" data-scene-content="">
          <div className="submission-landing__copy">
            <p>{comingSoon ? copy.comingSoon : copy.published}</p>
            <h2>{overviewTitle}</h2>
            <p>{locationBody}</p>
          </div>
          <dl className="submission-landing__facts">
            {date ? (
              <div>
                <dt>
                  <CalendarDays aria-hidden size={16} />
                  {copy.date}
                </dt>
                <dd>{date}</dd>
              </div>
            ) : null}
            {event?.venue ? (
              <div>
                <dt>
                  <MapPin aria-hidden size={16} />
                  {copy.venue}
                </dt>
                <dd>{event.venue}</dd>
              </div>
            ) : null}
            {event?.location ? (
              <div>
                <dt>
                  <MapPin aria-hidden size={16} />
                  {copy.location}
                </dt>
                <dd>{event.location}</dd>
              </div>
            ) : null}
          </dl>
          <button className="submission-landing__cta" type="button" onClick={openRegistration}>
            {registrationOpen ? landing.slots.ctaLabel || copy.register : copy.calendar}
          </button>
        </div>
      </section>

      <section className="submission-landing__story" aria-label={copy.officialInfo} data-scene="">
        <div className="submission-landing__story-inner" data-scene-content="">
          <article>
            <p>{copy.officialInfo}</p>
            <h2>{experienceTitle}</h2>
            <p>{experienceBody}</p>
          </article>
          <article>
            <p>{copy.officialInfo}</p>
            <h2>{categoriesTitle}</h2>
            <p>{categoriesBody}</p>
          </article>
        </div>
      </section>

      <section className="submission-landing__materials" aria-label={copy.materials} data-scene="">
        <EventPublicMaterials event={event} />
      </section>
    </main>
  )
}
