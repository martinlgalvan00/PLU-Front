import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

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
  ctaDisabled = false,
  variant = 'plu',
}) {
  const { locale, t } = useI18n()
  const compareTotal = compareWith.reduce((sum, item) => sum + item.price, 0)
  const savings = compareTotal - price
  const hasCompare = compareWith.length > 0 && savings > 0
  const resolvedPeriod = period ?? t('pages.membershipCard.periodAnnual')
  const resolvedCtaLabel = ctaLabel ?? t('pages.membershipCard.cta')
  const periodLabel =
    resolvedPeriod === t('pages.membershipCard.periodAnnual')
      ? t('pages.membershipCard.perYear')
      : resolvedPeriod

  if (variant === 'plu') {
    return (
      <article
        className={[
          'membership-card',
          'membership-card--plu',
          highlighted ? 'membership-card--plu-featured' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="membership-card__body">
          <h3 className="membership-card__title">{title}</h3>

          <div className="membership-card__price-stack">
            <span className="membership-card__amount">{money(price, locale)}</span>
            <span className="membership-card__period">{periodLabel}</span>
            {hasCompare && (
              <span className="membership-card__save-note">
                {t('pages.membershipCard.save', { amount: money(savings, locale) })}
              </span>
            )}
          </div>

          <ul className="membership-card__features-list" aria-label={t('pages.membershipCard.featuresAria')}>
            {features.map((feature, i) => (
              <li key={i} className="membership-card__feature">
                {feature}
              </li>
            ))}
          </ul>

          <footer className="membership-card__foot">
            <button type="button" className="membership-card__cta" disabled={ctaDisabled} onClick={onSelect}>
              {resolvedCtaLabel}
            </button>
          </footer>
        </div>
      </article>
    )
  }

  return (
    <article
      className={[
        'membership-card',
        'membership-card--editorial',
        highlighted ? 'membership-card--featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="membership-card__body">
        <header className="membership-card__top">
          <div className="membership-card__identity">
            {highlighted && (
              <span className="membership-card__badge">{t('pages.membershipCard.featured')}</span>
            )}
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
          </p>
        )}

        <ul className="membership-card__features-list" aria-label={t('pages.membershipCard.featuresAria')}>
          {features.map((feature, i) => (
            <li key={i} className="membership-card__feature">
              {feature}
            </li>
          ))}
        </ul>

        <footer className="membership-card__foot">
          <button type="button" className="membership-card__cta" disabled={ctaDisabled} onClick={onSelect}>
            {resolvedCtaLabel}
          </button>
        </footer>
      </div>
    </article>
  )
}
