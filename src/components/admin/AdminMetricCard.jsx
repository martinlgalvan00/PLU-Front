import { BadgeCheck, ClipboardList, Shield, Users } from 'lucide-react'

const ICONS = {
  users: Users,
  badge: BadgeCheck,
  clipboard: ClipboardList,
  shield: Shield,
}

export default function AdminMetricCard({ value, label, icon = 'users', tone = 'default', onClick }) {
  const Icon = ICONS[icon] ?? Users
  const Tag = onClick ? 'button' : 'article'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`admin-metric admin-metric--${tone}`}
      onClick={onClick}
    >
      <div className="admin-metric__icon" aria-hidden>
        <Icon size={20} />
      </div>
      <div className="admin-metric__body">
        <strong className="admin-metric__value">{value}</strong>
        <span className="admin-metric__label">{label}</span>
      </div>
    </Tag>
  )
}
