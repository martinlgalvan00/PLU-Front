import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Dumbbell,
  ExternalLink,
  FileText,
  IdCard,
  MapPin,
  MapPinned,
  Medal,
  Megaphone,
  Scale,
  ShieldCheck,
  Tags,
  Trophy,
  Users,
} from 'lucide-react'
import { m } from 'motion/react'
import photoMeetFloor from '../assets/DSC00346.jpg'
import PitbullHero from '../components/layout/PitbullHero.jsx'
import CTASection from '../components/ui/CTASection.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta, isRegistrationOpen } from '../lib/status.js'
import AnimatedNumber from '../motion/AnimatedNumber.tsx'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import StaggerGroup from '../motion/StaggerGroup.tsx'
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER, MOTION_VIEWPORT } from '../motion/tokens.ts'

const ATHLETE_STEP_ICONS = {
  membership: IdCard,
  category: Tags,
  confirmation: CheckCircle2,
  weighin: Scale,
  results: Trophy,
}

const FEATURE_FACT_ICONS = {
  Pesaje: Scale,
  Briefing: Megaphone,
  Plataforma: Dumbbell,
  'Weigh-in': Scale,
  Platform: Dumbbell,
}

const BENEFIT_ICONS = {
  record: Trophy,
  standard: ShieldCheck,
  ranking: Medal,
  community: Users,
}

/** Tarjeta premium reactiva compartida — numeral fantasma, ícono y luz que sigue el cursor */
function PitbullValueCard({ index, Icon, label, text }) {
  const num = String(index + 1).padStart(2, '0')
  return (
    <li className="pitbull-value-card" onPointerMove={handleReactivePointer}>
      <span className="pitbull-value-card__ghost" aria-hidden>
        {num}
      </span>
      {Icon ? (
        <span className="pitbull-value-card__icon" aria-hidden>
          <Icon size={19} strokeWidth={1.5} />
        </span>
      ) : null}
      <div className="pitbull-value-card__body">
        <h4 className="pitbull-value-card__label">{label}</h4>
        <p className="pitbull-value-card__text">{text}</p>
      </div>
    </li>
  )
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Luz reactiva compartida — setea la posición del cursor como % sobre el elemento */
function handleReactivePointer(event) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`)
}

function scrollToInscription() {
  scrollToSection('inscripcion')
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
    <Reveal
      as="section"
      direction="up"
      id={id}
      className={`pitbull-dossier__section${isOps ? ' pitbull-dossier__section--ops' : ''} ${className}`.trim()}
      aria-label={hideHeader ? title : undefined}
      aria-labelledby={hideHeader ? undefined : titleId}
    >
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
  )
}

function PitbullInscriptionCounter({ registered, slots, statusLabel, statusTone, t, variant = 'default' }) {
  const pct = slots > 0 ? Math.round((registered / slots) * 100) : 0
  const isCompact = variant === 'compact'

  return (
    <div
      className={`pitbull-inscription-counter${isCompact ? ' pitbull-inscription-counter--compact' : ''}`}
      role="meter"
      aria-label={t('pages.pitbull.inscriptionCounterAria', { registered, slots })}
      aria-valuenow={registered}
      aria-valuemin={0}
      aria-valuemax={slots}
    >
      <div className="pitbull-inscription-counter__row">
        <div className="pitbull-inscription-counter__stat">
          <AnimatedNumber className="pitbull-inscription-counter__value" value={registered} />
          <span className="pitbull-inscription-counter__of">/ {slots}</span>
          <span className="pitbull-inscription-counter__unit">cupos</span>
        </div>
        <span className={`pitbull-inscription-counter__badge pitbull-inscription-counter__badge--${statusTone}`}>
          <span className="pitbull-inscription-counter__badge-dot" aria-hidden />
          {statusLabel}
        </span>
      </div>
      <div className="pitbull-inscription-counter__bar" aria-hidden>
        <div
          className="pitbull-inscription-counter__fill"
          style={{ '--counter-pct': `${pct}%` }}
        />
      </div>
    </div>
  )
}


/** Foto del piso — solo desktop ancho; ancla atmosférica sin badges flotantes. */
function PitbullJourneyVisual({ t }) {
  return (
    <figure className="pitbull-journey-visual">
      <img
        className="pitbull-journey-visual__img"
        src={photoMeetFloor}
        alt=""
        width={1600}
        height={1067}
        loading="lazy"
        decoding="async"
      />
      <figcaption className="pitbull-journey-visual__caption">{t('pages.pitbull.athletesVisualAlt')}</figcaption>
    </figure>
  )
}

/** Recorrido en fases tipográficas (antes / día) — sin timeline circular ni
 * franja foto en mobile. En notebook las dos fases van en paralelo. */
function PitbullJourneyTimeline({ numberedGroups, t }) {
  const { reducedMotion } = useMotionConfig()

  const groupMotion = {
    hidden: {},
    show: { transition: { staggerChildren: MOTION_STAGGER.step, delayChildren: MOTION_STAGGER.delayChildren } },
  }
  const entryMotion = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out } },
  }

  return (
    <m.div
      className="pitbull-journey"
      aria-label={t('pages.pitbull.athletesAria')}
      variants={reducedMotion ? undefined : groupMotion}
      initial={reducedMotion ? undefined : 'hidden'}
      whileInView={reducedMotion ? undefined : 'show'}
      viewport={MOTION_VIEWPORT}
    >
      <div className="pitbull-journey__phases">
        {numberedGroups.map((group) => (
          <section
            key={group.id}
            className="pitbull-journey__phase"
            data-phase={group.id}
            aria-label={group.label}
          >
            <h3 className="pitbull-journey__phase-label">{group.label}</h3>
            <ol className="pitbull-journey__steps">
              {group.items.map((item) => {
                const num = String(item.index + 1).padStart(2, '0')
                const StepIcon = ATHLETE_STEP_ICONS[item.id]
                const body = (
                  <>
                    <span className="pitbull-journey__num motif-num" aria-hidden>
                      {num}
                    </span>
                    <div className="pitbull-journey__copy">
                      <h4 className="pitbull-journey__title">
                        {StepIcon ? (
                          <StepIcon size={14} aria-hidden className="pitbull-journey__title-icon" />
                        ) : null}
                        {item.title}
                      </h4>
                      <p className="pitbull-journey__text">{item.text}</p>
                    </div>
                  </>
                )

                return reducedMotion ? (
                  <li key={item.id} className="pitbull-journey__step" data-phase={group.id}>
                    {body}
                  </li>
                ) : (
                  <m.li
                    key={item.id}
                    className="pitbull-journey__step"
                    data-phase={group.id}
                    variants={entryMotion}
                  >
                    {body}
                  </m.li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>

      {reducedMotion ? (
        <p className="pitbull-journey__arrival">{t('pages.pitbull.athletesArrival')}</p>
      ) : (
        <m.p className="pitbull-journey__arrival" variants={entryMotion}>
          {t('pages.pitbull.athletesArrival')}
        </m.p>
      )}
    </m.div>
  )
}

function PitbullAthletesSection({ athleteGroups, benefits = [], onNavigate, t }) {
  const numberedGroups = (() => {
    let cursor = 0
    return athleteGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const index = cursor
        cursor += 1
        return { ...item, index }
      }),
    }))
  })()

  return (
    <PitbullDossierSection
      id="atletas"
      className="pitbull-dossier__section--athletes"
      eyebrow={t('pages.pitbull.athletesEyebrow')}
      index={t('pages.pitbull.athletesIndex')}
      lead={t('pages.pitbull.athletesLead')}
      title={t('pages.pitbull.athletesTitle')}
      titleId="pitbull-athletes-title"
    >
      <div className="pitbull-journey-layout">
        <PitbullJourneyTimeline numberedGroups={numberedGroups} t={t} />
        <PitbullJourneyVisual t={t} />
      </div>

      <div className="pitbull-dossier__actions pitbull-dossier__actions--athletes">
        <button
          type="button"
          className="pitbull-dossier__cta pitbull-dossier__cta--primary motion-icon-shift"
          onClick={scrollToInscription}
        >
          {t('pages.pitbull.athletesCta')}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
        <button
          type="button"
          className="pitbull-dossier__text-link pitbull-dossier__text-link--rulebook"
          onClick={() => onNavigate('rulebook')}
        >
          {t('pages.pitbull.athletesRulebook')}
        </button>
      </div>

      {benefits.length > 0 ? (
        <div className="pitbull-value-block">
          <header className="pitbull-value-block__head">
            <p className="pitbull-value-block__eyebrow">{t('pages.pitbull.benefitsEyebrow')}</p>
            <h3 className="pitbull-value-block__title">{t('pages.pitbull.benefitsTitle')}</h3>
            <p className="pitbull-value-block__lead">{t('pages.pitbull.benefitsLead')}</p>
          </header>
          <StaggerGroup
            as="ol"
            className="pitbull-value-grid"
            stagger={70}
            aria-label={t('pages.pitbull.benefitsAria')}
          >
            {benefits.map((benefit, index) => (
              <PitbullValueCard
                key={benefit.id}
                index={index}
                Icon={BENEFIT_ICONS[benefit.id]}
                label={benefit.title}
                text={benefit.text}
              />
            ))}
          </StaggerGroup>
        </div>
      ) : null}
    </PitbullDossierSection>
  )
}

const MEET_SEQUENCE_STEP_MS = 550

/** Programa del meet — jornada por tabs tipográficos + agenda del día.
 * La secuencia recorre las fases una vez; sin luces ni switch tipo control. */
function PitbullMeetSystem({ featureFacts, schedule, onNavigate, t }) {
  const { reducedMotion } = useMotionConfig()
  const [day, setDay] = useState(schedule?.[0]?.day)
  const [activeLane, setActiveLane] = useState(reducedMotion ? featureFacts.length - 1 : 0)
  const [sequenceDone, setSequenceDone] = useState(reducedMotion)
  const timersRef = useRef([])

  const activeDay = schedule.find((d) => d.day === day) ?? schedule[0]
  const laneCount = featureFacts.length

  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    if (reducedMotion) {
      setActiveLane(laneCount - 1)
      setSequenceDone(true)
      return undefined
    }

    setSequenceDone(false)
    setActiveLane(0)
    for (let lane = 1; lane < laneCount; lane += 1) {
      timersRef.current.push(setTimeout(() => setActiveLane(lane), lane * MEET_SEQUENCE_STEP_MS))
    }
    timersRef.current.push(
      setTimeout(() => setSequenceDone(true), laneCount * MEET_SEQUENCE_STEP_MS + 200),
    )

    return () => timersRef.current.forEach(clearTimeout)
  }, [day, laneCount, reducedMotion])

  function selectLane(index) {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setActiveLane(index)
    setSequenceDone(true)
  }

  if (!schedule?.length) return null

  return (
    <Reveal as="div" direction="up" className="pitbull-meet" aria-label={t('pages.pitbull.programAria')}>
      <header className="pitbull-meet__top">
        <div
          className="pitbull-meet__days"
          role="tablist"
          aria-label={t('pages.pitbull.programScheduleTitle')}
        >
          {schedule.map((entry) => {
            const isActive = entry.day === day
            return (
              <button
                key={entry.day}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`pitbull-meet__day${isActive ? ' is-active' : ''}`}
                onClick={() => setDay(entry.day)}
              >
                <span className="pitbull-meet__day-name">{entry.day}</span>
                <time className="pitbull-meet__day-date">{entry.date}</time>
              </button>
            )
          })}
        </div>
        <p className="pitbull-meet__phase" aria-live="polite">
          <span className="pitbull-meet__phase-label">{t('pages.pitbull.meetPhaseLabel')}</span>
          <span className="pitbull-meet__phase-value">{featureFacts[activeLane]?.label}</span>
        </p>
      </header>

      <MotionContentSwap swapKey={day} className="pitbull-meet__pane">
        <div className="pitbull-meet__lanes-wrap">
          <ol className="pitbull-meet__lanes" aria-label={t('pages.pitbull.featureFactsAria')}>
            {featureFacts.map((fact, index) => {
              const Icon = FEATURE_FACT_ICONS[fact.label]
              const row = activeDay.items[index]
              const isActive = index === activeLane
              const num = String(index + 1).padStart(2, '0')
              return (
                <li key={fact.label} className={`pitbull-meet__lane${isActive ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    className="pitbull-meet__lane-hit"
                    aria-current={isActive ? 'step' : undefined}
                    onClick={() => selectLane(index)}
                  >
                    <span className="pitbull-meet__lane-index motif-num" aria-hidden>
                      {num}
                    </span>
                    <span className="pitbull-meet__lane-copy">
                      <span className="pitbull-meet__lane-head">
                        {row ? <span className="pitbull-meet__lane-time">{row.time}</span> : null}
                        <span className="pitbull-meet__lane-label">
                          {Icon ? <Icon size={14} strokeWidth={1.75} aria-hidden /> : null}
                          {fact.label}
                        </span>
                      </span>
                      <span className="pitbull-meet__lane-value">{fact.value}</span>
                      {row ? <span className="pitbull-meet__lane-desc">{row.label}</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </MotionContentSwap>

      <footer className={`pitbull-meet__exit${sequenceDone ? ' pitbull-meet__exit--in' : ''}`}>
        <button
          type="button"
          className="pitbull-meet__exit-link motion-icon-shift motif-tap-target"
          onClick={() => onNavigate('results')}
        >
          {t('pages.home.viewResults')}
          <ArrowRight size={13} aria-hidden className="motion-icon-shift__target" />
        </button>
      </footer>
    </Reveal>
  )
}

function PitbullLocationSection({ venue, t }) {
  const [mapLoaded, setMapLoaded] = useState(false)

  return (
    <PitbullDossierSection
      id="lugar"
      className="pitbull-dossier__section--location"
      eyebrow={t('pages.pitbull.locationEyebrow')}
      index={t('pages.pitbull.locationIndex')}
      lead={t('pages.pitbull.locationLead')}
      title={t('pages.pitbull.locationTitle')}
      titleId="pitbull-location-title"
    >
      <div className="pitbull-location pitbull-location--editorial">
        <Reveal as="div" direction="up" className="pitbull-location__map-shell">
          <div
            className={`pitbull-location__map-placeholder${mapLoaded ? ' pitbull-location__map-placeholder--hidden' : ''}`}
            aria-hidden
          >
            <MapPinned size={22} aria-hidden />
            <span>{venue.name}</span>
          </div>
          <iframe
            className="pitbull-location__map"
            src={venue.mapsEmbedUrl}
            title={t('pages.pitbull.venueMapsTitle', { venue: venue.name })}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            tabIndex={-1}
            onLoad={() => setMapLoaded(true)}
          />
          <a
            href={venue.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pitbull-location__map-cta motion-icon-shift"
          >
            {t('pages.pitbull.locationMapsLink')}
            <ExternalLink size={13} aria-hidden className="motion-icon-shift__target" />
          </a>
        </Reveal>

        <Reveal as="div" direction="up" delay={80} className="pitbull-location__details">
          <p className="pitbull-location__kicker">
            <MapPin size={13} aria-hidden />
            {venue.address}
          </p>
          <p className="pitbull-location__note">{t('pages.pitbull.locationDirectionsNote')}</p>
        </Reveal>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullTicketPass({ onOpen, t }) {
  return (
    <div className="pitbull-ticket-pass pitbull-ticket-pass--cta">
      <div className="pitbull-ticket-pass__actions">
        <button type="button" className="pitbull-dossier__cta pitbull-ticket-pass__cta" onClick={onOpen}>
          {t('pages.pitbull.ticketsFormTitle')}
          <ArrowRight size={14} aria-hidden />
        </button>
      </div>
    </div>
  )
}

function PitbullInscriptionSection({
  canRegister,
  eventStatus,
  locale,
  onNavigate,
  pitbullClassic,
  pricing,
  t,
}) {
  const { label: statusLabel, tone: statusTone } = getStatusMeta(eventStatus, t)

  return (
    <PitbullDossierSection
      id="inscripcion"
      className="pitbull-dossier__section--inscription pitbull-dossier__section--stack pitbull-inscription"
      hideHeader
      title={t('pages.pitbull.inscriptionTitle')}
      tone="ops"
    >
      <div className="pitbull-inscription-shell pitbull-inscription-shell--compact">
        <PitbullInscriptionCounter
          registered={pitbullClassic.registered}
          slots={pitbullClassic.slots}
          statusLabel={statusLabel}
          statusTone={statusTone}
          t={t}
          variant="compact"
        />

        <div className="pitbull-inscription-shell__body">
          <dl className="pitbull-inscription-shell__pricing" aria-label={t('pages.pitbull.costsAria')}>
            <div className="pitbull-inscription-shell__price">
              <dt>{t('pages.pitbull.costMembership')}</dt>
              <dd>{money(pricing.membership, locale)}</dd>
            </div>
            <div className="pitbull-inscription-shell__price">
              <dt>{t('pages.pitbull.costMeet')}</dt>
              <dd>{money(pricing.registration, locale)}</dd>
            </div>
          </dl>

          <div className="pitbull-inscription-shell__footer">
            <p className="pitbull-inscription-shell__desc">
              {canRegister ? t('pages.pitbull.cardDescOpen') : t('pages.pitbull.cardDescClosed')}
            </p>

            <div className="pitbull-inscription-shell__actions">
              {canRegister ? (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary"
                    onClick={() => onNavigate('competition')}
                  >
                    {t('pages.pitbull.register')}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--secondary"
                    onClick={() => onNavigate('members')}
                  >
                    {t('pages.pitbull.viewMembershipPlans')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="pitbull-inscription__cta pitbull-inscription__cta--primary"
                    onClick={() => onNavigate('members')}
                  >
                    {t('pages.pitbull.joinNow')}
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
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

function PitbullFeatureSection({ featureFacts, schedule, onNavigate, onTickets, ticketsOpen, t }) {
  return (
    <PitbullDossierSection
      className="pitbull-dossier__section--feature"
      hideHeader
      title={t('pages.pitbull.featureTitle')}
    >
      {schedule?.length > 0 ? (
        <PitbullMeetSystem featureFacts={featureFacts} schedule={schedule} onNavigate={onNavigate} t={t} />
      ) : null}

      <div className="pitbull-dossier__actions pitbull-dossier__actions--feature">
        <button
          type="button"
          className="pitbull-dossier__cta motion-icon-shift"
          onClick={scrollToInscription}
        >
          {t('pages.pitbull.ctaInscription')}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
        {ticketsOpen ? (
          <button type="button" className="pitbull-dossier__text-link" onClick={onTickets}>
            {t('pages.pitbull.ticketsTitle')}
          </button>
        ) : (
          <button
            type="button"
            className="pitbull-dossier__text-link"
            onClick={() => onNavigate('rulebook')}
          >
            {t('pages.pitbull.ctaRulebook')}
          </button>
        )}
      </div>
    </PitbullDossierSection>
  )
}

/** Explorador documental — no un segmented control + chips flotando.
 * Nivel superior: estado documental + acceso al reglamento. Nivel
 * principal: columna de navegación (tabla de contenidos) + panel con
 * la lista técnica (filas, no chips) y su nota asociada. */
function PitbullCategoriesSection({ categoryCards, pitbullClassic, onNavigate, t }) {
  const [tab, setTab] = useState('modalities')
  const detailCards = categoryCards.filter((card) => card.id === 'weight' || card.id === 'gender')
  const detail =
    tab === 'modalities'
      ? detailCards.find((card) => card.id === 'weight')
      : detailCards.find((card) => card.id === 'gender')
  const rows = tab === 'modalities' ? pitbullClassic.categories : pitbullClassic.divisions
  const navItems = [
    { id: 'modalities', label: t('pages.pitbull.categoriesModalities') },
    { id: 'divisions', label: t('pages.pitbull.categoriesDivisions') },
  ]

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
      <div className="pitbull-doc">
        <div className="pitbull-doc__status">
          <span className="pitbull-doc__status-copy">
            <FileText size={14} aria-hidden />
            {t('pages.pitbull.categoriesPendingLabel')}
          </span>
          <button
            type="button"
            className="pitbull-doc__status-cta motion-icon-shift motif-tap-target"
            onClick={() => onNavigate('rulebook')}
          >
            {t('pages.pitbull.viewFullRulebook')}
            <ArrowRight size={13} aria-hidden className="motion-icon-shift__target" />
          </button>
        </div>

        <div className="pitbull-doc__body" aria-label={t('pages.pitbull.categoriesListAria')}>
          <div className="pitbull-doc__nav" role="tablist" aria-label={t('pages.pitbull.categoriesTabsAria')}>
            {navItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`pitbull-doc-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`pitbull-doc-panel-${item.id}`}
                className={`pitbull-doc__nav-item${tab === item.id ? ' is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="pitbull-doc__nav-num motif-num">{String(index + 1).padStart(2, '0')}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div
            className="pitbull-doc__panel-wrap"
            role="tabpanel"
            id={`pitbull-doc-panel-${tab}`}
            aria-labelledby={`pitbull-doc-tab-${tab}`}
          >
            <MotionContentSwap swapKey={tab} className="pitbull-doc__panel">
              <StaggerGroup as="ol" className="pitbull-doc__chips" stagger={35} role="list">
                {rows.map((row) => {
                  const ChipIcon = tab === 'modalities' ? Dumbbell : Users
                  return (
                    <li key={row} className="pitbull-doc__chip">
                      <ChipIcon size={15} strokeWidth={1.85} aria-hidden />
                      <span>{row}</span>
                    </li>
                  )
                })}
              </StaggerGroup>

              {detail ? (
                <div className="pitbull-doc__note">
                  <span className="pitbull-doc__note-label">{detail.title}</span>
                  <p className="pitbull-doc__note-text">{detail.text}</p>
                </div>
              ) : null}
            </MotionContentSwap>
          </div>
        </div>
      </div>
    </PitbullDossierSection>
  )
}

export default function PitbullPage({
  onNavigate,
  events = UPCOMING_EVENTS,
}) {
  const {
    PITBULL_ATHLETE_GROUPS,
    PITBULL_CATEGORY_CARDS,
    PITBULL_CLASSIC,
    PITBULL_SCHEDULE,
    PITBULL_VENUE,
  } = useContent()
  const { locale, messages, t } = useI18n()
  const featureFacts = messages.pages.pitbull.featureFacts ?? []
  const benefits = messages.pages.pitbull.benefits ?? []

  const pitbullEvent = events.find((event) => event.featured)
  const eventStatus = pitbullEvent?.status ?? 'proximamente'
  const canRegister = isRegistrationOpen(eventStatus)
  const isFinished = eventStatus === 'finalizado'
  const eventPricing = resolveEventPricing(pitbullEvent)
  const ticketsOpen = eventPricing.ticketsEnabled !== false

  function goToTicketsPage() {
    onNavigate('tickets', { eventSlug: pitbullEvent?.slug })
  }

  function handleHeroRegister() {
    if (canRegister) {
      onNavigate('competition')
      return
    }
    if (isFinished) {
      onNavigate('results')
      return
    }
    onNavigate('members')
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
        eventStatus={eventStatus}
        onHome={() => onNavigate('home')}
        onRegister={handleHeroRegister}
        onSecondary={handleHeroSecondary}
        pitbullClassic={PITBULL_CLASSIC}
        ticketsOpen={ticketsOpen}
        title={PITBULL_CLASSIC.title}
      />

      <div className="pitbull-page__body">
        <div className="pitbull-dossier pitbull-dossier--minimal">
          <PitbullAthletesSection
            athleteGroups={PITBULL_ATHLETE_GROUPS ?? []}
            benefits={benefits}
            onNavigate={onNavigate}
            t={t}
          />

          <PitbullFeatureSection
            featureFacts={featureFacts}
            schedule={PITBULL_SCHEDULE ?? []}
            onNavigate={onNavigate}
            onTickets={goToTicketsPage}
            ticketsOpen={ticketsOpen}
            t={t}
          />

          <PitbullCategoriesSection
            categoryCards={PITBULL_CATEGORY_CARDS}
            pitbullClassic={PITBULL_CLASSIC}
            onNavigate={onNavigate}
            t={t}
          />

          <PitbullLocationSection
            venue={PITBULL_VENUE}
            t={t}
          />

          <PitbullInscriptionSection
            canRegister={canRegister}
            eventStatus={eventStatus}
            locale={locale}
            onNavigate={onNavigate}
            pitbullClassic={PITBULL_CLASSIC}
            pricing={eventPricing}
            t={t}
          />

          {ticketsOpen ? (
            <PitbullDossierSection
              id="entradas"
              className="pitbull-dossier__section--tickets pitbull-tickets"
              eyebrow={t('pages.pitbull.ticketsEyebrow')}
              index={t('pages.pitbull.ticketsIndex')}
              lead={t('pages.pitbull.ticketsLead')}
              title={t('pages.pitbull.ticketsTitle')}
              titleId="pitbull-tickets-title"
            >
              <PitbullTicketPass onOpen={goToTicketsPage} t={t} />
            </PitbullDossierSection>
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
