import { ArrowRight, Calendar, MapPin, Ticket, Users } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'

function EventStatusBadge({ status, t }) {
  const { label, tone } = getStatusMeta(status, t)
  return <span className={`events-status-badge events-status-badge--${tone}`}>{label}</span>
}

export default function PitbullHeroRail({
  canRegister,
  eventStatus,
  locale,
  onRegister,
  onSecondary,
  pitbullClassic,
  pricing,
  ticketsOpen,
  t,
}) {
  const { locale: i18nLocale } = useI18n()
  const resolvedLocale = locale ?? i18nLocale

  const primaryLabel = t('pages.pitbull.register')
  const secondaryLabel = ticketsOpen ? t('pages.pitbull.heroTickets') : t('pages.pitbull.ctaCategories')

  return (
    <aside className="pitbull-hero-rail pitbull-hero-rail--luxury" aria-label={t('pages.pitbull.heroMetricsAria')}>
      <div className="pitbull-hero-rail__rail">
        <div className="pitbull-hero-rail__status">
          <EventStatusBadge status={eventStatus} t={t} />
        </div>

        <span className="pitbull-hero-rail__divider" aria-hidden />

        <dl className="pitbull-hero-rail__metrics">
          <div className="pitbull-hero-rail__metric">
            <dt>
              <Calendar size={11} aria-hidden />
              {t('pages.pitbull.heroDate')}
            </dt>
            <dd>{pitbullClassic.date}</dd>
          </div>
          <div className="pitbull-hero-rail__metric">
            <dt>
              <MapPin size={11} aria-hidden />
              {t('pages.pitbull.heroVenue')}
            </dt>
            <dd>{pitbullClassic.venue}</dd>
          </div>
          <div className={`pitbull-hero-rail__metric${canRegister ? ' pitbull-hero-rail__metric--open' : ''}`}>
            <dt>
              <Users size={11} aria-hidden />
              {t('pages.pitbull.heroSlots')}
            </dt>
            <dd>
              {pitbullClassic.registered}/{pitbullClassic.slots}
            </dd>
          </div>
          <div className="pitbull-hero-rail__metric">
            <dt>
              <Ticket size={11} aria-hidden />
              {t('pages.pitbull.heroFee')}
            </dt>
            <dd>{money(pricing.registration, resolvedLocale)}</dd>
          </div>
        </dl>

        <span className="pitbull-hero-rail__divider pitbull-hero-rail__divider--actions" aria-hidden />

        <div className="pitbull-hero-rail__actions" aria-label={t('pages.pitbull.heroSecondaryAria')}>
          <button
            type="button"
            className="pitbull-hero-rail__cta pitbull-hero-rail__cta--primary"
            onClick={onRegister}
          >
            {primaryLabel}
            <ArrowRight size={14} aria-hidden />
          </button>
          <button type="button" className="pitbull-hero-rail__cta pitbull-hero-rail__cta--muted" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        </div>
      </div>
    </aside>
  )
}
