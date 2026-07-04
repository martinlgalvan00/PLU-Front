import { HOME_MEMBERSHIP, HOME_MEMBERSHIP_FEATURES } from '../../lib/content.js'
import { money } from '../../lib/format.js'
import SectionHeading from './SectionHeading.jsx'

export default function HomeMembershipBand({ plan, onNavigate }) {
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
          Afiliarme ahora
        </button>
      </div>

      <article className="home-membership-card">
        <div className="home-membership-card__price">
          <span className="home-membership-card__amount">{money(plan?.price ?? 0)}</span>
          <span className="home-membership-card__period">ARS / año</span>
        </div>
        <span className="home-membership-card__note">Dato de ejemplo</span>
        <ul className="home-membership-card__features">
          {HOME_MEMBERSHIP_FEATURES.map((feature) => (
            <li key={feature}>
              <span aria-hidden>＋</span>
              {feature}
            </li>
          ))}
        </ul>
      </article>
    </div>
  )
}
