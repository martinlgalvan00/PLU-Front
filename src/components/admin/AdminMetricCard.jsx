import { BadgeCheck, ClipboardList, Shield, Users } from 'lucide-react'

const ICONS = {
  users: Users,
  badge: BadgeCheck,
  clipboard: ClipboardList,
  shield: Shield,
}

export default function AdminMetricCard({
  value,
  label,
  icon = 'users',
  tone = 'default',
  compact = false,
  minimal = false,
  size = 'primary',
  index = 0,
  onClick,
  hideIcon = false,
}) {
  const Icon = ICONS[icon] ?? Users
  const Tag = onClick ? 'button' : 'article'
  const showIcon = !hideIcon && (!minimal || size === 'primary')

  const className = [
    'admin-metric',
    `admin-metric--${tone}`,
    compact ? 'admin-metric--compact' : '',
    minimal ? 'admin-metric--minimal' : '',
    minimal ? `admin-metric--${size}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={className}
      style={{ '--metric-index': index }}
      onClick={onClick}
    >
      {showIcon && (
        <div className="admin-metric__icon" aria-hidden>
          <Icon size={compact ? 16 : 20} />
        </div>
      )}
      <div className="admin-metric__body">
        <strong className="admin-metric__value">{value}</strong>
        <span className="admin-metric__label">{label}</span>
      </div>
    </Tag>
  )
}
