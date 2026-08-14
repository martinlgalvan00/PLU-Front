import { LockKeyhole } from 'lucide-react'

/**
 * Aviso reutilizable para funcionalidades temporalmente pausadas.
 * Variantes: banner (admin lock), inline (notice en página), page (empty institucional).
 */
export default function FeatureComingSoon({
  variant = 'banner',
  eyebrow,
  title,
  lead,
  icon: Icon = LockKeyhole,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  role = 'status',
  className = '',
}) {
  const rootClass = ['feature-coming-soon', `feature-coming-soon--${variant}`, className]
    .filter(Boolean)
    .join(' ')
  const iconSize = variant === 'page' ? 28 : variant === 'banner' ? 20 : 18

  return (
    <aside className={rootClass} role={role}>
      {Icon ? <Icon className="feature-coming-soon__icon" size={iconSize} aria-hidden /> : null}
      <div className="feature-coming-soon__copy">
        {eyebrow ? <p className="feature-coming-soon__eyebrow">{eyebrow}</p> : null}
        {title ? (
          variant === 'banner' ? (
            <strong className="feature-coming-soon__title">{title}</strong>
          ) : (
            <p className="feature-coming-soon__title">{title}</p>
          )
        ) : null}
        {lead ? <p className="feature-coming-soon__lead">{lead}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button type="button" className="feature-coming-soon__action" onClick={onAction}>
          {ActionIcon ? <ActionIcon size={14} aria-hidden /> : null}
          {actionLabel}
        </button>
      ) : null}
    </aside>
  )
}
