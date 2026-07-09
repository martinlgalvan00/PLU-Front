import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import SectionHeading from './SectionHeading.jsx'

export default function HomeMembershipBand({ plan, onNavigate }) {
  const { HOME_MEMBERSHIP, HOME_MEMBERSHIP_FEATURES } = useContent()
  const { locale, t } = useI18n()

  return (
    <div className="home-membership-band">
      <div className="home-membership-band__copy">
        <SectionHeading
          align="left"
          variant="ref"
          eyebrow={HOME_MEMBERSHIP.eyebrow}
          title={HOME_MEMBERSHIP.title}
          description={HOME_MEMBERSHIP.description}
        />
        <button type="button" className="home-membership-band__cta" onClick={() => onNavigate('members')}>
          {HOME_MEMBERSHIP.cta}
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>

      <article className="home-membership-card">
        <header className="home-membership-card__head">
          <span className="home-membership-card__label">{HOME_MEMBERSHIP.planLabel}</span>
          <div className="home-membership-card__price">
            <span className="home-membership-card__amount">{money(plan?.price ?? 0, locale)}</span>
            <span className="home-membership-card__period">{t('pages.membershipCard.perYear')}</span>
          </div>
        </header>

        <ul className="home-membership-card__features" aria-label={t('pages.membershipCard.featuresAria')}>
          {HOME_MEMBERSHIP_FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>

        <footer className="home-membership-card__foot">
          <button type="button" className="home-membership-card__link" onClick={() => onNavigate('members')}>
            {HOME_MEMBERSHIP.cardCta}
            <ArrowRight size={14} aria-hidden />
          </button>
        </footer>
      </article>
    </div>
  )
}
