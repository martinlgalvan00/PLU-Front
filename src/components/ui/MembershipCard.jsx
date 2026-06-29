import { Check } from 'lucide-react'
import { money } from '../../lib/format.js'

export default function MembershipCard({
  title,
  price,
  period = 'anual',
  features = [],
  highlighted = false,
  onSelect,
  ctaLabel = 'Afiliarme',
}) {
  return (
    <article className={`membership-card surface-card ${highlighted ? 'membership-card--featured' : ''}`}>
      {highlighted && <span className="membership-card__badge">Más elegido</span>}
      <h3 className="membership-card__title">{title}</h3>
      <div className="membership-card__price">
        <span className="membership-card__amount">{money(price)}</span>
        <span className="membership-card__period">/{period}</span>
      </div>
      <ul className="membership-card__features">
        {features.map((feature) => (
          <li key={feature}>
            <Check size={16} />
            {feature}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--block" onClick={onSelect}>
        {ctaLabel}
      </button>
    </article>
  )
}
