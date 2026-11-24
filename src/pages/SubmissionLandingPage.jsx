import { useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, CalendarDays, MapPin } from 'lucide-react'
import SubmissionLogoCover from '../components/events/SubmissionLogoCover.jsx'
import ConstructionScene from '../components/events/construction/ConstructionScene.jsx'
import { BRAND } from '../lib/brand.js'
import { eventExternalForm } from '../lib/eventExternalForm.js'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { normalizeLandingMotion } from '../lib/eventLandingMotion.js'
import useRevealOnScroll from '../hooks/useRevealOnScroll.js'
import { landingPaletteStyle } from '../lib/eventLandingPalette.js'
import { isEventRegistrationOpen } from '../lib/eventPublicActions.js'
import {
  eventPublicTitle,
  eventShowsPublicCategories,
  eventShowsPublicExperience,
} from '../lib/eventPublicSurface.js'
import EventPublicMaterials from '../components/ui/EventPublicMaterials.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { prefersReducedMotion } from '../motion/useReducedMotion.ts'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/submission-landing.css'
import '../styles/pages/submission-logo-cover.css'
import '../styles/pages/event-landing-motion.css'

/** Días enteros hasta el evento; `null` si ya pasó o no hay fecha. */
function daysUntil(event, now = new Date()) {
  const value = event?.startsAt ?? (event?.dateISO ? `${event.dateISO}T12:00:00` : '')
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000)
  return days >= 0 ? days : null
}

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
        comingSoonTitle: 'We are building this page.',
        comingSoonLead: 'Official information is published here as it is confirmed.',
        building: 'Building the page',
        registerOpen: 'Registration open',
        registerReady: 'Registration is already open.',
        form: 'Fill in the form',
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
        buildEyebrow: 'Official page',
        buildTitle: 'We are building the official tournament page.',
        buildQuiet: 'We are building',
        buildStrong: 'the official',
        buildClose: 'tournament page.',
        remaining: 'Time left',
        days: (count) => (count === 0 ? 'Today' : count === 1 ? '1 day' : `${count} days`),
      }
    : {
        back: 'Volver al calendario',
        eyebrow: 'PLU ARG presenta',
        comingSoon: 'En preparación',
        comingSoonTitle: 'Estamos armando esta página.',
        comingSoonLead: 'La información oficial se publica acá a medida que se confirma.',
        building: 'Armando la página',
        registerOpen: 'Inscripción abierta',
        registerReady: 'La inscripción ya está abierta.',
        form: 'Responder el formulario',
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
        buildEyebrow: 'Página oficial',
        buildTitle: 'Estamos construyendo la página oficial del torneo.',
        buildQuiet: 'Estamos construyendo',
        buildStrong: 'la página oficial',
        buildClose: 'del torneo.',
        remaining: 'Faltan',
        days: (count) => (count === 0 ? 'Es hoy' : count === 1 ? '1 día' : `${count} días`),
      }
}

function CtaContent({ children }) {
  return (
    <>
      <span>{children}</span>
      <span className="submission-landing__cta-mark">
        <ArrowRight
          aria-hidden
          className="submission-landing__cta-icon"
          size={16}
          strokeWidth={1.75}
        />
      </span>
    </>
  )
}

/** Landing propia de Barbell Submission, separada del dossier de Pitbull. */
export default function SubmissionLandingPage({
  eventSlug,
  events = [],
  onNavigate,
  onSelectEvent,
  checkoutAvailability = null,
}) {
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const event = events.find((item) => item.slug === eventSlug) ?? null
  const landing = eventLandingFromEvent(event)
  const motion = normalizeLandingMotion(landing.layout?.motion)
  const mainRef = useRef(null)
  const heroLogoRef = useRef(null)
  const [dismissedSlug, setDismissedSlug] = useState(null)
  const coverEnabled =
    Boolean(event?.logoUrl) && motion !== 'none' && !reducedMotion && !prefersReducedMotion()
  const coverActive = coverEnabled && dismissedSlug !== eventSlug
  const paletteStyle = landingPaletteStyle(landing.layout, { withBackground: false })
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
  const externalForm = eventExternalForm(event)
  const experienceTitle = landing.slots.experienceTitle || copy.experience
  const experienceBody = landing.slots.experienceBody || copy.experienceFallback
  const categoriesTitle = landing.slots.categoriesTitle || copy.categories
  const categoriesBody = landing.slots.categoriesBody || copy.categoriesFallback
  const showExperience = eventShowsPublicExperience(event)
  const showCategories = eventShowsPublicCategories(event)
  const overviewTitle = landing.slots.locationTitle || copy.overview
  // La bajada ya está en la portada: repetirla como texto de "El evento" decía
  // lo mismo dos veces seguidas.
  const locationBody = landing.slots.locationBody || copy.overviewFallback
  // Sin foto propia, la portada es tipográfica con el logo como emblema. Antes
  // caía en una foto de medallas de Pitbull Classic: otro evento.
  const heroImage = event?.heroImageUrl || null
  const stage = !heroImage
  const remaining = daysUntil(event)
  const place = [event?.venue, event?.location].filter(Boolean)

  function openRegistration() {
    if (registrationOpen) onSelectEvent?.(event)
    else onNavigate?.('events')
  }

  return (
    <main
      ref={mainRef}
      className={`page submission-landing event-landing-theme${coverActive ? ' submission-landing--logo-cover' : ''}`}
      data-event-theme={landing.themeId}
      data-motion={motion}
      data-phase={landing.phase}
      data-skip-route-morph={coverActive ? '' : undefined}
      style={paletteStyle}
    >
      {coverActive ? (
        <SubmissionLogoCover
          heroLogoRef={heroLogoRef}
          logoUrl={event.logoUrl}
          paletteStyle={paletteStyle}
          themeId={landing.themeId}
          onDone={() => setDismissedSlug(eventSlug)}
        />
      ) : null}
      <section className="submission-landing__hero" data-hero={stage ? 'stage' : 'photo'}>
        {heroImage ? (
          <>
            <img alt="" className="submission-landing__hero-image" src={heroImage} />
            <div className="submission-landing__hero-shade" aria-hidden />
          </>
        ) : null}
        <div className="submission-landing__hero-inner" data-scene-content="">
          <button
            className="submission-landing__back"
            type="button"
            onClick={() => onNavigate?.('events')}
          >
            <ArrowLeft aria-hidden size={17} />
            {copy.back}
          </button>
          <div className="submission-landing__hero-grid">
            <div className="submission-landing__identity">
              {event?.logoUrl && !stage ? (
                <img
                  ref={heroLogoRef}
                  alt={`Logo de ${title}`}
                  className="submission-landing__logo"
                  src={event.logoUrl}
                />
              ) : null}
              <p className="submission-landing__eyebrow">{copy.eyebrow}</p>
              <h1>{title}</h1>
              {lead ? <p className="submission-landing__lead">{lead}</p> : null}
              {!comingSoon && registrationOpen ? (
                <p className="submission-landing__status" role="status">
                  <span className="submission-landing__status-dot" aria-hidden />
                  {copy.registerOpen}
                </p>
              ) : null}
              {registrationOpen ? (
                <button
                  className="submission-landing__cta"
                  type="button"
                  onClick={openRegistration}
                >
                  <CtaContent>{landing.slots.ctaLabel || copy.register}</CtaContent>
                </button>
              ) : null}
            </div>
            {event?.logoUrl && stage ? (
              <figure className="submission-landing__emblem">
                <svg
                  className="submission-landing__ring"
                  viewBox="0 0 200 200"
                  aria-hidden
                  focusable="false"
                >
                  <circle className="submission-landing__ring-track" cx="100" cy="100" r="96" />
                  <circle className="submission-landing__ring-draw" cx="100" cy="100" r="96" />
                </svg>
                <img
                  ref={heroLogoRef}
                  alt={`Logo de ${title}`}
                  className="submission-landing__emblem-logo"
                  src={event.logoUrl}
                />
              </figure>
            ) : null}
          </div>
          {comingSoon ? (
            <div className="submission-landing__progress">
              <div className="submission-landing__progress-copy" role="status">
                <span>{registrationOpen ? copy.registerOpen : copy.comingSoon}</span>
                <strong>{registrationOpen ? copy.registerReady : copy.comingSoonTitle}</strong>
                <p>{copy.comingSoonLead}</p>
                {externalForm.url ? (
                  <div className="submission-landing__progress-actions">
                    <a
                      className={
                        registrationOpen ? 'submission-landing__form' : 'submission-landing__cta'
                      }
                      href={externalForm.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {registrationOpen ? (
                        externalForm.label || copy.form
                      ) : (
                        <CtaContent>{externalForm.label || copy.form}</CtaContent>
                      )}
                    </a>
                  </div>
                ) : null}
              </div>
              <ConstructionScene
                interactive={false}
                motion={motion}
                statusLabel={registrationOpen ? copy.registerOpen : copy.building}
                t={t}
              />
            </div>
          ) : null}
          {!comingSoon && (date || place.length || remaining != null) ? (
            <dl className="submission-landing__band">
              {date ? (
                <div>
                  <dt>{copy.date}</dt>
                  <dd>{date}</dd>
                </div>
              ) : null}
              {place.length ? (
                <div>
                  <dt>{copy.venue}</dt>
                  <dd>
                    <span>{place[0]}</span>
                    {place[1] ? <small>{place[1]}</small> : null}
                  </dd>
                </div>
              ) : null}
              {remaining != null ? (
                <div>
                  <dt>{copy.remaining}</dt>
                  <dd>{copy.days(remaining)}</dd>
                </div>
              ) : null}
            </dl>
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
            <p>
              {comingSoon
                ? registrationOpen
                  ? copy.registerOpen
                  : copy.comingSoon
                : copy.published}
            </p>
            <h2>{overviewTitle}</h2>
            <p>{locationBody}</p>
          </div>
          {comingSoon ? (
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
          ) : null}
          <button className="submission-landing__cta" type="button" onClick={openRegistration}>
            <CtaContent>
              {registrationOpen ? landing.slots.ctaLabel || copy.register : copy.calendar}
            </CtaContent>
          </button>
        </div>
      </section>

      {comingSoon ? (
        <section className="submission-landing__build" aria-label={copy.buildTitle} data-scene="">
          <div className="submission-landing__build-inner" data-scene-content="">
            <div className="submission-landing__lockup">
              {event?.logoUrl ? (
                <img
                  alt={`Logo de ${title}`}
                  className="submission-landing__lockup-event"
                  src={event.logoUrl}
                />
              ) : null}
              {event?.logoUrl ? (
                <span aria-hidden="true" className="submission-landing__lockup-mark">
                  ×
                </span>
              ) : null}
              <img
                alt={BRAND.logoArgentinaAlt}
                className="submission-landing__lockup-plu"
                decoding="async"
                height="180"
                src={BRAND.appleTouchIconUrl}
                width="180"
              />
            </div>
            <div className="submission-landing__build-copy">
              <p>{copy.buildEyebrow}</p>
              <h2>
                <span className="submission-landing__build-quiet">{copy.buildQuiet}</span>{' '}
                <span className="submission-landing__build-strong">{copy.buildStrong}</span>{' '}
                <span className="submission-landing__build-strong">{copy.buildClose}</span>
              </h2>
              <p>{copy.comingSoonLead}</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Respeta los interruptores del editor: antes "Experiencia" y
          "Categorías" se podían apagar en el panel y la página los mostraba igual. */}
      {showExperience || showCategories ? (
        <section className="submission-landing__story" aria-label={copy.officialInfo} data-scene="">
          <div className="submission-landing__story-inner" data-scene-content="">
            <p className="submission-landing__story-eyebrow">{copy.officialInfo}</p>
            {showExperience ? (
              <article>
                <h2>{experienceTitle}</h2>
                <p>{experienceBody}</p>
              </article>
            ) : null}
            {showCategories ? (
              <article>
                <h2>{categoriesTitle}</h2>
                <p>{categoriesBody}</p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="submission-landing__materials" aria-label={copy.materials} data-scene="">
        <EventPublicMaterials event={event} hideEmptyRecent />
      </section>
    </main>
  )
}
