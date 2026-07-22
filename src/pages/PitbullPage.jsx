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
import SegmentedSwitch from '../components/ui/SegmentedSwitch.jsx'
import { useContent } from '../hooks/useContent.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'
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


function getStepAction(id, { onNavigate, t }) {
  switch (id) {
    case 'membership':
      return { label: t('pages.pitbull.viewMembershipPlans'), onClick: () => onNavigate('members') }
    case 'category':
      return { label: t('pages.pitbull.athletesRulebook'), onClick: () => onNavigate('rulebook') }
    case 'confirmation':
      return { label: t('pages.pitbull.athletesCta'), onClick: scrollToInscription }
    case 'results':
      return { label: t('pages.home.viewResults'), onClick: () => onNavigate('results') }
    default:
      return null
  }
}

/** Escenario visual del paso activo — recurso real cuando existe (foto del
 * día de competencia), composición geométrica conceptual cuando no (credencial,
 * clasificación, confirmación). Nunca datos, marcas ni resultados inventados. */
function PitbullStepStage({ step, t }) {
  const { PITBULL_CLASSIC } = useContent()

  if (step.id === 'weighin' || step.id === 'results') {
    const StageIcon = step.id === 'weighin' ? Scale : Trophy
    return (
      <div className="pitbull-stepper__stage-photo">
        <span className="pitbull-stepper__stage-plate motif-plate" aria-hidden />
        <img
          className="pitbull-stepper__stage-img"
          src={photoMeetFloor}
          alt=""
          width={1600}
          height={1067}
          loading="lazy"
          decoding="async"
        />
        <span className="pitbull-stepper__stage-glare" aria-hidden />
        <span className="pitbull-stepper__stage-badge" aria-hidden>
          <StageIcon size={15} strokeWidth={1.85} />
        </span>
        <span className="pitbull-stepper__stage-caption">{t('pages.pitbull.athletesVisualAlt')}</span>
      </div>
    )
  }

  if (step.id === 'category') {
    return (
      <div className="pitbull-stepper__stage-abstract">
        <span className="pitbull-stepper__stage-rule motif-rule" aria-hidden />
        <p className="pitbull-stepper__stage-hint">{t('pages.pitbull.quickFactsModalities')}</p>
        <ol className="pitbull-stepper__stage-list">
          {PITBULL_CLASSIC.categories.map((cat, i) => (
            <li key={cat}>
              <span className="pitbull-stepper__stage-list-num motif-num" aria-hidden>
                {String(i + 1).padStart(2, '0')}
              </span>
              {cat}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  if (step.id === 'confirmation') {
    return (
      <div className="pitbull-stepper__stage-abstract pitbull-stepper__stage-abstract--confirm">
        <span className="pitbull-stepper__stage-check" aria-hidden>
          <CheckCircle2 size={28} strokeWidth={1.5} />
        </span>
        <p className="pitbull-stepper__stage-hint">{step.text}</p>
      </div>
    )
  }

  return (
    <div className="pitbull-stepper__stage-abstract">
      <span className="pitbull-stepper__stage-rule motif-rule" aria-hidden />
      <p className="pitbull-stepper__stage-hint">{t('pages.pitbull.athletesLead')}</p>
      <dl className="pitbull-stepper__stage-facts">
        <div>
          <dt>{t('pages.pitbull.quickFactsDate')}</dt>
          <dd>{PITBULL_CLASSIC.date}</dd>
        </div>
        <div>
          <dt>{t('pages.pitbull.quickFactsVenue')}</dt>
          <dd>{PITBULL_CLASSIC.venue}</dd>
        </div>
      </dl>
    </div>
  )
}

/** Riel completo + panel activo — tablet/notebook/desktop (≥768px). El riel
 * siempre muestra los 5 pasos agrupados por fase y remata en "llegada a la
 * plataforma"; solo el panel de abajo (contenido + escenario) cambia con la
 * selección. Cruzar de "antes del meet" a "día de competencia" es el único
 * momento con una animación de transición dedicada (una vez por cruce). */
function PitbullStepper({ flatSteps, onNavigate, t }) {
  const { reducedMotion } = useMotionConfig()
  const [activeIndex, setActiveIndex] = useState(0)
  const [pulse, setPulse] = useState(false)
  const prevPhaseRef = useRef(flatSteps[0]?.phase)
  const total = flatSteps.length
  const activeStep = flatSteps[activeIndex]
  const activeAction = getStepAction(activeStep.id, { onNavigate, t })
  const StepIcon = ATHLETE_STEP_ICONS[activeStep.id]
  const progress = total > 1 ? activeIndex / (total - 1) : 0
  const indicatorPct = ((activeIndex + 0.5) / total) * 100
  const crossedToMeet = activeStep.phase === 'meet'

  useEffect(() => {
    if (prevPhaseRef.current === 'registration' && activeStep.phase === 'meet' && !reducedMotion) {
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 720)
      prevPhaseRef.current = activeStep.phase
      return () => clearTimeout(timer)
    }
    prevPhaseRef.current = activeStep.phase
    return undefined
  }, [activeStep.phase, reducedMotion])

  function selectIndex(next) {
    setActiveIndex(Math.max(0, Math.min(total - 1, next)))
  }

  function handleRailKeyDown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectIndex(activeIndex + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectIndex(activeIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectIndex(total - 1)
    }
  }

  const railNodeMotion = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out } },
  }
  const railGroupMotion = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
  }
  const railTrackMotion = {
    hidden: { scaleX: 0 },
    show: { scaleX: 1, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out } },
  }

  return (
    <div className="pitbull-stepper">
      <div className="pitbull-stepper__phases" aria-hidden>
        <span className={`pitbull-stepper__phase-tag${crossedToMeet ? ' is-past' : ''}`}>
          {flatSteps[0]?.phaseLabel}
        </span>
        <span
          className={`pitbull-stepper__phase-tag pitbull-stepper__phase-tag--meet${crossedToMeet ? ' is-active' : ''}`}
        >
          {flatSteps[flatSteps.length - 1]?.phaseLabel}
        </span>
      </div>

      <m.div
        className="pitbull-stepper__rail"
        role="group"
        aria-label={t('pages.pitbull.athletesAria')}
        onKeyDown={handleRailKeyDown}
        variants={reducedMotion ? undefined : railGroupMotion}
        initial={reducedMotion ? undefined : 'hidden'}
        whileInView={reducedMotion ? undefined : 'show'}
        viewport={MOTION_VIEWPORT}
      >
        <div className="pitbull-stepper__rail-track-wrap">
          {reducedMotion ? (
            <span className="pitbull-stepper__rail-track" aria-hidden />
          ) : (
            <m.span className="pitbull-stepper__rail-track" aria-hidden variants={railTrackMotion} />
          )}
          <span className={`pitbull-stepper__rail-ticks${crossedToMeet ? ' is-visible' : ''}`} aria-hidden />
          <span className="pitbull-stepper__rail-fill" aria-hidden style={{ '--progress': progress }} />
          <span
            className={`pitbull-stepper__rail-gate${crossedToMeet ? ' pitbull-stepper__rail-gate--lit' : ''}`}
            aria-hidden
          />
          {pulse ? <span className="pitbull-stepper__phase-pulse" aria-hidden /> : null}
          <m.span
            className="pitbull-stepper__rail-indicator"
            aria-hidden
            animate={{ left: `${indicatorPct}%` }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.32, ease: MOTION_EASE.out }}
          />
          {flatSteps.map((step, index) => {
            const isActive = index === activeIndex
            const isDone = index <= activeIndex
            const node = (
              <button
                type="button"
                className={`pitbull-stepper__node pitbull-stepper__node--${step.phase}${isActive ? ' pitbull-stepper__node--active' : ''}${isDone ? ' pitbull-stepper__node--done' : ''}${pulse ? ' pitbull-stepper__node--morph' : ''}`}
                aria-current={isActive ? 'step' : undefined}
                onClick={() => selectIndex(index)}
              >
                <span className="pitbull-stepper__node-ord motif-num" aria-hidden>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="pitbull-stepper__node-dot" aria-hidden />
                <span className="pitbull-stepper__node-label">{step.title}</span>
              </button>
            )
            return reducedMotion ? (
              <span key={step.id} className="pitbull-stepper__node-slot">
                {node}
              </span>
            ) : (
              <m.span key={step.id} className="pitbull-stepper__node-slot" variants={railNodeMotion}>
                {node}
              </m.span>
            )
          })}
        </div>

        {reducedMotion ? (
          <span className="pitbull-stepper__arrival" aria-hidden>
            <span className="pitbull-stepper__arrival-marker">
              <Trophy size={14} strokeWidth={1.85} />
            </span>
            <span className="pitbull-stepper__arrival-label">{t('pages.pitbull.athletesArrival')}</span>
          </span>
        ) : (
          <m.span className="pitbull-stepper__arrival" aria-hidden variants={railNodeMotion}>
            <span className="pitbull-stepper__arrival-marker">
              <Trophy size={14} strokeWidth={1.85} />
            </span>
            <span className="pitbull-stepper__arrival-label">{t('pages.pitbull.athletesArrival')}</span>
          </m.span>
        )}
      </m.div>

      <div className="pitbull-stepper__lower">
        <div className="pitbull-stepper__detail" aria-live="polite">
          <MotionContentSwap swapKey={activeStep.id} className="pitbull-stepper__detail-inner">
            <span className={`pitbull-stepper__detail-phase pitbull-stepper__detail-phase--${activeStep.phase}`}>
              {activeStep.phaseLabel}
            </span>
            <h3 className="pitbull-stepper__detail-title">
              {StepIcon ? <StepIcon size={17} aria-hidden className="pitbull-stepper__detail-icon" /> : null}
              {activeStep.title}
            </h3>
            <p className="pitbull-stepper__detail-text">{activeStep.text}</p>
            <p className="pitbull-stepper__detail-meta">
              {t('pages.pitbull.stepperStepOf', { current: activeIndex + 1, total })}
            </p>
            {activeAction ? (
              <button
                type="button"
                className="pitbull-stepper__detail-action motion-icon-shift motif-tap-target"
                onClick={activeAction.onClick}
              >
                {activeAction.label}
                <ArrowRight size={13} aria-hidden className="motion-icon-shift__target" />
              </button>
            ) : null}
          </MotionContentSwap>
        </div>

        <MotionContentSwap swapKey={activeStep.id} className="pitbull-stepper__stage">
          <PitbullStepStage step={activeStep} t={t} />
        </MotionContentSwap>
      </div>
    </div>
  )
}

/** Timeline vertical compacta — mobile (<768px). Un solo recorrido continuo
 * (sin selección, sin escenario) que integra "llegada a la plataforma" como
 * cierre de la misma línea, no como bloque aparte. */
function PitbullJourneyTimeline({ numberedGroups, t }) {
  const { reducedMotion } = useMotionConfig()

  const timelineEntries = []
  numberedGroups.forEach((group) => {
    timelineEntries.push({ type: 'divider', key: `divider-${group.id}`, label: group.label, phase: group.id })
    group.items.forEach((item) => {
      timelineEntries.push({ type: 'step', key: item.id, item, phase: group.id })
    })
  })
  timelineEntries.push({ type: 'arrival', key: 'arrival' })

  const groupMotion = {
    hidden: {},
    show: { transition: { staggerChildren: MOTION_STAGGER.step, delayChildren: MOTION_STAGGER.delayChildren } },
  }
  const lineMotion = {
    hidden: { scaleY: 0 },
    show: { scaleY: 1, transition: { duration: 0.6, ease: MOTION_EASE.out } },
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
      {reducedMotion ? (
        <span className="pitbull-journey__line" aria-hidden />
      ) : (
        <m.span className="pitbull-journey__line" aria-hidden variants={lineMotion} />
      )}
      <ol className="pitbull-journey__steps">
        {timelineEntries.map((entry) => {
          if (entry.type === 'divider') {
            return (
              <li key={entry.key} className="pitbull-journey__divider" data-phase={entry.phase}>
                <span className="pitbull-journey__divider-label">{entry.label}</span>
              </li>
            )
          }

          if (entry.type === 'arrival') {
            const body = (
              <>
                <span className="pitbull-journey__marker pitbull-journey__marker--arrival" aria-hidden>
                  <Trophy size={14} strokeWidth={1.85} />
                </span>
                <div className="pitbull-journey__copy">
                  <h4 className="pitbull-journey__title">{t('pages.pitbull.athletesArrival')}</h4>
                </div>
              </>
            )
            return reducedMotion ? (
              <li key={entry.key} className="pitbull-journey__step pitbull-journey__step--arrival">
                {body}
              </li>
            ) : (
              <m.li
                key={entry.key}
                className="pitbull-journey__step pitbull-journey__step--arrival"
                variants={entryMotion}
              >
                {body}
              </m.li>
            )
          }

          const { item, phase } = entry
          const num = String(item.index + 1).padStart(2, '0')
          const StepIcon = ATHLETE_STEP_ICONS[item.id]
          const body = (
            <>
              <span className="pitbull-journey__marker" aria-hidden>
                <span className="pitbull-journey__marker-num motif-num motif-num--solid">{num}</span>
              </span>
              <div className="pitbull-journey__copy">
                <h4 className="pitbull-journey__title">
                  {StepIcon ? <StepIcon size={14} aria-hidden className="pitbull-journey__title-icon" /> : null}
                  {item.title}
                </h4>
                <p className="pitbull-journey__text">{item.text}</p>
              </div>
            </>
          )

          return reducedMotion ? (
            <li key={entry.key} className="pitbull-journey__step" data-phase={phase}>
              {body}
            </li>
          ) : (
            <m.li key={entry.key} className="pitbull-journey__step" data-phase={phase} variants={entryMotion}>
              {body}
            </m.li>
          )
        })}
      </ol>
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

  const flatSteps = numberedGroups.flatMap((group) =>
    group.items.map((item) => ({ ...item, phase: group.id, phaseLabel: group.label })),
  )

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
      <div className="pitbull-stepper-wrap">
        <PitbullStepper flatSteps={flatSteps} onNavigate={onNavigate} t={t} />
        <PitbullJourneyTimeline numberedGroups={numberedGroups} t={t} />
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

/** Sistema operativo del meet — dos niveles: barra de estado (jornada +
 * fase activa + selector) y tablero principal (3 etapas reales fusionadas
 * con la planilla del día, un indicador que las recorre una vez al entrar
 * o al cambiar de jornada, y luces de jueces que confirman el cierre). */
function PitbullMeetSystem({ featureFacts, schedule, onNavigate, t }) {
  const { reducedMotion } = useMotionConfig()
  const [day, setDay] = useState(schedule?.[0]?.day)
  const [activeLane, setActiveLane] = useState(reducedMotion ? featureFacts.length - 1 : 0)
  const [lightsOn, setLightsOn] = useState(reducedMotion)
  const timersRef = useRef([])

  const activeDay = schedule.find((d) => d.day === day) ?? schedule[0]
  const dayOptions = schedule.map((d) => [d.day, `${d.day} · ${d.date}`, d.day])
  const laneCount = featureFacts.length

  useEffect(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    if (reducedMotion) {
      setActiveLane(laneCount - 1)
      setLightsOn(true)
      return undefined
    }

    setLightsOn(false)
    setActiveLane(0)
    for (let lane = 1; lane < laneCount; lane += 1) {
      timersRef.current.push(setTimeout(() => setActiveLane(lane), lane * MEET_SEQUENCE_STEP_MS))
    }
    timersRef.current.push(
      setTimeout(() => setLightsOn(true), laneCount * MEET_SEQUENCE_STEP_MS + 200),
    )

    return () => timersRef.current.forEach(clearTimeout)
  }, [day, laneCount, reducedMotion])

  function selectLane(index) {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    setActiveLane(index)
    setLightsOn(true)
  }

  if (!schedule?.length) return null

  return (
    <Reveal as="div" direction="up" className="pitbull-meet" aria-label={t('pages.pitbull.programAria')}>
      <header className="pitbull-meet__top">
        <div className="pitbull-meet__top-status">
          <span className={`motif-lights${lightsOn ? ' motif-lights--sequence' : ''}`} aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={`motif-lights__dot${lightsOn ? ' motif-lights__dot--on' : ''}`} />
            ))}
          </span>
          <div className="pitbull-meet__top-copy">
            <p className="pitbull-meet__top-day">
              {activeDay.day} <time>{activeDay.date}</time>
            </p>
            <p className="pitbull-meet__top-phase">
              {t('pages.pitbull.meetPhaseLabel')}: {featureFacts[activeLane]?.label}
              <span aria-hidden> · </span>
              {t('pages.pitbull.stepperStepOf', { current: activeLane + 1, total: laneCount })}
            </p>
          </div>
        </div>
        <SegmentedSwitch
          active={day}
          ariaLabel={t('pages.pitbull.programScheduleTitle')}
          className="pitbull-meet__switch segmented-switch--pitbull"
          onChange={setDay}
          options={dayOptions}
        />
      </header>

      <MotionContentSwap swapKey={day} className="pitbull-meet__pane">
        <ol className="pitbull-meet__lanes" aria-label={t('pages.pitbull.featureFactsAria')}>
          {featureFacts.map((fact, index) => {
            const Icon = FEATURE_FACT_ICONS[fact.label]
            const row = activeDay.items[index]
            const isActive = index === activeLane
            return (
              <li key={fact.label} className={`pitbull-meet__lane${isActive ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="pitbull-meet__lane-hit"
                  aria-current={isActive ? 'step' : undefined}
                  onClick={() => selectLane(index)}
                >
                  <span className="pitbull-meet__lane-num motif-num motif-num--solid" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="pitbull-meet__lane-copy">
                    <span className="pitbull-meet__lane-label">
                      {Icon ? (
                        <Icon size={14} strokeWidth={1.7} className="pitbull-meet__lane-icon" aria-hidden />
                      ) : null}
                      {fact.label}
                    </span>
                    <span className="pitbull-meet__lane-value">{fact.value}</span>
                    {row ? (
                      <span className="pitbull-meet__lane-row">
                        <span className="pitbull-meet__lane-time">{row.time}</span>
                        {row.label}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
          {reducedMotion ? null : (
            <m.span
              className="pitbull-meet__indicator"
              aria-hidden
              animate={{ left: `${(activeLane / laneCount) * 100 + 100 / (laneCount * 2)}%` }}
              transition={{ duration: 0.45, ease: MOTION_EASE.out }}
            />
          )}
        </ol>
      </MotionContentSwap>

      <footer className={`pitbull-meet__exit${lightsOn ? ' pitbull-meet__exit--in' : ''}`}>
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
              <StaggerGroup as="ol" className="pitbull-doc__rows" stagger={35} role="list">
                {rows.map((row, index) => (
                  <li key={row} className="pitbull-doc__row">
                    <span className="pitbull-doc__row-num motif-num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="pitbull-doc__row-label">{row}</span>
                  </li>
                ))}
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
