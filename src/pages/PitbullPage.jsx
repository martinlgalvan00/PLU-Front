import { useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Dumbbell,
  ExternalLink,
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
import SegmentedSwitch from '../components/ui/SegmentedSwitch.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'
import AnimatedNumber from '../motion/AnimatedNumber.tsx'
import TiltCard from '../motion/TiltCard.tsx'
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


function PitbullAthletesSection({ athleteGroups, benefits = [], onNavigate, t }) {
  const { reducedMotion } = useMotionConfig()
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

  const phaseMotion = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: MOTION_STAGGER.step,
        delayChildren: MOTION_STAGGER.delayChildren,
      },
    },
  }

  const stepMotion = {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
    },
  }

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
      <div className="pitbull-athletes-layout">
        <div className="pitbull-athletes-layout__main">
          <m.div
            className="pitbull-athletes-journey"
            aria-label={t('pages.pitbull.athletesAria')}
            variants={reducedMotion ? undefined : phaseMotion}
            initial={reducedMotion ? undefined : 'hidden'}
            whileInView={reducedMotion ? undefined : 'show'}
            viewport={MOTION_VIEWPORT}
          >
            {numberedGroups.map((group, groupIndex) => (
              <section
                key={group.id}
                className={`pitbull-athletes-journey__phase pitbull-athletes-journey__phase--${group.id}`}
              >
                <h3 className="pitbull-athletes-journey__phase-label">
                  <span className="pitbull-athletes-journey__phase-index" aria-hidden>
                    {String(groupIndex + 1).padStart(2, '0')}
                  </span>
                  <span className="pitbull-athletes-journey__phase-dot" aria-hidden />
                  {group.label}
                </h3>
                <ol className="pitbull-athletes-journey__steps">
                  {group.items.map((item) => {
                    const num = String(item.index + 1).padStart(2, '0')
                    const StepIcon = ATHLETE_STEP_ICONS[item.id]
                    const body = (
                      <>
                        <span className="pitbull-athletes-journey__index" aria-hidden>
                          {num}
                        </span>
                        <div className="pitbull-athletes-journey__copy">
                          <span className="pitbull-athletes-journey__title">
                            {StepIcon ? (
                              <StepIcon size={14} aria-hidden className="pitbull-athletes-journey__title-icon" />
                            ) : null}
                            {item.title}
                          </span>
                          <p className="pitbull-athletes-journey__text">{item.text}</p>
                        </div>
                      </>
                    )

                    if (reducedMotion) {
                      return (
                        <li key={item.id} className="pitbull-athletes-journey__step">
                          {body}
                        </li>
                      )
                    }

                    return (
                      <m.li
                        key={item.id}
                        className="pitbull-athletes-journey__step"
                        variants={stepMotion}
                        whileHover={{ x: 3 }}
                        transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE.out }}
                      >
                        {body}
                      </m.li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </m.div>

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
        </div>

        <TiltCard
          className="pitbull-athletes-layout__visual pitbull-athletes-showcase"
          innerClassName="tilt-card__inner pitbull-athletes-showcase__inner"
          maxTilt={4}
        >
          <img
            className="pitbull-athletes-layout__img"
            src={photoMeetFloor}
            alt=""
            width={1600}
            height={1067}
            loading="lazy"
            decoding="async"
          />
          <span className="pitbull-athletes-showcase__glare" aria-hidden />
          <span className="pitbull-athletes-layout__caption">
            {t('pages.pitbull.athletesVisualAlt')}
          </span>
        </TiltCard>
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

function PitbullScheduleStrip({ schedule, t }) {
  if (!schedule?.length) return null

  return (
    <Reveal as="div" direction="up" delay={80} className="pitbull-program" aria-label={t('pages.pitbull.programAria')}>
      <header className="pitbull-program__intro">
        <span className="pitbull-program__eyebrow">{t('pages.pitbull.programScheduleEyebrow')}</span>
        <h3 className="pitbull-program__title">{t('pages.pitbull.programScheduleTitle')}</h3>
      </header>

      <div className="pitbull-program__matrix">
        <div className="pitbull-program__head" aria-hidden>
          <span className="pitbull-program__corner" />
          {schedule.map((day) => (
            <div key={day.day} className="pitbull-program__day-head">
              <span className="pitbull-program__day-name">{day.day}</span>
              <span className="pitbull-program__day-date">{day.date}</span>
            </div>
          ))}
        </div>

        <StaggerGroup as="div" className="pitbull-program__rows" stagger={55} direction="up">
          {schedule[0].items.map((slot, rowIndex) => (
            <div key={slot.time} className="pitbull-program__row">
              <span className="pitbull-program__time">{slot.time}</span>
              {schedule.map((day) => (
                <p key={`${day.day}-${slot.time}`} className="pitbull-program__cell">
                  {day.items[rowIndex]?.label}
                </p>
              ))}
            </div>
          ))}
        </StaggerGroup>
      </div>

      <div className="pitbull-program__stack">
        {schedule.map((day) => (
          <section key={day.day} className="pitbull-program__day-block">
            <header className="pitbull-program__day-block-head">
              <span className="pitbull-program__day-name">{day.day}</span>
              <span className="pitbull-program__day-date">{day.date}</span>
            </header>
            <ol className="pitbull-program__day-block-list">
              {day.items.map((slot) => (
                <li key={`${day.day}-${slot.time}`} className="pitbull-program__day-block-row">
                  <span className="pitbull-program__time">{slot.time}</span>
                  <p className="pitbull-program__cell">{slot.label}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
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
        <Reveal as="div" direction="scale" className="pitbull-location__map-shell">
          <div className={`pitbull-location__map-placeholder${mapLoaded ? ' pitbull-location__map-placeholder--hidden' : ''}`} aria-hidden>
            <MapPinned size={26} aria-hidden />
            <span>{venue.name}</span>
          </div>
          <iframe
            className="pitbull-location__map"
            src={venue.mapsEmbedUrl}
            title={t('pages.pitbull.venueMapsTitle', { venue: venue.name })}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            onLoad={() => setMapLoaded(true)}
          />
          <div className="pitbull-location__map-overlay" aria-hidden />
        </Reveal>

        <Reveal as="div" direction="up" delay={100} className="pitbull-location__details">
          <p className="pitbull-location__kicker">
            <MapPin size={13} aria-hidden />
            {venue.address}
          </p>

          <p className="pitbull-location__note">
            {t('pages.pitbull.locationDirectionsNote')}
          </p>

          <a
            href={venue.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pitbull-location__maps-link pitbull-location__maps-link--primary motion-icon-shift"
          >
            {t('pages.pitbull.locationMapsLink')}
            <ExternalLink size={14} aria-hidden className="motion-icon-shift__target" />
          </a>
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
      <div
        className="pitbull-inscription-shell pitbull-inscription-shell--compact"
        onPointerMove={handleReactivePointer}
      >
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
      eyebrow={t('pages.pitbull.featureEyebrow')}
      index={t('pages.pitbull.featureIndex')}
      lead={t('pages.pitbull.featureLead')}
      title={t('pages.pitbull.featureTitle')}
      titleId="pitbull-feature-title"
    >
      <div className="pitbull-feature-stage">
        <StaggerGroup
          as="ol"
          className="pitbull-feature-flow"
          stagger={70}
          aria-label={t('pages.pitbull.featureFactsAria')}
        >
          {featureFacts.map((fact, index) => {
            const Icon = FEATURE_FACT_ICONS[fact.label]
            const num = String(index + 1).padStart(2, '0')
            return (
              <li key={fact.label} className="pitbull-feature-flow__step">
                <span className="pitbull-feature-flow__num" aria-hidden>
                  {num}
                </span>
                <div className="pitbull-feature-flow__copy">
                  <span className="pitbull-feature-flow__label">
                    {Icon ? (
                      <Icon size={16} strokeWidth={1.6} className="pitbull-feature-flow__icon" aria-hidden />
                    ) : null}
                    {fact.label}
                  </span>
                  <p className="pitbull-feature-flow__detail">{fact.value}</p>
                </div>
              </li>
            )
          })}
        </StaggerGroup>

        {schedule?.length > 0 ? (
          <PitbullScheduleStrip schedule={schedule} t={t} />
        ) : null}
      </div>

      <div className="pitbull-dossier__actions pitbull-dossier__actions--feature">
        <button
          type="button"
          className="pitbull-dossier__cta pitbull-dossier__cta--primary motion-icon-shift"
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

function PitbullCategoriesSection({ categoryCards, pitbullClassic, onNavigate, t }) {
  const [tab, setTab] = useState('modalities')
  const detailCards = categoryCards.filter((card) => card.id === 'weight' || card.id === 'gender')
  const detail =
    tab === 'modalities'
      ? detailCards.find((card) => card.id === 'weight')
      : detailCards.find((card) => card.id === 'gender')
  const chips = tab === 'modalities' ? pitbullClassic.categories : pitbullClassic.divisions
  const chipModifier = tab === 'modalities' ? 'modality' : 'division'
  const tabOptions = [
    ['modalities', t('pages.pitbull.categoriesModalities')],
    ['divisions', t('pages.pitbull.categoriesDivisions')],
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
      <div className="pitbull-categories-explorer" aria-label={t('pages.pitbull.categoriesListAria')}>
        <SegmentedSwitch
          active={tab}
          ariaLabel={t('pages.pitbull.categoriesTabsAria')}
          className="pitbull-categories-explorer__switch segmented-switch--pitbull"
          onChange={setTab}
          options={tabOptions}
        />

        <MotionContentSwap swapKey={tab} className="pitbull-categories-explorer__pane">
          <StaggerGroup
            as="ul"
            className="pitbull-categories-chips"
            stagger={40}
            role="list"
          >
            {chips.map((chip) => (
              <li
                key={chip}
                className={`pitbull-categories-chips__item pitbull-categories-chips__item--${chipModifier}`}
                onPointerMove={handleReactivePointer}
              >
                {chip}
              </li>
            ))}
          </StaggerGroup>
        </MotionContentSwap>

        {detail ? (
          <MotionContentSwap swapKey={`detail-${tab}`} className="pitbull-categories-explorer__detail">
            <div className="pitbull-categories-detail pitbull-categories-detail--solo">
              <span className="pitbull-categories-detail__label">{detail.title}</span>
              <p className="pitbull-categories-detail__text">{detail.text}</p>
            </div>
          </MotionContentSwap>
        ) : null}
      </div>

      <footer className="pitbull-categories-foot">
        <button
          type="button"
          className="pitbull-dossier__text-link pitbull-dossier__text-link--rulebook"
          onClick={() => onNavigate('rulebook')}
        >
          {t('pages.pitbull.viewFullRulebook')}
          <ArrowRight size={14} aria-hidden />
        </button>
      </footer>
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
  const canRegister = eventStatus === 'inscripcion_abierta' || eventStatus === 'cupos_limitados'
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
