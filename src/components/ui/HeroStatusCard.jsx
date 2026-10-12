import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getEventCountdownHeadline, resolveEventStartsAt } from '../../lib/countdown.js'
import { getStatusMeta } from '../../lib/status.js'

const COUNT_REFRESH_MS = 60_000

/** Titular "8 semanas" del meet; se recalcula cada minuto y alcanza para que
 * pase solo a "6 días" y "5 horas" sin recargar. `null` si no hay fecha. */
function useMeetHeadline(event) {
  const startsAt = useMemo(() => resolveEventStartsAt(event), [event])
  const [headline, setHeadline] = useState(() => getEventCountdownHeadline(startsAt))

  useEffect(() => {
    setHeadline(getEventCountdownHeadline(startsAt))
    const id = window.setInterval(
      () => setHeadline(getEventCountdownHeadline(startsAt)),
      COUNT_REFRESH_MS,
    )
    return () => window.clearInterval(id)
  }, [startsAt])

  return headline
}

/**
 * Proof del hero — invitación al próximo meet.
 * El panel es fecha + sede. Si hay entradas en venta, toda la ficha es la
 * acción primaria: abre la compra, no el evento.
 */
export default function HeroStatusCard({
  event,
  onSelect,
  onSelectTickets,
  statusLabelOverride,
  ticketsAvailable = false,
}) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const ticketsAction = typeof onSelectTickets === 'function' ? onSelectTickets : onSelect
  const eventAction = typeof onSelect === 'function' ? onSelect : undefined
  const primaryAction = ticketsAvailable ? ticketsAction : eventAction
  const isAction = typeof primaryAction === 'function'
  const Tag = isAction ? 'button' : 'aside'
  const { label: fallbackStatusLabel } = getStatusMeta(event?.status ?? 'proximamente', t)
  const statusLabel = statusLabelOverride || fallbackStatusLabel
  const ticketsAria = t('hero.statusTicketsAria')
  const eventAria = t('hero.statusNextMeet')
  const cueLabel = ticketsAvailable ? t('hero.statusViewTickets') : t('hero.statusViewEvent')
  const headline = useMeetHeadline(event)
  const plural = headline?.value === 1 ? 'one' : 'other'
  const countText = headline
    ? [
        t(`pages.pitbull.countdownIntroLead_${plural}`),
        headline.value,
        t(
          `pages.pitbull.countdownIntro${headline.unit[0].toUpperCase()}${headline.unit.slice(1)}_${plural}`,
        ),
        t('pages.pitbull.countdownIntroTrail'),
      ]
        .filter(Boolean)
        .join(' ')
    : null

  return (
    <Tag
      className={[
        'hero-meta',
        'hero-meta--note',
        isAction ? 'hero-meta--action' : '',
        ticketsAvailable ? 'hero-meta--tickets' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ticketsAvailable ? ticketsAria : eventAria}
      type={isAction ? 'button' : undefined}
      onClick={isAction ? primaryAction : undefined}
    >
      <span className="hero-meta__panel">
        <span className="hero-meta__date" aria-hidden>
          <span className="hero-meta__date-day">{PITBULL_CLASSIC.dateDay}</span>
          <span className="hero-meta__date-month">{PITBULL_CLASSIC.dateMonth}</span>
          <span className="hero-meta__date-year">2026</span>
        </span>

        <span className="hero-meta__copy">
          <span className="hero-meta__eyebrow">{t('hero.statusNextMeet')}</span>
          <span className="hero-meta__meet">{t('hero.statusNextMeetValue')}</span>
          <span className="hero-meta__line">{PITBULL_CLASSIC.location}</span>
          {countText ? (
            <span className="hero-meta__count" key={countText}>
              {countText}
            </span>
          ) : null}
          {ticketsAvailable ? null : (
            <span className="hero-meta__invite">
              <span className="hero-meta__status">{statusLabel}</span>
              {isAction ? (
                <span className="hero-meta__go" aria-hidden>
                  <span className="hero-meta__cue">{t('hero.statusViewEvent')}</span>
                  <ArrowRight size={14} className="hero-meta__arrow" />
                </span>
              ) : null}
            </span>
          )}
        </span>
      </span>

      {ticketsAvailable ? (
        <span className="hero-meta__tickets">
          <span className="hero-meta__status">{statusLabel}</span>
          {isAction ? (
            <span className="hero-meta__go" aria-hidden>
              <span className="hero-meta__cue">{cueLabel}</span>
              <ArrowRight size={14} className="hero-meta__arrow" />
            </span>
          ) : null}
        </span>
      ) : null}

      <time className="hero-meta__sr-date" dateTime="2026-12-12">
        {PITBULL_CLASSIC.dateShort}
      </time>
    </Tag>
  )
}
