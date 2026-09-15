import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'

/**
 * Proof del hero — invitación al próximo meet.
 * El panel es fecha + sede. Si hay entradas en venta, esa señal cierra
 * la misma ficha y es la acción primaria: abre la compra, no el evento.
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
  const hasSplitActions = ticketsAvailable && typeof ticketsAction === 'function'
  const Tag = hasSplitActions ? 'div' : eventAction ? 'button' : 'aside'
  const PanelTag = hasSplitActions && eventAction ? 'button' : 'span'
  const TicketsTag = hasSplitActions ? 'button' : 'span'
  const { label: fallbackStatusLabel } = getStatusMeta(event?.status ?? 'proximamente', t)
  const statusLabel = statusLabelOverride || fallbackStatusLabel
  const ticketsAria = t('hero.statusTicketsAria')
  const eventAria = t('hero.statusNextMeet')
  const cueLabel = ticketsAvailable ? t('hero.statusViewTickets') : t('hero.statusViewEvent')

  return (
    <Tag
      className={[
        'hero-meta',
        'hero-meta--note',
        !hasSplitActions && eventAction ? 'hero-meta--action' : '',
        ticketsAvailable ? 'hero-meta--tickets' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={hasSplitActions ? undefined : ticketsAvailable ? ticketsAria : eventAria}
      type={!hasSplitActions && eventAction ? 'button' : undefined}
      onClick={!hasSplitActions && eventAction ? onSelect : undefined}
    >
      <PanelTag
        className="hero-meta__panel"
        type={PanelTag === 'button' ? 'button' : undefined}
        aria-label={PanelTag === 'button' ? eventAria : undefined}
        onClick={PanelTag === 'button' ? eventAction : undefined}
      >
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
              {eventAction ? (
                <span className="hero-meta__go" aria-hidden>
                  <span className="hero-meta__cue">{t('hero.statusViewEvent')}</span>
                  <ArrowRight size={14} className="hero-meta__arrow" />
                </span>
              ) : null}
            </span>
          )}
        </span>
      </PanelTag>

      {ticketsAvailable ? (
        <TicketsTag
          className="hero-meta__tickets"
          type={TicketsTag === 'button' ? 'button' : undefined}
          aria-label={TicketsTag === 'button' ? ticketsAria : undefined}
          onClick={TicketsTag === 'button' ? ticketsAction : undefined}
        >
          <span className="hero-meta__status">{statusLabel}</span>
          {hasSplitActions || eventAction ? (
            <span className="hero-meta__go" aria-hidden>
              <span className="hero-meta__cue">{cueLabel}</span>
              <ArrowRight size={14} className="hero-meta__arrow" />
            </span>
          ) : null}
        </TicketsTag>
      ) : null}

      <time className="hero-meta__sr-date" dateTime="2026-12-12">
        {PITBULL_CLASSIC.dateShort}
      </time>
    </Tag>
  )
}
