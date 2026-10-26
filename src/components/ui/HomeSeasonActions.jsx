import { ArrowRight } from 'lucide-react'
import { m } from 'motion/react'
import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { hasFinePointer } from '../../motion/useReducedMotion.ts'
import {
  MOTION_DISTANCE,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER_BY_TIER,
  scaleDuration,
} from '../../motion/tokens.ts'

const ART = 'America/Argentina/Buenos_Aires'

function eventStartDate(event) {
  const raw = event?.startsAt ?? event?.dateISO ?? event?.startDate
  if (!raw) return null
  const date = new Date(String(raw).includes('T') ? raw : `${raw}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function eventEndDate(event) {
  const raw = event?.endsAt
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Fecha editorial compacta para el carril: día(s) + mes + año. */
function formatSeasonDateParts(event, locale) {
  const start = eventStartDate(event)
  if (!start) return null

  const tag = locale === 'en' ? 'en-US' : 'es-AR'
  const dayOpts = { day: 'numeric', timeZone: ART }
  const monthOpts = { month: 'short', timeZone: ART }
  const yearOpts = { year: 'numeric', timeZone: ART }

  const startDay = start.toLocaleDateString(tag, dayOpts)
  const month = start.toLocaleDateString(tag, monthOpts).replace(/\.$/, '').toUpperCase()
  const year = start.toLocaleDateString(tag, yearOpts)

  const end = eventEndDate(event)
  let day = startDay
  if (end) {
    const sameMonth =
      start.toLocaleDateString(tag, { month: 'numeric', year: 'numeric', timeZone: ART }) ===
      end.toLocaleDateString(tag, { month: 'numeric', year: 'numeric', timeZone: ART })
    if (sameMonth) {
      const endDay = end.toLocaleDateString(tag, dayOpts)
      if (endDay !== startDay) day = `${startDay}–${endDay}`
    }
  }

  return { day, month, year }
}

function laneCopy(kind, title, t) {
  switch (kind) {
    case 'tickets':
      return {
        status: t('hero.statusTicketsOpen'),
        cue: t('hero.seasonTicketsCue'),
        aria: t('hero.seasonTicketsAria', { event: title }),
      }
    case 'registration':
      return {
        status: t('hero.statusRegistrationOpen'),
        cue: t('hero.seasonRegisterCue'),
        aria: t('hero.seasonRegisterAria', { event: title }),
      }
    case 'registration_soon':
      return {
        status: t('hero.seasonRegisterSoonStatus'),
        cue: t('hero.seasonRegisterSoonCue'),
        aria: t('hero.seasonRegisterSoonAria', { event: title }),
      }
    default: {
      const _exhaustive = kind
      void _exhaustive
      return {
        status: t('hero.seasonRegisterSoonStatus'),
        cue: t('hero.seasonRegisterSoonCue'),
        aria: t('hero.seasonRegisterSoonAria', { event: title }),
      }
    }
  }
}

function LaneCue({ cue, decorative = false, motionProps = null }) {
  const Tag = motionProps ? m.span : 'span'
  return (
    <Tag className="home-season-actions__go" aria-hidden={decorative || undefined} {...(motionProps ?? {})}>
      <span className="home-season-actions__cue">{cue}</span>
      <ArrowRight size={13} strokeWidth={1.75} className="home-season-actions__arrow" />
    </Tag>
  )
}

function formatLocality(location) {
  return String(location ?? '')
    .trim()
    .replace(/\s*\/\s*/g, ' · ')
}

function LanePlace({ venue, location, motionProps = null }) {
  const locality = formatLocality(location)
  if (!venue && !locality) return null

  const Tag = motionProps ? m.span : 'span'
  return (
    <Tag className="home-season-actions__place" {...(motionProps ?? {})}>
      {venue ? <span className="home-season-actions__venue">{venue}</span> : null}
      {locality ? <span className="home-season-actions__locality">{locality}</span> : null}
    </Tag>
  )
}

function RevealLine({ motionProps = null, className, children, ...rest }) {
  if (!motionProps) {
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    )
  }
  return (
    <m.span className={className} {...motionProps} {...rest}>
      {children}
    </m.span>
  )
}

function LaneBody({ dateParts, copy, title, venue, location, cue, lineMotion }) {
  const at = (slot, clip = false) => lineMotion?.(slot, clip) ?? null
  return (
    <span className="home-season-actions__body">
      {dateParts ? (
        <RevealLine className="home-season-actions__date" motionProps={at(0, true)} aria-hidden>
          <span className="home-season-actions__day">{dateParts.day}</span>
          <span className="home-season-actions__month">{dateParts.month}</span>
          <span className="home-season-actions__year">{dateParts.year}</span>
        </RevealLine>
      ) : null}

      <span className="home-season-actions__copy">
        {cue ? <LaneCue cue={cue} decorative motionProps={at(4)} /> : null}
        <RevealLine className="home-season-actions__meet" motionProps={at(1, true)}>
          {title}
        </RevealLine>
        <LanePlace venue={venue} location={location} motionProps={at(2)} />
        <RevealLine className="home-season-actions__status" motionProps={at(3)}>
          {copy.status}
        </RevealLine>
      </span>
    </span>
  )
}

function SeasonLane({ action, onActivate, t, locale, lineMotion = null }) {
  const { kind, event } = action
  const dateParts = formatSeasonDateParts(event, locale)
  const title =
    event?.title ??
    (kind === 'tickets' ? t('hero.seasonTicketsFallback') : t('hero.seasonRegisterFallback'))
  const copy = laneCopy(kind, title, t)
  const body = (
    <LaneBody
      dateParts={dateParts}
      copy={copy}
      title={title}
      venue={event?.venue}
      location={event?.location}
      cue={kind === 'registration' ? null : copy.cue}
      lineMotion={lineMotion}
    />
  )

  // Inscripción abierta: dos destinos. La página oficial (o el aviso de
  // "en construcción" si todavía no se publicó) y el formulario directo; así
  // la venta no espera a que la landing esté terminada.
  if (kind === 'registration') {
    const footMotion = lineMotion?.(4) ?? null
    const Foot = footMotion ? m.div : 'div'
    return (
      <div
        className="home-season-actions__lane home-season-actions__lane--registration home-season-actions__lane--split"
        role="group"
        aria-label={title}
      >
        {body}
        <Foot className="home-season-actions__go home-season-actions__go--split" {...(footMotion ?? {})}>
          <button
            type="button"
            className="home-season-actions__page"
            aria-label={t('hero.seasonRegisterPageAria', { event: title })}
            onClick={(clickEvent) => onActivate?.(action, clickEvent, 'page')}
          >
            {t('hero.seasonRegisterPage')}
          </button>
          <button
            type="button"
            className="home-season-actions__register"
            aria-label={copy.aria}
            onClick={(clickEvent) => onActivate?.(action, clickEvent, 'register')}
          >
            <LaneCue cue={copy.cue} />
          </button>
        </Foot>
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`home-season-actions__lane home-season-actions__lane--${kind}`}
      aria-label={copy.aria}
      onClick={(clickEvent) => onActivate?.(action, clickEvent)}
    >
      {body}
    </button>
  )
}

/**
 * Díptico editorial del hero: una sola superficie, fecha y título al frente,
 * verbo alineado al cierre de cada carril. El carril de inscripción abierta no
 * es un botón entero: lleva "Página oficial" e "Inscribirme"
 * (`onActivate(action, event, 'page' | 'register')`).
 */
export default function HomeSeasonActions({ actions = [], onActivate }) {
  const { t, locale } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  // El tier se congela al montar: si baja a mitad de la entrada, Motion
  // reinicia la variante y el texto puede quedar en opacity 0.
  const [enterTier] = useState(tier)
  const [clipOn] = useState(() => hasFinePointer() && tier !== 'low')
  const motionOn = !reducedMotion
  // Cada línea anima sola. Si el panel orquesta variantes, Motion pisa el
  // delay y fecha, título y estado entran juntos.
  const timing = useMemo(() => {
    const step = MOTION_STAGGER_BY_TIER[enterTier].stepFast
    return {
      step,
      laneGap: step * 3,
      lead: scaleDuration(MOTION_DURATION.base, enterTier),
      duration: scaleDuration(MOTION_DURATION.reveal, enterTier),
      shellDuration: scaleDuration(MOTION_DURATION.slow, enterTier),
    }
  }, [enterTier])

  if (!actions.length) return null

  const Root = motionOn ? m.div : 'div'

  return (
    <Root
      className={`home-season-actions${actions.length > 1 ? ' home-season-actions--duo' : ''}`}
      role="group"
      aria-label={t('hero.seasonActionsLabel')}
      {...(motionOn
        ? {
            initial: { opacity: 0, scale: 0.985 },
            animate: { opacity: 1, scale: 1 },
            transition: {
              duration: timing.shellDuration,
              ease: MOTION_EASE.cinematic,
              delay: timing.lead,
            },
          }
        : {})}
    >
      {actions.map((action, index) => (
        <SeasonLane
          key={`${action.kind}-${action.event?.slug ?? action.event?.id ?? 'x'}`}
          action={action}
          onActivate={onActivate}
          t={t}
          locale={locale}
          lineMotion={
            motionOn
              ? (slot, clip = false) => {
                  const useClip = clip && clipOn
                  const delay = timing.lead + index * timing.laneGap + slot * timing.step
                  return {
                    initial: useClip
                      ? { opacity: 0.92, clipPath: 'inset(100% 0% 0% 0%)' }
                      : { opacity: 0, y: MOTION_DISTANCE.sm },
                    animate: useClip
                      ? { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }
                      : { opacity: 1, y: 0 },
                    transition: {
                      duration: timing.duration,
                      ease: useClip ? MOTION_EASE.cinematic : MOTION_EASE.out,
                      delay,
                    },
                  }
                }
              : null
          }
        />
      ))}
    </Root>
  )
}
