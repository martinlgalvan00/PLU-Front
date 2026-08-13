import '../styles/pages/design-phase2.css'
import '../styles/pages/pitbull.css'
import '../styles/pages/pitbull-journey.css'
import '../styles/pages/pitbull-meet.css'
import '../styles/pages/pitbull-categories.css'
import '../styles/layout/design-page-notebook.css'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  FileText,
} from 'lucide-react'
import { m } from 'motion/react'
import photoMeetFloor from '../assets/DSC00346-display.jpg'
import photoCrowd from '../assets/DSC00392-display.jpg'
import PitbullHero from '../components/layout/PitbullHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import EventVenueMap from '../components/ui/EventVenueMap.jsx'
import LaunchRegistrationTeaser from '../components/ui/LaunchRegistrationTeaser.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useEventRegistrationCapacity } from '../hooks/useEventRegistrationCapacity.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing, resolveLiveComboOffer } from '../lib/eventPricing.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import { getPitbullClassicEvent } from '../lib/eventNavigation.js'
import { buildExternalMapUrl, buildWazeUrl } from '../lib/eventMap.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { formatRelativeTime, formatShortDate, money } from '../lib/format.js'
import { getStatusMeta, isRegistrationOpen } from '../lib/status.js'
import { hasCurrentMembership } from '../services/membershipService.js'
import AnimatedNumber from '../motion/AnimatedNumber.tsx'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER, MOTION_VIEWPORT } from '../motion/tokens.ts'
import { staggerContainer, staggerItem } from '../motion/variants.ts'

function scrollToSection(id) {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start',
  })
}

function PitbullDossierSection({
  id,
  index,
  eyebrow,
  title,
  lead,
  titleId,
  className = '',
  tone = 'default',
  hideHeader = false,
  children,
}) {
  const isOps = tone === 'ops'

  return (
    <section
      id={id}
      className={`pitbull-dossier__section${isOps ? ' pitbull-dossier__section--ops' : ''} ${className}`.trim()}
      aria-label={hideHeader ? title : undefined}
      aria-labelledby={hideHeader ? undefined : titleId}
    >
      <Reveal as="div" direction="up" className="pitbull-dossier__reveal">
        {!hideHeader ? (
          <header className={`pitbull-dossier__head${isOps ? ' pitbull-dossier__head--ops' : ''}`}>
            {isOps ? null : (
              <p className="pitbull-dossier__kicker">
                <span className="pitbull-dossier__index" aria-hidden>
                  {index}
                </span>
                <span className="pitbull-dossier__eyebrow">{eyebrow}</span>
              </p>
            )}
            <h2 id={titleId} className="pitbull-dossier__title">
              {title}
            </h2>
            {lead && !isOps ? <p className="pitbull-dossier__lead">{lead}</p> : null}
          </header>
        ) : null}

        {children ? <div className="pitbull-dossier__body">{children}</div> : null}
      </Reveal>
    </section>
  )
}

function PitbullSectionNav({ items, t }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? null)
  const trackRef = useRef(null)
  const { reducedMotion } = useMotionConfig()
  // Los ids son estables; los labels cambian con el locale. Observar por key
  // evita reconectar el IntersectionObserver en cada render de la página.
  const itemIdsKey = items.map((item) => item.id).join('|')

  useEffect(() => {
    const ids = itemIdsKey.split('|').filter(Boolean)
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean)
    if (!sections.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (topmost) setActiveId(topmost.target.id)
      },
      // Banda de lectura: la sección que cruza el tercio superior manda.
      { rootMargin: '-18% 0px -58% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [itemIdsKey])

  function handleSelect(id) {
    setActiveId(id)
    scrollToSection(id)
    // En mobile el track scrollea: el ítem elegido queda centrado, no cortado.
    const item = trackRef.current?.querySelector(`[data-section-id="${CSS.escape(id)}"]`)
    item?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  return (
    <nav className="pitbull-section-nav" aria-label={t('pages.pitbull.pageNavAria')}>
      <div className="pitbull-section-nav__inner">
        <span className="pitbull-section-nav__label">{t('pages.pitbull.pageNavLabel')}</span>
        <div className="pitbull-section-nav__track" ref={trackRef}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-section-id={item.id}
              className={`pitbull-section-nav__item${activeId === item.id ? ' is-active' : ''}`}
              aria-current={activeId === item.id ? 'location' : undefined}
              onClick={() => handleSelect(item.id)}
            >
              <span className="pitbull-section-nav__index" aria-hidden>
                {item.index}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

function PitbullInscriptionCounter({
  registered,
  slots,
  statusLabel,
  statusTone,
  t,
  variant = 'default',
  softLaunch = false,
  capacityLive = false,
}) {
  const { reducedMotion } = useMotionConfig()
  const showMeter = capacityLive && !softLaunch
  const pct = showMeter && slots > 0 ? Math.round((registered / slots) * 100) : 0
  const isCompact = variant === 'compact'
  const ariaLabel = softLaunch
    ? t('pages.pitbull.inscriptionCounterPendingAria')
    : t('pages.pitbull.inscriptionCounterAria', { registered, slots })

  return (
    <div
      className={[
        'pitbull-inscription-counter',
        isCompact ? 'pitbull-inscription-counter--compact' : '',
        softLaunch ? 'pitbull-inscription-counter--soon' : '',
      ].filter(Boolean).join(' ')}
      role="meter"
      aria-label={ariaLabel}
      aria-valuenow={showMeter ? registered : 0}
      aria-valuemin={0}
      aria-valuemax={slots || 0}
    >
      <div className="pitbull-inscription-counter__row">
        <div className="pitbull-inscription-counter__stat">
          {showMeter ? (
            <>
              <AnimatedNumber className="pitbull-inscription-counter__value" value={registered} />
              <span className="pitbull-inscription-counter__of">/ {slots}</span>
            </>
          ) : (
            <>
              <span className="pitbull-inscription-counter__value pitbull-inscription-counter__value--pending" aria-hidden>
                —
              </span>
              {slots > 0 ? (
                <span className="pitbull-inscription-counter__of">/ {slots}</span>
              ) : null}
            </>
          )}
          <span className="pitbull-inscription-counter__unit">
            {softLaunch ? t('pages.pitbull.slotsPending') : t('pages.pitbull.slots')}
          </span>
        </div>
        {reducedMotion ? (
          <span className={`pitbull-inscription-counter__badge pitbull-inscription-counter__badge--${statusTone}`}>
            <span className="pitbull-inscription-counter__badge-dot" aria-hidden />
            {statusLabel}
          </span>
        ) : (
          <m.span
            className={`pitbull-inscription-counter__badge pitbull-inscription-counter__badge--${statusTone}`}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={MOTION_VIEWPORT}
            transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out, delay: 0.18 }}
          >
            <span className="pitbull-inscription-counter__badge-dot" aria-hidden />
            {statusLabel}
          </m.span>
        )}
      </div>
      {showMeter ? (
        <div className="pitbull-inscription-counter__bar" aria-hidden>
          {reducedMotion ? (
            <div className="pitbull-inscription-counter__fill" style={{ transform: `scaleX(${pct / 100})` }} />
          ) : (
            <m.div
              className="pitbull-inscription-counter__fill"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: pct / 100 }}
              viewport={MOTION_VIEWPORT}
              transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out }}
            />
          )}
        </div>
      ) : (
        <p className="pitbull-inscription-counter__hint">{t('pages.pitbull.inscriptionCounterPending')}</p>
      )}
    </div>
  )
}

function PitbullExperienceSection({ t }) {
  const { reducedMotion } = useMotionConfig()
  const items = [
    {
      id: 'equipment',
      label: t('pages.pitbull.experienceItemEquipment'),
      text: t('pages.pitbull.experienceItemEquipmentDesc'),
    },
    {
      id: 'judges',
      label: t('pages.pitbull.experienceItemJudges'),
      text: t('pages.pitbull.experienceItemJudgesDesc'),
    },
    {
      id: 'media',
      label: t('pages.pitbull.experienceItemMedia'),
      text: t('pages.pitbull.experienceItemMediaDesc'),
    },
    {
      id: 'warmup',
      label: t('pages.pitbull.experienceItemWarmup'),
      text: t('pages.pitbull.experienceItemWarmupDesc'),
    },
  ]

  const StageTag = reducedMotion ? 'div' : m.div
  const PillarsTag = reducedMotion ? 'ul' : m.ul
  const PillarTag = reducedMotion ? 'li' : m.li
  const stageMotion = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: MOTION_VIEWPORT,
        transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
      }
  const pillarsMotion = reducedMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
      }
  const pillarMotion = reducedMotion ? {} : { variants: staggerItem }

  return (
    <section
      id="experiencia"
      className="pitbull-dossier__section pitbull-dossier__section--experience"
      aria-labelledby="pitbull-experience-title"
    >
      <Reveal as="div" direction="up" className="pitbull-dossier__reveal">
        <div className="pitbull-experience pitbull-experience--stage">
          <StageTag className="pitbull-experience__stage" {...stageMotion}>
            <figure className="pitbull-experience__media">
              <img
                className="pitbull-experience__img"
                src={photoMeetFloor}
                alt=""
                width={800}
                height={1200}
                loading="lazy"
                decoding="async"
              />
              <div className="pitbull-experience__scrim" aria-hidden />
            </figure>
            <header className="pitbull-experience__masthead">
              <p className="pitbull-experience__kicker">
                <span className="pitbull-experience__index" aria-hidden>
                  {t('pages.pitbull.experienceIndex')}
                </span>
                <span>{t('pages.pitbull.experienceEyebrow')}</span>
              </p>
              <h2 id="pitbull-experience-title" className="pitbull-experience__title">
                {t('pages.pitbull.experienceTitle')}
              </h2>
              <p className="pitbull-experience__lead">{t('pages.pitbull.experienceLead')}</p>
            </header>
          </StageTag>

          <PillarsTag
            className="pitbull-experience__pillars"
            aria-label={t('pages.pitbull.experienceListAria')}
            {...pillarsMotion}
          >
            {items.map((item) => (
              <PillarTag key={item.id} className="pitbull-experience__pillar" {...pillarMotion}>
                <h3 className="pitbull-experience__label">{item.label}</h3>
                <p className="pitbull-experience__text">{item.text}</p>
              </PillarTag>
            ))}
          </PillarsTag>
        </div>
      </Reveal>
    </section>
  )
}

function PitbullWeighInSnapshot() {
  const { t } = useI18n()

  return (
    <PitbullDossierSection
      id="pesajes"
      className="pitbull-dossier__section--weighins"
      eyebrow={t('pages.pitbull.weighInsEyebrow')}
      index={t('pages.pitbull.weighInsIndex')}
      lead={t('pages.pitbull.weighInsLead')}
      title={t('pages.pitbull.weighInsTitle')}
      titleId="pitbull-weighins-title"
    >
      <div className="pitbull-weighins" role="list">
        <article className="pitbull-weighin" role="listitem">
          <p className="pitbull-weighin__day">{t('pages.pitbull.weighInsFriday')}</p>
          <div className="pitbull-weighin__slots">
            <time className="pitbull-weighin__time" dateTime="09:00/12:00">
              {t('pages.pitbull.weighInsFridaySlot1')}
            </time>
            <time className="pitbull-weighin__time" dateTime="16:00/19:00">
              {t('pages.pitbull.weighInsFridaySlot2')}
            </time>
          </div>
          <p className="pitbull-weighin__note">{t('pages.pitbull.weighInsFridayNote')}</p>
        </article>
        <article className="pitbull-weighin" role="listitem">
          <p className="pitbull-weighin__day">{t('pages.pitbull.weighInsSaturday')}</p>
          <div className="pitbull-weighin__slots">
            <time className="pitbull-weighin__time" dateTime="07:00/08:30">
              {t('pages.pitbull.weighInsSaturdaySlot')}
            </time>
          </div>
          <p className="pitbull-weighin__note">{t('pages.pitbull.weighInsSaturdayNote')}</p>
        </article>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullLocationSection({ event, venue, t }) {
  const locality = venue.locality?.replace(/^B\d+\s*/, '') || ''
  const lead = venue.street
    ? [venue.street, locality].filter(Boolean).join(' · ')
    : t('pages.pitbull.locationLead')

  const travelTarget = {
    ...event,
    address: venue.address,
    addressVenue: venue.name,
    coordinateVenue: venue.name,
    latitude: venue.latitude ?? event?.latitude,
    location: venue.locality ?? event?.location,
    longitude: venue.longitude ?? event?.longitude,
    mapsUrl: venue.mapsUrl || event?.mapsUrl,
    venue: venue.name,
  }
  const googleMapsUrl = venue.mapsUrl || buildExternalMapUrl(travelTarget)
  const wazeUrl = buildWazeUrl(travelTarget)

  return (
    <PitbullDossierSection
      id="lugar"
      className="pitbull-dossier__section--location"
      eyebrow={t('pages.pitbull.locationEyebrow')}
      index={t('pages.pitbull.locationIndex')}
      lead={lead}
      title={venue.name || t('pages.pitbull.locationTitle')}
      titleId="pitbull-location-title"
    >
      <div className="pitbull-venue">
        <div className="pitbull-venue__map">
          <EventVenueMap
            event={event}
            role={t('pages.pitbull.locationOfficialRole')}
            venue={venue}
          />
          <div className="pitbull-venue__dock">
            <div className="pitbull-venue__dock-copy">
              <p className="pitbull-venue__role">{t('pages.pitbull.locationOfficialRole')}</p>
              {venue.street ? <p className="pitbull-venue__street">{venue.street}</p> : null}
              {locality ? <p className="pitbull-venue__locality">{locality}</p> : null}
            </div>
            {googleMapsUrl || wazeUrl ? (
              <nav
                className="pitbull-venue__travel"
                aria-label={t('pages.pitbull.locationTravelAria')}
              >
                {googleMapsUrl ? (
                  <a
                    className="pitbull-venue__directions pitbull-venue__directions--maps motion-icon-shift"
                    href={googleMapsUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t('pages.pitbull.locationMapsLink')}
                    <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
                  </a>
                ) : null}
                {wazeUrl ? (
                  <a
                    className="pitbull-venue__directions pitbull-venue__directions--waze"
                    href={wazeUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t('pages.pitbull.locationWazeLink')}
                    <ArrowRight size={14} aria-hidden />
                  </a>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullTicketsBand({ onOpen, t }) {
  return (
    <section
      id="entradas"
      className="pitbull-tickets-band"
      aria-labelledby="pitbull-tickets-title"
    >
      <div className="pitbull-tickets-band__media" aria-hidden>
        <img
          className="pitbull-tickets-band__img"
          src={photoCrowd}
          alt=""
          width={800}
          height={1200}
          loading="lazy"
          decoding="async"
        />
        <div className="pitbull-tickets-band__scrim" />
      </div>
      <div className="pitbull-tickets-band__content">
        <p className="pitbull-tickets-band__kicker">
          <span className="pitbull-tickets-band__index" aria-hidden>
            {t('pages.pitbull.ticketsIndex')}
          </span>
          <span className="pitbull-tickets-band__eyebrow">{t('pages.pitbull.ticketsEyebrow')}</span>
        </p>
        <h2 id="pitbull-tickets-title" className="pitbull-tickets-band__title">
          {t('pages.pitbull.ticketsTitle')}
        </h2>
        <p className="pitbull-tickets-band__lead">{t('pages.pitbull.ticketsLead')}</p>
        <p className="pitbull-tickets-band__facts" aria-label={t('pages.pitbull.ticketsFactsAria')}>
          <span>{t('pages.pitbull.ticketsFactId')}</span>
          <span aria-hidden>·</span>
          <span>{t('pages.pitbull.ticketsFactMembership')}</span>
          <span aria-hidden>·</span>
          <span>{t('pages.pitbull.ticketsNote')}</span>
        </p>
        <button
          type="button"
          className="pitbull-tickets-band__cta motion-icon-shift"
          onClick={onOpen}
        >
          {t('pages.pitbull.ticketPassCta')}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
      </div>
    </section>
  )
}

function PitbullRecentRegistrants({ capacityStatus, locale, recent, t }) {
  const isEmpty = recent.length === 0
  const isLive = capacityStatus === 'live'

  return (
    <div
      className={`pitbull-recent${isEmpty ? ' pitbull-recent--empty' : ''}`}
      aria-label={t('pages.pitbull.recentRegistrantsAria')}
    >
      <div className="pitbull-recent__head">
        <h3 className="pitbull-recent__title">{t('pages.pitbull.recentRegistrantsTitle')}</h3>
        {isLive ? (
          <p className="pitbull-recent__hint pitbull-recent__hint--live">
            <span className="pitbull-recent__hint-dot" aria-hidden />
            {t('pages.pitbull.recentRegistrantsLiveHint')}
          </p>
        ) : null}
      </div>

      {isEmpty ? (
        <div className="pitbull-recent__empty" role="status">
          <p className="pitbull-recent__empty-lead">{t('pages.pitbull.recentRegistrantsEmpty')}</p>
          <p className="pitbull-recent__empty-note">
            {isLive
              ? t('pages.pitbull.recentRegistrantsEmptyNote')
              : t('pages.pitbull.recentRegistrantsFallbackHint')}
          </p>
        </div>
      ) : (
        <ol className="pitbull-recent__list">
          {recent.map((item, index) => {
            const line = [item.displayName, item.gym].filter(Boolean).join(' · ')
            return (
              <li key={`${item.displayName}-${item.registeredAt ?? index}`} className="pitbull-recent__row">
                <span className="pitbull-recent__name">{line}</span>
                <time className="pitbull-recent__time" dateTime={item.registeredAt ?? undefined}>
                  {formatRelativeTime(item.registeredAt, locale)}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function PitbullInscriptionSection({
  canRegister,
  capacityStatus,
  checkoutLocked = false,
  comboOffer = null,
  event,
  eventStatus,
  hasActiveMembership = false,
  locale,
  onNavigate,
  onRegister,
  pricing,
  recent,
  registered,
  slots,
  t,
}) {
  const { reducedMotion } = useMotionConfig()
  const softLaunch = checkoutLocked || eventStatus === 'proximamente'
  const capacityLive = capacityStatus === 'live'
  const statusMeta = getStatusMeta(eventStatus, t)
  const statusLabel = softLaunch ? t('pages.pitbull.badgeComingSoon') : statusMeta.label
  const statusTone = softLaunch ? 'neutral' : statusMeta.tone
  const comboLive = Boolean(comboOffer) && !softLaunch && !hasActiveMembership
  const separateTotal = Number(pricing.membership) + Number(pricing.registration)
  const comboSavings = comboLive ? Math.max(0, separateTotal - Number(comboOffer.price)) : 0
  const comboEndsLabel = comboOffer?.endsAt
    ? formatShortDate(String(comboOffer.endsAt).slice(0, 10), locale)
    : null

  const bodyGroupMotion = {
    hidden: {},
    show: { transition: { staggerChildren: MOTION_STAGGER.step, delayChildren: 0.24 } },
  }
  const bodyEntryMotion = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out } },
  }
  const Body = reducedMotion ? 'div' : m.div
  const bodyProps = reducedMotion
    ? {}
    : { variants: bodyGroupMotion, initial: 'hidden', whileInView: 'show', viewport: MOTION_VIEWPORT }
  const Pricing = reducedMotion ? 'dl' : m.dl
  const Footer = reducedMotion ? 'div' : m.div
  const childProps = reducedMotion ? {} : { variants: bodyEntryMotion }

  return (
    <PitbullDossierSection
      id="inscripcion"
      className="pitbull-dossier__section--inscription pitbull-dossier__section--stack pitbull-inscription"
      hideHeader
      title={t('pages.pitbull.inscriptionTitle')}
      tone="ops"
    >
      {softLaunch ? (
        <LaunchRegistrationTeaser
          event={event ?? { title: 'Pitbull Classic 2026' }}
          onNavigate={onNavigate}
          variant="full"
          source="pitbull_page"
          className="launch-teaser--dossier"
          indexLabel={t('pages.pitbull.inscriptionIndex')}
          hideShare
          countdownLabel={t('pages.pitbull.promoSoonCountdown')}
          intro={{
            eyebrow: t('pages.pitbull.inscriptionEyebrow'),
            title: t('pages.pitbull.promoSoonTitle'),
            lead: t('pages.pitbull.promoSoonLead'),
          }}
        />
      ) : null}

      <div
        className={[
          'pitbull-inscription-shell',
          'pitbull-inscription-shell--compact',
          softLaunch ? 'pitbull-inscription-shell--soon' : '',
          comboLive ? 'pitbull-inscription-shell--combo' : '',
          hasActiveMembership ? 'pitbull-inscription-shell--affiliated' : '',
        ].filter(Boolean).join(' ')}
      >
        <PitbullInscriptionCounter
          capacityLive={capacityLive}
          registered={registered}
          slots={slots}
          softLaunch={softLaunch}
          statusLabel={statusLabel}
          statusTone={statusTone}
          t={t}
          variant="compact"
        />

        <Body className="pitbull-inscription-shell__body" {...bodyProps}>
          <Pricing
            className={[
              'pitbull-inscription-shell__pricing',
              comboLive ? 'pitbull-inscription-shell__pricing--combo' : '',
            ].filter(Boolean).join(' ')}
            aria-label={t('pages.pitbull.costsAria')}
            {...childProps}
          >
            {comboLive ? (
              <div className="pitbull-inscription-shell__price pitbull-inscription-shell__price--combo">
                <dt>{t('pages.pitbull.costCombo')}</dt>
                <dd>
                  <span className="pitbull-inscription-shell__combo-amount">
                    {money(comboOffer.price, locale)}
                  </span>
                </dd>
                <p className="pitbull-inscription-shell__combo-meta">
                  {comboEndsLabel ? (
                    <small>{t('pages.pitbull.costComboUntil', { date: comboEndsLabel })}</small>
                  ) : null}
                  {comboEndsLabel && comboSavings > 0 ? (
                    <span aria-hidden> · </span>
                  ) : null}
                  {comboSavings > 0 ? (
                    <span className="pitbull-inscription-shell__combo-hint">
                      {t('pages.pitbull.costComboSavings', { amount: money(comboSavings, locale) })}
                    </span>
                  ) : null}
                </p>
                <p className="pitbull-inscription-shell__desc pitbull-inscription-shell__desc--combo">
                  {canRegister
                    ? t('pages.pitbull.cardDescCombo')
                    : softLaunch
                      ? t('pages.pitbull.cardDescComingSoon')
                      : t('pages.pitbull.cardDescClosed')}
                </p>
              </div>
            ) : null}
            {hasActiveMembership ? (
              <div className="pitbull-inscription-shell__price pitbull-inscription-shell__price--meet-only">
                <dt>{t('pages.pitbull.costMeet')}</dt>
                <dd>{money(pricing.registration, locale)}</dd>
              </div>
            ) : (
              <div className="pitbull-inscription-shell__compare">
                <div className="pitbull-inscription-shell__price">
                  <dt>{t('pages.pitbull.costMembership')}</dt>
                  <dd>{money(pricing.membership, locale)}</dd>
                </div>
                <div className="pitbull-inscription-shell__price">
                  <dt>{t('pages.pitbull.costMeet')}</dt>
                  <dd>{money(pricing.registration, locale)}</dd>
                </div>
              </div>
            )}
          </Pricing>

          <Footer className="pitbull-inscription-shell__footer" {...childProps}>
            {!comboLive ? (
              <p className="pitbull-inscription-shell__desc">
                {hasActiveMembership
                  ? t('pages.pitbull.inscriptionActionOpen')
                  : canRegister
                    ? t('pages.pitbull.cardDescOpen')
                    : softLaunch
                      ? t('pages.pitbull.cardDescComingSoon')
                      : t('pages.pitbull.cardDescClosed')}
              </p>
            ) : null}

            <div className="pitbull-inscription-shell__actions">
              {canRegister ? (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary"
                    onClick={onRegister}
                  >
                    {comboLive ? t('pages.pitbull.registerCombo') : t('pages.pitbull.register')}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--secondary"
                    onClick={() => onNavigate(hasActiveMembership ? 'profile' : 'members')}
                  >
                    {hasActiveMembership
                      ? t('pages.pitbull.viewMyMembership')
                      : t('pages.pitbull.viewMembershipPlans')}
                  </button>
                </>
              ) : softLaunch ? (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary pitbull-inscription__cta--soon"
                    disabled
                  >
                    {t('pages.pitbull.ctaComingSoon')}
                  </button>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--secondary"
                    onClick={() => onNavigate(hasActiveMembership ? 'profile' : 'register')}
                  >
                    {hasActiveMembership
                      ? t('pages.pitbull.viewMyMembership')
                      : t('launchTeaser.createAccountCta')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary"
                    onClick={() => onNavigate(hasActiveMembership ? 'profile' : 'members')}
                  >
                    {hasActiveMembership ? t('pages.pitbull.viewMyMembership') : t('pages.pitbull.joinNow')}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--secondary"
                    onClick={() => onNavigate('rulebook')}
                  >
                    {t('pages.pitbull.viewRulebook')}
                  </button>
                </>
              )}
            </div>
          </Footer>
        </Body>
      </div>

      {!softLaunch && capacityLive ? (
        <PitbullRecentRegistrants
          capacityStatus={capacityStatus}
          locale={locale}
          recent={recent}
          t={t}
        />
      ) : null}
    </PitbullDossierSection>
  )
}

/** Catálogo editorial — dos lanes (modalidades / divisiones) con índice y stagger. */
function PitbullCategoriesSection({ pitbullClassic, onNavigate, t }) {
  const { reducedMotion } = useMotionConfig()
  const groups = [
    {
      id: 'modalities',
      hint: t('pages.pitbull.categoriesModalitiesHint'),
      label: t('pages.pitbull.categoriesModalities'),
      rows: pitbullClassic.categories,
    },
    {
      id: 'divisions',
      hint: t('pages.pitbull.categoriesDivisionsHint'),
      label: t('pages.pitbull.categoriesDivisions'),
      rows: pitbullClassic.divisions,
    },
  ]

  const listMotion = reducedMotion
    ? {}
    : {
        variants: staggerContainer,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: MOTION_VIEWPORT,
      }
  const itemMotion = reducedMotion ? {} : { variants: staggerItem }
  const ListTag = reducedMotion ? 'ol' : m.ol
  const ItemTag = reducedMotion ? 'li' : m.li

  return (
    <PitbullDossierSection
      id="categorias"
      className="pitbull-dossier__section--categories"
      eyebrow={t('pages.pitbull.categoriesEyebrow')}
      index={t('pages.pitbull.categoriesIndex')}
      lead={t('pages.pitbull.categoriesDesc')}
      title={t('pages.pitbull.categoriesTitle')}
      titleId="pitbull-categories-title"
    >
      <div className="pitbull-cat">
        <div className="pitbull-cat__meta">
          <span className="pitbull-cat__status">
            <FileText size={14} aria-hidden />
            {t('pages.pitbull.categoriesPendingLabel')}
          </span>
          <p className="pitbull-cat__totals">
            {t('pages.pitbull.categoriesTotals', {
              modalities: pitbullClassic.categories.length,
              divisions: pitbullClassic.divisions.length,
            })}
          </p>
          <button
            type="button"
            className="pitbull-cat__rulebook motion-icon-shift motif-tap-target"
            onClick={() => onNavigate('rulebook')}
          >
            {t('pages.pitbull.viewFullRulebook')}
            <ArrowRight size={13} aria-hidden className="motion-icon-shift__target" />
          </button>
        </div>

        <div className="pitbull-cat__lanes" aria-label={t('pages.pitbull.categoriesListAria')}>
          {groups.map((group, groupIndex) => (
            <section
              key={group.id}
              className={`pitbull-cat__lane pitbull-cat__lane--${group.id}`}
              aria-labelledby={`pitbull-cat-${group.id}`}
            >
              <header className="pitbull-cat__lane-head">
                <span className="pitbull-cat__lane-index motif-num" aria-hidden>
                  {String(groupIndex + 1).padStart(2, '0')}
                </span>
                <div className="pitbull-cat__lane-copy">
                  <p className="pitbull-cat__lane-hint">{group.hint}</p>
                  <h3 id={`pitbull-cat-${group.id}`} className="pitbull-cat__lane-title">
                    {group.label}
                  </h3>
                </div>
                <span className="pitbull-cat__lane-count">
                  {t('pages.pitbull.categoriesGroupCount', { count: group.rows.length })}
                </span>
              </header>

              <ListTag className="pitbull-cat__list" {...listMotion}>
                {group.rows.map((row, rowIndex) => (
                  <ItemTag key={row} className="pitbull-cat__row" {...itemMotion}>
                    <span className="pitbull-cat__row-index motif-num" aria-hidden>
                      {String(rowIndex + 1).padStart(2, '0')}
                    </span>
                    <span className="pitbull-cat__row-name">{row}</span>
                  </ItemTag>
                ))}
              </ListTag>
            </section>
          ))}
        </div>
      </div>
    </PitbullDossierSection>
  )
}

export default function PitbullPage({
  onNavigate,
  onSelectEvent,
  events = UPCOMING_EVENTS,
  session = null,
  memberships = [],
}) {
  const {
    PITBULL_CLASSIC,
    PITBULL_VENUE,
  } = useContent()
  const { locale, t } = useI18n()

  // Esta es una pagina de un torneo concreto. `featured` controla la portada,
  // no la identidad de Pitbull: usarlo aca hizo que un evento de prueba a $2
  // contaminara precios, estado, cupo y links de esta pantalla.
  const pitbullEvent =
    getPitbullClassicEvent(events) ?? getPitbullClassicEvent(UPCOMING_EVENTS)
  const pitbullMapEvent = {
    ...pitbullEvent,
    date: pitbullEvent?.displayDate ?? PITBULL_CLASSIC.dateShort,
    featured: true,
    slug: pitbullEvent?.slug ?? 'pitbull-classic-2026',
    status: pitbullEvent?.status ?? 'proximamente',
    title: pitbullEvent?.title ?? PITBULL_CLASSIC.title,
  }
  const eventStatus = pitbullEvent?.status ?? 'proximamente'
  const paidCheckoutOpen = isPaidCheckoutOpen(pitbullEvent, env)
  const checkoutLocked = !paidCheckoutOpen
  const hasActiveMembership = session?.role === 'athlete_plu'
    && hasCurrentMembership(memberships, session.athleteId)
  const canRegister = isRegistrationOpen(eventStatus) && paidCheckoutOpen
  const isFinished = eventStatus === 'finalizado'
  const eventPricing = resolveEventPricing(pitbullEvent)
  const liveComboOffer = hasActiveMembership ? null : resolveLiveComboOffer(pitbullEvent)
  const ticketsOpen = paidCheckoutOpen && eventPricing.ticketsEnabled !== false
  const eventSlug = pitbullEvent?.slug ?? 'pitbull-classic-2026'
  const {
    status: capacityStatus,
    registered: liveRegistered,
    slots: liveSlots,
    recent: recentRegistrants,
  } = useEventRegistrationCapacity(eventSlug, {
    enabled: true,
    observeRoot: 'inscripcion',
    // Nunca inventar inscritos: el seed (48) distorsiona soft-launch.
    fallbackRegistered: 0,
    fallbackSlots: pitbullEvent?.slots ?? PITBULL_CLASSIC.slots ?? 180,
  })
  const sectionNavItems = [
    { id: 'inscripcion', index: '01', label: t('pages.pitbull.inscriptionEyebrow') },
    { id: 'experiencia', index: '02', label: t('pages.pitbull.experienceEyebrow') },
    { id: 'pesajes', index: '03', label: t('pages.pitbull.weighInsEyebrow') },
    { id: 'categorias', index: '04', label: t('pages.pitbull.categoriesEyebrow') },
    { id: 'lugar', index: '05', label: t('pages.pitbull.locationEyebrow') },
    { id: 'entradas', index: '06', label: t('pages.pitbull.ticketsEyebrow') },
  ]

  function goToTicketsPage() {
    onNavigate('tickets', { eventSlug: pitbullEvent?.slug })
  }

  function handleHeroRegister() {
    if (canRegister) {
      if (onSelectEvent) onSelectEvent(pitbullEvent)
      else onNavigate('competition')
      return
    }
    if (isFinished) {
      onNavigate('results')
      return
    }
    // Cobros cerrados (kill switch / schedule) o evento marcado "próximamente":
    // no empujar a un Members que igual está gateado, quedarse en el aviso.
    if (checkoutLocked || eventStatus === 'proximamente') {
      scrollToSection('inscripcion')
      return
    }
    onNavigate('members')
  }

  function handlePitbullRegistration() {
    if (onSelectEvent) onSelectEvent(pitbullEvent)
    else onNavigate('competition')
  }

  function handleHeroSecondary() {
    if (ticketsOpen) {
      goToTicketsPage()
      return
    }
    scrollToSection('categorias')
  }

  return (
    <main className="page page--design pitbull-page pitbull-page--premium">
      <PitbullHero
        canRegister={canRegister}
        checkoutLocked={checkoutLocked}
        eventStatus={eventStatus}
        onHome={() => onNavigate('home')}
        onRegister={handleHeroRegister}
        onSecondary={handleHeroSecondary}
        registrationFee={money(eventPricing.registration, locale)}
        ticketsOpen={ticketsOpen}
        title={PITBULL_CLASSIC.title}
      />

      <PitbullSectionNav items={sectionNavItems} t={t} />

      <div className="pitbull-page__body">
        <div className="pitbull-dossier pitbull-dossier--minimal">
          <PitbullInscriptionSection
            canRegister={canRegister}
            capacityStatus={capacityStatus}
            checkoutLocked={checkoutLocked}
            comboOffer={liveComboOffer}
            event={pitbullEvent}
            eventStatus={eventStatus}
            hasActiveMembership={hasActiveMembership}
            locale={locale}
            onNavigate={onNavigate}
            onRegister={handlePitbullRegistration}
            pricing={eventPricing}
            recent={recentRegistrants}
            registered={liveRegistered}
            slots={liveSlots}
            t={t}
          />

          <PitbullExperienceSection t={t} />
          
          <PitbullWeighInSnapshot />

          <PitbullCategoriesSection
            pitbullClassic={PITBULL_CLASSIC}
            onNavigate={onNavigate}
            t={t}
          />

          <PitbullLocationSection
            event={pitbullMapEvent}
            venue={PITBULL_VENUE}
            t={t}
          />

          {ticketsOpen ? (
            <Reveal as="div" direction="up" className="pitbull-tickets-band-wrap">
              <PitbullTicketsBand onOpen={goToTicketsPage} t={t} />
            </Reveal>
          ) : (
            <Reveal
              as="section"
              direction="up"
              id="entradas"
              className="pitbull-dossier__section pitbull-tickets pitbull-tickets--closed"
              aria-live="polite"
            >
              <p className="pitbull-tickets__closed-note">{t('pages.pitbull.ticketsClosed')}</p>
            </Reveal>
          )}
        </div>
      </div>

      <CTASection
        title={t('pages.pitbull.ctaFirstTimeTitle')}
        description={t('pages.pitbull.ctaFirstTimeDesc')}
        primaryLabel={t('pages.pitbull.ctaCreateProfile')}
        onPrimary={() => onNavigate('register')}
        secondaryLabel={t('pages.pitbull.ctaViewMembership')}
        onSecondary={() => onNavigate('members')}
      />
    </main>
  )
}
