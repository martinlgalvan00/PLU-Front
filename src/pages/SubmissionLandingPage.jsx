import { ArrowDown, ArrowLeft, CalendarDays, MapPin, Sparkles } from 'lucide-react'
import submissionHeroImage from '../assets/DSC01606-display.webp'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { eventPublicTitle } from '../lib/eventPublicSurface.js'
import EventPublicMaterials from '../components/ui/EventPublicMaterials.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/submission-landing.css'

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

function copyFor(locale) {
  return locale === 'en'
    ? {
        back: 'Back to calendar',
        eyebrow: 'PLU ARG PRESENTS',
        comingSoon: 'IN PROGRESS',
        comingSoonTitle: 'Registration will open soon.',
        comingSoonLead:
          'The event is already underway. Official information will be published here as it is confirmed.',
        published: 'OFFICIAL EVENT',
        overview: 'THE EVENT',
        overviewFallback:
          'A PLU ARG event built around technical standards, performance, and a clear competition experience.',
        experience: 'THE EXPERIENCE',
        experienceFallback:
          'Barbell Submission brings athletes, coaches, and the technical team together around a single competitive standard.',
        categories: 'COMPETITION INFORMATION',
        categoriesFallback:
          'The official format, divisions, and registration requirements will be published in this page before registration opens.',
        date: 'DATE',
        venue: 'VENUE',
        location: 'LOCATION',
        register: 'Register',
        calendar: 'View calendar',
        information: 'View event information',
        officialInfo: 'OFFICIAL INFORMATION',
        materials: 'Updates and materials',
      }
    : {
        back: 'Volver al calendario',
        eyebrow: 'PLU ARG PRESENTA',
        comingSoon: 'EN PREPARACION',
        comingSoonTitle: 'Las inscripciones abren proximamente.',
        comingSoonLead:
          'El evento ya esta en marcha. La informacion oficial se publicara aca a medida que se confirme.',
        published: 'EVENTO OFICIAL',
        overview: 'EL EVENTO',
        overviewFallback:
          'Un evento PLU ARG construido alrededor de los estandares tecnicos, el rendimiento y una experiencia de competencia clara.',
        experience: 'LA EXPERIENCIA',
        experienceFallback:
          'Barbell Submission reune atletas, entrenadores y equipo tecnico alrededor de un mismo estandar de competencia.',
        categories: 'INFORMACION DE COMPETENCIA',
        categoriesFallback:
          'El formato oficial, las divisiones y los requisitos de inscripcion se publicaran en esta pagina antes de la apertura.',
        date: 'FECHA',
        venue: 'SEDE',
        location: 'UBICACION',
        register: 'Inscribirme',
        calendar: 'Ver calendario',
        information: 'Ver informacion del evento',
        officialInfo: 'INFORMACION OFICIAL',
        materials: 'Novedades y materiales',
      }
}

/** Landing propia de Barbell Submission, separada del dossier de Pitbull. */
export default function SubmissionLandingPage({
  eventSlug,
  events = [],
  onNavigate,
  onSelectEvent,
}) {
  const { locale } = useI18n()
  const event = events.find((item) => item.slug === eventSlug) ?? null
  const landing = eventLandingFromEvent(event)
  const copy = copyFor(locale)
  const comingSoon = landing.phase === 'coming_soon'
  const title = landing.slots.heroTitle || eventPublicTitle(event) || 'Barbell Submission'
  const lead = landing.slots.heroLead || event?.description || ''
  const date = formatEventDate(event, locale)
  const registrationOpen = ['inscripcion_abierta', 'cupos_limitados'].includes(event?.status)
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
      className="page submission-landing event-landing-theme"
      data-event-theme={landing.themeId}
      data-phase={landing.phase}
    >
      <section className="submission-landing__hero">
        <img
          alt=""
          className="submission-landing__hero-image"
          src={event?.heroImageUrl || submissionHeroImage}
        />
        <div className="submission-landing__hero-shade" aria-hidden />
        <div className="submission-landing__hero-inner">
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
      >
        <div className="submission-landing__details-inner">
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

      <section className="submission-landing__story" aria-label={copy.officialInfo}>
        <div className="submission-landing__story-inner">
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

      <section className="submission-landing__materials" aria-label={copy.materials}>
        <EventPublicMaterials event={event} />
      </section>
    </main>
  )
}
