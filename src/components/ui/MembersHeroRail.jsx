import { ArrowRight } from 'lucide-react'
import { PRICING } from '../../lib/constants.js'
import { money } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function MembersHeroRail({ actionLabel, onAffiliate, onViewPlans }) {
  const { locale, messages } = useI18n()
  const rail = messages.pages.members.heroRail

  return (
    <aside className="members-hero-rail members-hero-rail--human" aria-label={rail.metricsAria}>
      <div className="members-hero-rail__bar">
        <dl className="members-hero-rail__pricing">
          <div className="members-hero-rail__price">
            <dt>{rail.adult}</dt>
            <dd>{money(PRICING.membership, locale)}</dd>
          </div>
          <div className="members-hero-rail__price members-hero-rail__price--junior">
            <dt>{rail.junior}</dt>
            <dd>{money(PRICING.membershipJunior, locale)}</dd>
          </div>
        </dl>

        <p className="members-hero-rail__validity">
          <span>{rail.validity}</span>
          <span aria-hidden> · </span>
          <span>{rail.calendarYear}</span>
        </p>

        <div className="members-hero-rail__actions">
          <button type="button" className="members-hero-rail__cta members-hero-rail__cta--primary" onClick={onAffiliate}>
            {actionLabel ?? rail.affiliateNow}
            <ArrowRight size={14} aria-hidden />
          </button>
          <button type="button" className="members-hero-rail__cta members-hero-rail__cta--ghost" onClick={onViewPlans}>
            {rail.viewPlans}
          </button>
        </div>
      </div>
    </aside>
  )
}
