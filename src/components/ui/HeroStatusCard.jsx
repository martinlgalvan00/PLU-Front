import { ArrowRight, Ticket } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'

/**
 * Proof del hero — invitación al próximo meet.
 * El panel es fecha + sede. Si hay entradas en venta, esa señal cuelga
 * debajo (no adentro): "Cerrado" era la inscripción de atletas.
 */
export default function HeroStatusCard({
  event,
  onSelect,
  statusLabelOverride,
  ticketsAvailable = false,
}) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const isButton = typeof onSelect === 'function'
  const Tag = isButton ? 'button' : 'aside'
  const { label: fallbackStatusLabel } = getStatusMeta(event?.status ?? 'proximamente', t)
  const statusLabel = statusLabelOverride || fallbackStatusLabel
  const ariaLabel = ticketsAvailable ? t('hero.statusTicketsAria') : t('hero.statusNextMeet')

  return (
    <Tag
      className={[
        'hero-meta',
        'hero-meta--note',
        isButton ? 'hero-meta--action' : '',
        ticketsAvailable ? 'hero-meta--tickets' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      type={isButton ? 'button' : undefined}
      onClick={isButton ? onSelect : undefined}
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
          {ticketsAvailable ? null : (
            <span className="hero-meta__invite">
              <span className="hero-meta__status">{statusLabel}</span>
              {isButton ? (
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
          <span className="hero-meta__tickets-mark" aria-hidden>
            <Ticket size={14} strokeWidth={2} />
          </span>
          <span className="hero-meta__tickets-copy">
            <span className="hero-meta__status">{statusLabel}</span>
            {isButton ? (
              <span className="hero-meta__go" aria-hidden>
                <span className="hero-meta__cue">{t('hero.statusViewEvent')}</span>
                <ArrowRight size={14} className="hero-meta__arrow" />
              </span>
            ) : null}
          </span>
        </span>
      ) : null}

      <time className="hero-meta__sr-date" dateTime="2026-12-12">
        {PITBULL_CLASSIC.dateShort}
      </time>
    </Tag>
  )
}
