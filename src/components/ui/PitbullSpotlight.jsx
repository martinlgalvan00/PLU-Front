import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import photoLiftAvif from '../../assets/DSC00346-display.avif'
import photoLiftAvif640 from '../../assets/DSC00346-display-640.avif'
import photoLiftAvif1280 from '../../assets/DSC00346-display-1280.avif'
import photoLiftWebp from '../../assets/DSC00346-display.webp'
import photoLiftWebp640 from '../../assets/DSC00346-display-640.webp'
import photoLiftWebp1280 from '../../assets/DSC00346-display-1280.webp'
import photoMedals from '../../assets/DSC01606-display.jpg'
import photoMedalsAvif from '../../assets/DSC01606-display.avif'
import photoMedalsAvif480 from '../../assets/DSC01606-display-480.avif'
import photoMedalsAvif800 from '../../assets/DSC01606-display-800.avif'
import photoMedalsWebp from '../../assets/DSC01606-display.webp'
import photoMedalsWebp480 from '../../assets/DSC01606-display-480.webp'
import photoMedalsWebp800 from '../../assets/DSC01606-display-800.webp'
import photoSpotters from '../../assets/DSC00286-display.jpg'
import photoSpottersAvif from '../../assets/DSC00286-display.avif'
import photoSpottersAvif480 from '../../assets/DSC00286-display-480.avif'
import photoSpottersAvif800 from '../../assets/DSC00286-display-800.avif'
import photoSpottersWebp from '../../assets/DSC00286-display.webp'
import photoSpottersWebp480 from '../../assets/DSC00286-display-480.webp'
import photoSpottersWebp800 from '../../assets/DSC00286-display-800.webp'
import logoPitbullClassic from '../../assets/brand/logo-letra-transparente-ui.png'
import { env } from '../../config/env.js'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { isPaidCheckoutOpen, resolveLaunchOpenAt } from '../../lib/registrationSchedule.js'
import { getStatusMeta, isRegistrationOpen } from '../../lib/status.js'
import EventDatePlate from '../../motion/EventDatePlate.tsx'
import MaskReveal from '../../motion/MaskReveal.tsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER } from '../../motion/tokens.ts'
import BrandLogo from './BrandLogo.jsx'
import Button from './Button.jsx'
import CapacityBar from './CapacityBar.jsx'
import EventCalendarActions from './EventCalendarActions.jsx'
import ResponsivePhoto from './ResponsivePhoto.jsx'

function formatOpenDayLabel(iso, locale = 'es') {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
    })
    .replace('.', '')
}

function scrollToLaunchTeaser() {
  const target = document.getElementById('apertura-inscripciones')
  if (!target) return false
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

/** Entrada del overlay full-bleed — stagger corto (estado → logo → meta → CTA). */
const panelContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: MOTION_STAGGER.stepFast, delayChildren: 0.05 } },
}

const panelItem = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

export default function PitbullSpotlight({
  variant = 'card',
  athleteStatus = null,
  capacityStatus = 'loading',
  event,
  onDetail,
  onRegister,
  onJoin,
  onProfile,
  onResults,
  progressPublic = true,
  recent = [],
  registerLabel,
  registrationCheckoutEnabled = true,
  registered,
  slots,
}) {
  const { PITBULL_CLASSIC } = useContent()
  const { locale, t } = useI18n()
  const { reducedMotion } = useMotionConfig()
  const resolvedRegisterLabel = registerLabel ?? t('pages.events.register')
  const isHome = variant === 'home'
  const isEvents = variant === 'events'
  const dateMonthLabel = `${PITBULL_CLASSIC.dateMonth} 2026`
  const capacityRegistered = registered ?? PITBULL_CLASSIC.registered
  const capacitySlots = slots ?? PITBULL_CLASSIC.slots

  if (isEvents) {
    // Todo lo visible sale de `event` (el próximo evento real, resuelto por
    // fecha/estado en EventsPage) — antes esta rama mostraba siempre los
    // datos de PITBULL_CLASSIC sin importar qué evento llegara por prop.
    const calendarEvent = event ?? {
      slug: 'pitbull-classic-2026',
      title: PITBULL_CLASSIC.title,
      venue: PITBULL_CLASSIC.venue,
      location: PITBULL_CLASSIC.location,
      startsAt: '2026-12-12T09:00:00-03:00',
      endsAt: '2026-12-13T20:00:00-03:00',
      description: t('pages.events.spotlightLead'),
    }
    const title = event?.title ?? PITBULL_CLASSIC.title
    const venue = event?.venue ?? PITBULL_CLASSIC.venue
    const location = event?.location ?? PITBULL_CLASSIC.location
    const displayDate = event?.displayDate ?? PITBULL_CLASSIC.dateShort
    const status = event?.status ?? 'proximamente'
    const { label: statusLabel, tone: statusTone } = getStatusMeta(status, t)

    // Mismo criterio que PitbullHero: el CTA principal sigue el estado real
    // del evento — antes esta ficha ofrecía "Registrarme" aunque la
    // inscripción todavía no estuviera abierta.
    const registrationOpen = isRegistrationOpen(status)
    const isFinished = status === 'finalizado'
    let primaryLabel = resolvedRegisterLabel
    let primaryAction = onRegister
    if (!registrationOpen) {
      if (isFinished) {
        primaryLabel = t('pages.home.viewResults')
        primaryAction = onResults ?? onDetail
      } else {
        primaryLabel = t('pages.pitbull.joinNow')
        primaryAction = onJoin ?? onDetail
      }
    }

    return (
      <article className="events-spotlight-card">
        <div className="events-spotlight-card__layout">
          <div className="events-spotlight-card__main">
            <p className="events-spotlight-card__eyebrow">
              <span className="events-spotlight-card__eyebrow-dot" aria-hidden />
              {t('pages.pitbull.spotlight.nextEvent')}
            </p>

            <div className="events-spotlight-card__head">
              <div className="events-spotlight-card__copy">
                <h2 className="events-spotlight-card__title">{title}</h2>
                <p className="events-spotlight-card__meta">
                  <time dateTime={event?.dateISO}>{displayDate}</time>
                  <span aria-hidden> · </span>
                  {venue}
                  <span aria-hidden> · </span>
                  {location}
                </p>
              </div>
              <span
                className={`events-spotlight-card__status events-spotlight-card__status--${statusTone}`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="events-spotlight-card__foot">
              <div
                className="events-spotlight-card__actions"
                role="group"
                aria-label={t('pages.events.spotlightActionsAria')}
              >
                {primaryAction ? (
                  <Button
                    className="events-spotlight-card__cta events-spotlight-card__cta--primary motion-icon-shift"
                    onClick={primaryAction}
                  >
                    {primaryLabel}
                    <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  className="events-spotlight-card__cta events-spotlight-card__cta--secondary"
                  onClick={onDetail}
                >
                  {t('pages.pitbull.spotlight.viewDetail')}
                </Button>
              </div>
              <EventCalendarActions
                event={calendarEvent}
                className="events-spotlight-card__calendar"
                compact
              />
            </div>
          </div>
        </div>
      </article>
    )
  }

  if (isHome) {
    const eventStatus = event?.status ?? 'proximamente'
    const isPitbullEvent = !event?.slug || event.slug === 'pitbull-classic-2026'
    const startsAt = event?.startsAt ?? event?.dateISO
    const startsDate = startsAt
      ? new Date(String(startsAt).includes('T') ? startsAt : `${startsAt}T12:00:00`)
      : null
    const validStartsDate = startsDate && !Number.isNaN(startsDate.getTime()) ? startsDate : null
    const homeTitle = event?.title ?? PITBULL_CLASSIC.title
    const homeVenue = event?.venue ?? PITBULL_CLASSIC.venue
    const homeLocation = event?.location ?? PITBULL_CLASSIC.location
    const homeDateLabel =
      event?.displayDate ??
      event?.date ??
      (validStartsDate
        ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(validStartsDate)
        : isPitbullEvent
          ? PITBULL_CLASSIC.date
          : '')
    const homeDateTime = event?.startsAt ?? event?.dateISO ?? '2026-12-12'
    const { label: statusLabel } = getStatusMeta(eventStatus, t)
    const registrationOpen = isRegistrationOpen(eventStatus)
    const isFinished = eventStatus === 'finalizado'
    const isClosed = eventStatus === 'cerrado'
    const checkoutOpen =
      registrationCheckoutEnabled &&
      isPaidCheckoutOpen(event, env, new Date(), { checkoutKind: 'registration' })
    const registrationOpensAt = resolveLaunchOpenAt({ event })
    const openDayLabel = registrationOpensAt ? formatOpenDayLabel(registrationOpensAt, locale) : ''

    /** El CTA principal nunca ofrece una acción que el usuario no puede
     * realizar: sigue el estado real del evento + gate de cobros en prod.
     * Con checkout pausado: “Próximamente” (sin cobro). */
    let primaryLabel = t('pages.pitbull.spotlight.viewCompetition')
    let primaryAction = onDetail
    if (!checkoutOpen && !isFinished) {
      primaryLabel = t('pages.members.ctaCheckoutSoon')
      primaryAction = () => {
        if (!scrollToLaunchTeaser()) onDetail?.()
      }
    } else if (registrationOpen) {
      primaryLabel = resolvedRegisterLabel
      primaryAction = onRegister ?? onDetail
    } else if (isFinished) {
      primaryLabel = t('pages.home.viewResults')
      primaryAction = onResults ?? onDetail
    } else if (isClosed) {
      primaryLabel = t('pages.pitbull.joinNow')
      primaryAction = onJoin ?? onDetail
    }
    // El derecho propio pisa cualquier rama de arriba: la landing no puede
    // ofrecerle "Registrarme" a quien ya pagó su inscripción.
    if (athleteStatus === 'registered') {
      primaryLabel = t('pages.pitbull.viewMyRegistration')
      primaryAction = onProfile ?? onDetail
    } else if (athleteStatus === 'pending_payment') {
      primaryLabel = t('pages.events.athleteStatusAction.pending_payment')
      primaryAction = onRegister ?? onDetail
    }
    const showSecondary = primaryAction !== onDetail
    const soonHint =
      !checkoutOpen && !isFinished && openDayLabel
        ? t('pages.pitbull.spotlight.opensOnCta', { date: openDayLabel })
        : null

    const placeLine = [homeVenue, homeLocation].filter(Boolean).join(' · ')

    /** Ocupación real del torneo. Solo con dato live del servidor y con al
     * menos un inscripto: la landing no muestra un contador en cero ni el
     * cupo de referencia del contenido estático como si fuera inscripción. */
    const liveRegistered = Number(registered ?? 0)
    const liveSlots = Number(slots ?? 0)
    const showLiveCapacity =
      capacityStatus === 'live' && liveSlots > 0 && liveRegistered > 0 && progressPublic
    const occupancyPct = showLiveCapacity
      ? Math.min(100, Math.round((liveRegistered / liveSlots) * 100))
      : 0
    // Tres nombres alcanzan para dar prueba real sin volver la portada una
    // lista; el resto queda como "+N" y el detalle completo vive en Pitbull.
    const recentShown = showLiveCapacity ? recent.slice(0, 3) : []
    const recentExtra = showLiveCapacity ? Math.max(recent.length - recentShown.length, 0) : 0

    const Overlay = reducedMotion ? 'div' : m.div
    const overlayProps = reducedMotion
      ? { className: 'pitbull-spotlight__home-overlay' }
      : {
          className: 'pitbull-spotlight__home-overlay',
          variants: panelContainer,
          initial: 'hidden',
          whileInView: 'visible',
          viewport: { once: true, amount: 0.35 },
        }
    const OverlayItem = reducedMotion ? 'div' : m.div
    const overlayItemProps = reducedMotion ? {} : { variants: panelItem }

    const homeArticleClass = [
      'pitbull-spotlight',
      'pitbull-spotlight--home',
      'pitbull-spotlight--home-bleed',
      !isPitbullEvent ? 'pitbull-spotlight--home-template' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <article className={homeArticleClass}>
        <div className="pitbull-spotlight__home-stage">
          <div
            className="pitbull-spotlight__home-canvas"
            aria-hidden={isPitbullEvent ? undefined : true}
          >
            {isPitbullEvent ? (
              <picture>
                <source
                  type="image/avif"
                  media="(min-width: 640px) and (max-width: 1599px)"
                  srcSet={`${photoLiftAvif640} 640w, ${photoLiftAvif1280} 1280w, ${photoLiftAvif} 2048w`}
                  sizes="100vw"
                />
                <source
                  type="image/webp"
                  media="(min-width: 640px) and (max-width: 1599px)"
                  srcSet={`${photoLiftWebp640} 640w, ${photoLiftWebp1280} 1280w, ${photoLiftWebp} 2048w`}
                  sizes="100vw"
                />
                <source
                  type="image/avif"
                  srcSet={`${photoMedalsAvif480} 480w, ${photoMedalsAvif800} 800w, ${photoMedalsAvif} 1153w`}
                  sizes="100vw"
                />
                <source
                  type="image/webp"
                  srcSet={`${photoMedalsWebp480} 480w, ${photoMedalsWebp800} 800w, ${photoMedalsWebp} 1153w`}
                  sizes="100vw"
                />
                <img
                  src={photoMedals}
                  alt=""
                  className="pitbull-spotlight__home-hero-img"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            ) : (
              <div className="pitbull-spotlight__home-brand-canvas">
                <span className="pitbull-spotlight__home-brand-wash" />
                <span className="pitbull-spotlight__home-brand-rule" />
              </div>
            )}
            <div className="pitbull-spotlight__home-hero-scrim" aria-hidden />
          </div>

          <Overlay {...overlayProps}>
            <OverlayItem {...overlayItemProps}>
              <p className="pitbull-spotlight__home-kicker">
                <span className="pitbull-spotlight__home-kicker-dot" aria-hidden />
                <span>{statusLabel}</span>
              </p>
            </OverlayItem>

            <OverlayItem {...overlayItemProps}>
              {isPitbullEvent ? (
                <>
                  <img
                    src={logoPitbullClassic}
                    alt={t('nav.pitbull')}
                    className="pitbull-spotlight__home-event-logo"
                    loading="lazy"
                    decoding="async"
                  />
                  <h2 className="pitbull-spotlight__home-title visually-hidden">{homeTitle}</h2>
                </>
              ) : (
                <div className="pitbull-spotlight__home-brand-mark">
                  <BrandLogo
                    variant="argentina"
                    height={72}
                    imgClassName="pitbull-spotlight__home-brand-emblem"
                    alt=""
                  />
                  <h2 className="pitbull-spotlight__home-title">{homeTitle}</h2>
                </div>
              )}
            </OverlayItem>

            <OverlayItem {...overlayItemProps}>
              <p className="pitbull-spotlight__home-meta">
                {homeDateLabel ? <time dateTime={homeDateTime}>{homeDateLabel}</time> : null}
                {homeDateLabel && placeLine ? (
                  <span className="pitbull-spotlight__home-meta-sep" aria-hidden>
                    ·
                  </span>
                ) : null}
                {placeLine ? <span>{placeLine}</span> : null}
              </p>
            </OverlayItem>

            {showLiveCapacity ? (
              <OverlayItem {...overlayItemProps}>
                <div
                  className="pitbull-spotlight__home-live"
                  aria-label={t('pages.home.liveRegisteredAria', {
                    registered: liveRegistered,
                    total: liveSlots,
                  })}
                >
                  <p className="pitbull-spotlight__home-live-count">
                    <strong>{liveRegistered}</strong>
                    <span>{t('pages.home.liveRegisteredCount', { total: liveSlots })}</span>
                  </p>

                  <span className="pitbull-spotlight__home-live-track" aria-hidden>
                    <span
                      className="pitbull-spotlight__home-live-fill"
                      style={{ inlineSize: `${occupancyPct}%` }}
                    />
                  </span>

                  {recentShown.length ? (
                    <p className="pitbull-spotlight__home-live-names">
                      <span className="pitbull-spotlight__home-live-names-label">
                        {t('pages.home.liveRegisteredRecentLabel')}
                      </span>
                      {recentShown.map((item) => item.displayName).join(' · ')}
                      {recentExtra > 0
                        ? ` · ${t('pages.home.liveRegisteredMore', { count: recentExtra })}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              </OverlayItem>
            ) : null}

            <OverlayItem {...overlayItemProps}>
              <footer className="pitbull-spotlight__home-actions">
                <Button
                  variant="gold"
                  className="pitbull-spotlight__home-cta motion-icon-shift"
                  onClick={() => primaryAction?.()}
                >
                  {primaryLabel}
                  <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
                </Button>
                {soonHint ? <p className="pitbull-spotlight__home-soon-hint">{soonHint}</p> : null}
                {showSecondary ? (
                  <button
                    type="button"
                    className="pitbull-spotlight__home-cta-secondary"
                    onClick={() => onDetail?.()}
                  >
                    {t('pages.pitbull.spotlight.viewFullCard')}
                  </button>
                ) : null}
              </footer>
            </OverlayItem>
          </Overlay>
        </div>
      </article>
    )
  }

  return (
    <article className="pitbull-spotlight pitbull-spotlight--design">
      <div className="pitbull-spotlight__copy">
        <span className="pitbull-spotlight__eyebrow">
          <span className="pitbull-spotlight__eyebrow-dot" aria-hidden />
          {t('pages.pitbull.spotlight.nextEvent')}
        </span>
        <h2 className="pitbull-spotlight__title">{PITBULL_CLASSIC.title}</h2>
        <p className="pitbull-spotlight__desc">{PITBULL_CLASSIC.tagline}</p>

        <ul className="pitbull-spotlight__meta">
          <li>{PITBULL_CLASSIC.date}</li>
          <li>{PITBULL_CLASSIC.location}</li>
        </ul>

        <div className="pitbull-spotlight__tags">
          {PITBULL_CLASSIC.categories.map((category) => (
            <span key={category} className="pitbull-spotlight__tag">
              {category}
            </span>
          ))}
        </div>

        <div className="pitbull-spotlight__capacity">
          <CapacityBar
            current={capacityRegistered}
            total={capacitySlots}
            label={t('pages.pitbull.spotlight.slotsOccupied')}
          />
        </div>

        <div className="pitbull-spotlight__actions">
          <Button onClick={onDetail}>{t('pages.events.viewPitbull')}</Button>
          {onRegister ? (
            <Button variant="outline" onClick={onRegister}>
              {resolvedRegisterLabel}
            </Button>
          ) : (
            <span className="pitbull-spotlight__soon">
              <span className="pitbull-spotlight__soon-dot" aria-hidden />
              {t('pages.pitbull.spotlight.registrationSoon')}
            </span>
          )}
        </div>
      </div>

      <MaskReveal className="pitbull-spotlight__visual" direction="right">
        <ResponsivePhoto
          src={photoSpotters}
          avif={{ 480: photoSpottersAvif480, 800: photoSpottersAvif800, 1153: photoSpottersAvif }}
          webp={{ 480: photoSpottersWebp480, 800: photoSpottersWebp800, 1153: photoSpottersWebp }}
          alt=""
          className="pitbull-spotlight__visual-img"
          sizes="(min-width: 900px) 45vw, 100vw"
          aria-hidden
        />
        <div className="pitbull-spotlight__visual-overlay" aria-hidden />
        <span className="pitbull-spotlight__badge">{t('pages.pitbull.spotlight.featured')}</span>
        <EventDatePlate
          day={PITBULL_CLASSIC.dateDay}
          month={dateMonthLabel}
          className="pitbull-spotlight__visual-date"
          as="div"
        />
      </MaskReveal>
    </article>
  )
}
