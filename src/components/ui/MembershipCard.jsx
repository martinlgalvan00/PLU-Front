import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

function kickerEchoesPeriod(kicker, tokens) {
  const normalized = String(kicker).trim().toLowerCase()
  if (!normalized) return true
  return tokens.some((token) => {
    const value = String(token ?? '').trim().toLowerCase()
    if (!value) return false
    return normalized === value || normalized === `plan ${value}` || normalized === `${value} plan`
  })
}

export default function MembershipCard({
  id = 'athlete',
  title,
  kicker,
  price,
  period,
  features = [],
  highlighted = false,
  compareWith = [],
  onSelect,
  ctaLabel,
  ctaDisabled = false,
  variant = 'plu',
  billingToggleEnabled = false,
  billingAutoRenew = false,
  onBillingAutoRenewChange,
  billingToggleLabel,
  billingToggleHint,
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
  const resolvedKicker = highlighted
    ? (kicker ?? t('pages.membershipCard.featured'))
    : (kicker ?? t('pages.membershipCard.periodAnnual'))
  const periodAnnualLabel = t('pages.membershipCard.periodAnnual')
  const featuredLabel = t('pages.membershipCard.featured')
  const showKicker = Boolean(resolvedKicker)
    && resolvedKicker.trim().toLowerCase() !== featuredLabel.trim().toLowerCase()
    && !kickerEchoesPeriod(resolvedKicker, [
      periodAnnualLabel,
      resolvedPeriod,
      periodLabel,
    ])
  const autoRenewLabel = billingToggleLabel ?? t('pages.members.autoRenewLabel')
  const autoRenewHint = billingToggleHint
  const autoRenewId = `membership-auto-renew-${id}`

  if (variant === 'plu') {
    return (
      <article
        className={[
          'membership-card',
          'membership-card--plu',
          'membership-card--plu-band',
          highlighted ? 'membership-card--plu-featured' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="membership-card__body">
          <div className="membership-card__offer">
            <header className="membership-card__identity">
              {showKicker ? <p className="membership-card__kicker">{resolvedKicker}</p> : null}
              <h3 className="membership-card__title">{title}</h3>
              <div className="membership-card__price-stack">
                <span className="membership-card__amount">{money(price, locale)}</span>
                <span className="membership-card__period">{periodLabel}</span>
                {hasCompare ? (
                  <span className="membership-card__save-note">
                    {t('pages.membershipCard.save', { amount: money(savings, locale) })}
                  </span>
                ) : null}
              </div>
            </header>
          </div>

          <div className="membership-card__includes">
            <p className="membership-card__includes-label" id={`${id}-includes-label`}>
              {t('pages.membershipCard.includesLabel')}
            </p>
            <ul
              className="membership-card__features-list"
              aria-labelledby={`${id}-includes-label`}
            >
              {features.map((feature, i) => (
                <li key={`${id}-${i}`} className="membership-card__feature">
                  <span className="membership-card__feature-text">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {billingToggleEnabled ? (
            <div className="membership-card__renew">
              <div className="members-plu-plans__auto-renew">
                <div className="members-plu-plans__auto-renew-row">
                  <div className="members-plu-plans__auto-renew-copy">
                    <label className="members-plu-plans__auto-renew-label" htmlFor={autoRenewId}>
                      {autoRenewLabel}
                    </label>
                    {autoRenewHint ? (
                      <p className="members-plu-plans__auto-renew-hint" id={`${autoRenewId}-hint`}>
                        {autoRenewHint}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    id={autoRenewId}
                    className="members-plu-plans__auto-renew-switch"
                    role="switch"
                    aria-checked={billingAutoRenew}
                    aria-describedby={autoRenewHint ? `${autoRenewId}-hint` : undefined}
                    onClick={() => onBillingAutoRenewChange?.(!billingAutoRenew)}
                  >
                    <span className="members-plu-plans__auto-renew-thumb" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <footer className="membership-card__foot">
            <button
              type="button"
              className="membership-card__cta motion-icon-shift"
              disabled={ctaDisabled}
              onClick={onSelect}
            >
              {resolvedCtaLabel}
              <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
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
            {highlighted ? (
              <span className="membership-card__badge">{t('pages.membershipCard.featured')}</span>
            ) : null}
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

        {hasCompare ? (
          <p className="membership-card__compare-inline">
            <span className="membership-card__compare-strike">{money(compareTotal, locale)}</span>
            <span>{t('pages.membershipCard.separate')}</span>
          </p>
        ) : null}

        <ul className="membership-card__features-list" aria-label={t('pages.membershipCard.featuresAria')}>
          {features.map((feature, i) => (
            <li key={`${id}-${i}`} className="membership-card__feature">
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
