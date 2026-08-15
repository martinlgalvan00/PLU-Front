import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { getStatusMeta } from '../../lib/status.js'

/**
 * Proof del hero — franja tipo invitación al próximo meet.
 * Fecha tipográfica + copy; superficie suave, sin glass agresivo.
 */
export default function HeroStatusCard({ event, onSelect, statusLabelOverride }) {
  const { PITBULL_CLASSIC } = useContent()
  const { t } = useI18n()
  const isButton = typeof onSelect === 'function'
  const Tag = isButton ? 'button' : 'aside'
  // Mismo criterio que PitbullSpotlight: el estado sale del evento real, no
  // de un texto fijo — si no, esta franja se queda anunciando "próximamente"
  // aunque la inscripción ya esté abierta.
  const { label: fallbackStatusLabel } = getStatusMeta(event?.status ?? 'proximamente', t)
  const statusLabel = statusLabelOverride || fallbackStatusLabel

  return (
    <Tag
      className={`hero-meta hero-meta--note${isButton ? ' hero-meta--action' : ''}`}
      aria-label={t('hero.statusNextMeet')}
      type={isButton ? 'button' : undefined}
      onClick={isButton ? onSelect : undefined}
    >
      <span className="hero-meta__date" aria-hidden>
        <span className="hero-meta__date-day">{PITBULL_CLASSIC.dateDay}</span>
        <span className="hero-meta__date-month">{PITBULL_CLASSIC.dateMonth}</span>
        <span className="hero-meta__date-year">2026</span>
      </span>

      <span className="hero-meta__copy">
        <span className="hero-meta__eyebrow">{t('hero.statusNextMeet')}</span>
        <span className="hero-meta__meet">{t('hero.statusNextMeetValue')}</span>
        <span className="hero-meta__line">
          <span>{PITBULL_CLASSIC.location}</span>
          <span className="hero-meta__dot" aria-hidden />
          <span className="hero-meta__status">{statusLabel}</span>
        </span>
      </span>

      {isButton ? (
        <span className="hero-meta__go" aria-hidden>
          <ArrowRight size={16} className="hero-meta__arrow" />
        </span>
      ) : null}

      <time className="hero-meta__sr-date" dateTime="2026-12-12">
        {PITBULL_CLASSIC.dateShort}
      </time>
    </Tag>
  )
}
