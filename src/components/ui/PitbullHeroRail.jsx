import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

export default function PitbullHeroRail({
  canRegister,
  locale,
  onRegister,
  onSecondary,
  pitbullClassic,
  pricing,
  ticketsOpen,
  t,
  variant = 'card',
}) {
  const { locale: i18nLocale } = useI18n()
  const resolvedLocale = locale ?? i18nLocale
  const isOps = variant === 'ops'

  const primaryLabel = t('pages.pitbull.register')
  const secondaryLabel = ticketsOpen
    ? t('pages.pitbull.heroTickets')
    : t('pages.pitbull.ctaCategories')
  const rootClass = isOps ? 'pitbull-hero-ops' : 'pitbull-hero-rail pitbull-hero-rail--luxury'

  return (
    <div className={rootClass} role="group" aria-label={t('pages.pitbull.heroMetricsAria')}>
      <dl className={isOps ? 'pitbull-hero-ops__facts' : 'pitbull-hero-rail__metrics'}>
        {!isOps ? (
          <>
            <div className="pitbull-hero-rail__metric">
              <dt>{t('pages.pitbull.heroDate')}</dt>
              <dd>{pitbullClassic.date}</dd>
            </div>
            <div className="pitbull-hero-rail__metric">
              <dt>{t('pages.pitbull.heroVenue')}</dt>
              <dd>{pitbullClassic.venue}</dd>
            </div>
          </>
        ) : null}
        <div
          className={`${isOps ? 'pitbull-hero-ops__fact' : 'pitbull-hero-rail__metric'}${canRegister ? ' pitbull-hero-rail__metric--open' : ''}`}
        >
          <dt>{t('pages.pitbull.heroSlots')}</dt>
          <dd>
            {pitbullClassic.registered}/{pitbullClassic.slots}
          </dd>
        </div>
        <div className={isOps ? 'pitbull-hero-ops__fact' : 'pitbull-hero-rail__metric'}>
          <dt>{t('pages.pitbull.heroFee')}</dt>
          <dd>{money(pricing.registration, resolvedLocale)}</dd>
        </div>
      </dl>

      <div
        className={isOps ? 'pitbull-hero-ops__actions' : 'pitbull-hero-rail__actions'}
        aria-label={t('pages.pitbull.heroSecondaryAria')}
      >
        <button
          type="button"
          className={`${isOps ? 'pitbull-hero-ops__cta pitbull-hero-ops__cta--primary' : 'pitbull-hero-rail__cta pitbull-hero-rail__cta--primary'} motion-icon-shift`}
          onClick={onRegister}
        >
          {primaryLabel}
          <ArrowRight size={14} aria-hidden className="motion-icon-shift__target" />
        </button>
        <button
          type="button"
          className={
            isOps
              ? 'pitbull-hero-ops__cta pitbull-hero-ops__cta--muted'
              : 'pitbull-hero-rail__cta pitbull-hero-rail__cta--muted'
          }
          onClick={onSecondary}
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  )
}
