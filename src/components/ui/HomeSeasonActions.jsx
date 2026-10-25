import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

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
        eyebrow: t('hero.seasonTicketsEyebrow'),
        status: t('hero.statusTicketsOpen'),
        cue: t('hero.seasonTicketsCue'),
        aria: t('hero.seasonTicketsAria', { event: title }),
      }
    case 'registration':
      return {
        eyebrow: t('hero.seasonRegisterEyebrow'),
        status: t('hero.statusRegistrationOpen'),
        cue: t('hero.seasonRegisterCue'),
        aria: t('hero.seasonRegisterAria', { event: title }),
      }
    case 'registration_soon':
      return {
        eyebrow: t('hero.seasonRegisterEyebrow'),
        status: t('hero.seasonRegisterSoonStatus'),
        cue: t('hero.seasonRegisterSoonCue'),
        aria: t('hero.seasonRegisterSoonAria', { event: title }),
      }
    default: {
      const _exhaustive = kind
      void _exhaustive
      return {
        eyebrow: t('hero.seasonRegisterEyebrow'),
        status: t('hero.seasonRegisterSoonStatus'),
        cue: t('hero.seasonRegisterSoonCue'),
        aria: t('hero.seasonRegisterSoonAria', { event: title }),
      }
    }
  }
}

function SeasonLane({ action, onActivate, t, locale }) {
  const { kind, event } = action
  const dateParts = formatSeasonDateParts(event, locale)
  const title =
    event?.title ??
    (kind === 'tickets' ? t('hero.seasonTicketsFallback') : t('hero.seasonRegisterFallback'))
  const place = [event?.venue, event?.location].filter(Boolean).join(' · ')
  const copy = laneCopy(kind, title, t)

  return (
    <button
      type="button"
      className={`home-season-actions__lane home-season-actions__lane--${kind}`}
      aria-label={copy.aria}
      onClick={(clickEvent) => onActivate?.(action, clickEvent)}
    >
      <span className="home-season-actions__body">
        {dateParts ? (
          <span className="home-season-actions__date" aria-hidden>
            <span className="home-season-actions__day">{dateParts.day}</span>
            <span className="home-season-actions__month">{dateParts.month}</span>
            <span className="home-season-actions__year">{dateParts.year}</span>
          </span>
        ) : null}

        <span className="home-season-actions__copy">
          <span className="home-season-actions__eyebrow">{copy.eyebrow}</span>
          <span className="home-season-actions__meet">{title}</span>
          {place ? <span className="home-season-actions__place">{place}</span> : null}
          <span className="home-season-actions__status">{copy.status}</span>
        </span>
      </span>

      <span className="home-season-actions__go" aria-hidden>
        <span className="home-season-actions__cue">{copy.cue}</span>
        <ArrowRight size={13} strokeWidth={1.75} className="home-season-actions__arrow" />
      </span>
    </button>
  )
}

/**
 * Díptico editorial del hero: entradas + inscripción (abierta o próximamente).
 * Sin cards gemelas: carriles apilados con una sola superficie.
 */
export default function HomeSeasonActions({ actions = [], onActivate }) {
  const { t, locale } = useI18n()
  if (!actions.length) return null

  return (
    <div
      className={`home-season-actions${actions.length > 1 ? ' home-season-actions--duo' : ''}`}
      role="group"
      aria-label={t('hero.seasonActionsLabel')}
    >
      {actions.map((action) => (
        <SeasonLane
          key={`${action.kind}-${action.event?.slug ?? action.event?.id ?? 'x'}`}
          action={action}
          onActivate={onActivate}
          t={t}
          locale={locale}
        />
      ))}
    </div>
  )
}
