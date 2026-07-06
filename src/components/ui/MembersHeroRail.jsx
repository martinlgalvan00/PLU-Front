import { ArrowRight } from 'lucide-react'
import { useContent } from '../../hooks/useContent.js'
import { PRICING } from '../../lib/constants.js'
import { money } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function MembersHeroRail({ onAffiliate, onViewPlans }) {
  const { MEMBERSHIP_CREDENTIAL_SAMPLE } = useContent()
  const { locale, messages } = useI18n()
  const rail = messages.pages.members.heroRail

  const metrics = [
    { value: money(PRICING.membership, locale), label: rail.adult },
    { value: money(PRICING.membershipJunior, locale), label: rail.junior },
    { value: rail.calendarYear, label: rail.validity },
  ]

  return (
    <div className="members-hero-rail members-hero-rail--editorial">
      <div className="members-hero-rail__rail">
        <dl className="members-hero-rail__metrics" aria-label={rail.metricsAria}>
          {metrics.map(({ value, label }) => (
            <div key={label} className="members-hero-rail__metric">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <span className="members-hero-rail__divider" aria-hidden />

        <div className="members-hero-rail__actions">
          <button type="button" className="members-hero-rail__cta members-hero-rail__cta--primary" onClick={onAffiliate}>
            {rail.affiliateNow}
            <ArrowRight size={14} aria-hidden />
          </button>
          <button type="button" className="members-hero-rail__cta members-hero-rail__cta--muted" onClick={onViewPlans}>
            {rail.viewPlans}
          </button>
        </div>
      </div>

      <p className="members-hero-rail__credential" aria-label={rail.credentialAria}>
        <span className="members-hero-rail__credential-code">{MEMBERSHIP_CREDENTIAL_SAMPLE.affiliateCode}</span>
        <span className="members-hero-rail__credential-sep" aria-hidden>
          ·
        </span>
        <span className="members-hero-rail__credential-name">{MEMBERSHIP_CREDENTIAL_SAMPLE.athlete}</span>
        <span className="members-hero-rail__credential-status">
          <span className="members-hero-rail__credential-dot" aria-hidden />
          {rail.statusActive}
        </span>
      </p>
    </div>
  )
}
