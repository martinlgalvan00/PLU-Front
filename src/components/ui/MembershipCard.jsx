import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

const PLAN_ACCENT = {
  athlete: 'celeste',
  junior: 'gold',
  combo: 'red',
}

export default function MembershipCard({
  id = 'athlete',
  title,
  price,
  period,
  features = [],
  highlighted = false,
  compareWith = [],
  onSelect,
  ctaLabel,
}) {
  const { locale, t } = useI18n()
  const accent = PLAN_ACCENT[id] ?? 'celeste'
  const compareTotal = compareWith.reduce((sum, item) => sum + item.price, 0)
  const savings = compareTotal - price
  const hasCompare = compareWith.length > 0 && savings > 0
  const resolvedPeriod = period ?? t('pages.membershipCard.periodAnnual')
  const resolvedCtaLabel = ctaLabel ?? t('pages.membershipCard.cta')

  return (
    <article
      className={[
        'membership-card',
        'membership-card--editorial',
        `membership-card--${accent}`,
        highlighted ? 'membership-card--featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="membership-card__top">
        <div className="membership-card__identity">
          {highlighted && <span className="membership-card__badge">{t('pages.membershipCard.featured')}</span>}
          <h3 className="membership-card__title">{title}</h3>
        </div>
        <div className="membership-card__price-block">
          <span className="membership-card__amount">{money(price, locale)}</span>
          {hasCompare ? (
            <span className="membership-card__save">
              {t('pages.membershipCard.save', { amount: money(savings, locale) })}
            </span>
          ) : (
            <span className="membership-card__period">/{resolvedPeriod}</span>
          )}
        </div>
      </header>

      {hasCompare && (
        <p className="membership-card__compare-inline">
          <span className="membership-card__compare-strike">{money(compareTotal, locale)}</span>
          <span>{t('pages.membershipCard.separate')}</span>
          <span className="membership-card__compare-sep" aria-hidden>
            ·
          </span>
          <span>{t('pages.membershipCard.comboIncludes')}</span>
        </p>
      )}

      <p className="membership-card__features-line">{features.join(' · ')}</p>

      <footer className="membership-card__foot">
        <button type="button" className="membership-card__link" onClick={onSelect}>
          {resolvedCtaLabel}
          <ArrowRight size={14} aria-hidden />
        </button>
      </footer>
    </article>
  )
}
