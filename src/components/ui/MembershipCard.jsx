import { Check, ArrowRight, Shield, Star, Zap } from 'lucide-react'
import { money } from '../../lib/format.js'

// Mapa de iconos por plan — da identidad visual a cada tier
const PLAN_ICONS = {
  athlete: Shield,
  junior: Zap,
  combo: Star,
}

// Color accent por plan
const PLAN_ACCENT = {
  athlete: 'celeste',
  junior: 'gold',
  combo: 'red',
}

export default function MembershipCard({
  id = 'athlete',
  title,
  price,
  period = 'anual',
  features = [],
  highlighted = false,
  onSelect,
  ctaLabel = 'Afiliarme',
}) {
  const Icon = PLAN_ICONS[id] ?? Shield
  const accent = PLAN_ACCENT[id] ?? 'celeste'

  return (
    <article
      className={[
        'membership-card',
        `membership-card--${accent}`,
        highlighted ? 'membership-card--featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {highlighted && <span className="membership-card__badge">Más elegido</span>}

      {/* Header con icono */}
      <div className="membership-card__head">
        <div className={`membership-card__icon membership-card__icon--${accent}`} aria-hidden>
          <Icon size={18} strokeWidth={1.5} />
        </div>
        <h3 className="membership-card__title">{title}</h3>
      </div>

      {/* Precio */}
      <div className="membership-card__price">
        <span className="membership-card__amount">{money(price)}</span>
        <span className="membership-card__period">/{period}</span>
      </div>

      {/* Separador */}
      <div className="membership-card__divider" aria-hidden />

      {/* Features */}
      <ul className="membership-card__features">
        {features.map((feature) => (
          <li key={feature}>
            <span className="membership-card__check" aria-hidden>
              <Check size={13} strokeWidth={2.5} />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        type="button"
        className={`btn btn--block membership-card__cta ${highlighted ? '' : 'btn--outline'}`}
        onClick={onSelect}
      >
        {ctaLabel}
        <ArrowRight size={15} />
      </button>
    </article>
  )
}
