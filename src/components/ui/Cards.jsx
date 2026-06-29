import { CheckCircle2 } from 'lucide-react'

export function BenefitCard({ icon: Icon, title, text }) {
  return (
    <article className="benefit-card">
      <Icon size={44} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

export function PricingCard({ details, onJoin, price, title }) {
  return (
    <article className="pricing-card">
      <h3>{title}</h3>
      <div>
        <span>$</span>
        {price.replace('$', '')}
      </div>
      <p>por año</p>
      <ul>
        {details.map((detail) => (
          <li key={detail}>
            <CheckCircle2 size={16} />
            {detail}
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={onJoin}>
        Inscribirse
      </button>
    </article>
  )
}

export function InfoCard({ action, onAction, text, title }) {
  return (
    <article className="info-card">
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button type="button" className="btn" onClick={onAction}>
          {action}
        </button>
      )}
    </article>
  )
}
