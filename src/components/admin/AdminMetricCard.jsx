import { BadgeCheck, ClipboardList, Shield, Users } from 'lucide-react'

const ICONS = {
  users: Users,
  badge: BadgeCheck,
  clipboard: ClipboardList,
  shield: Shield,
}

export default function AdminMetricCard({ value, label, icon = 'users', tone = 'default' }) {
  const Icon = ICONS[icon] ?? Users

  return (
    <article className={`admin-metric admin-metric--${tone}`}>
      <div className="admin-metric__icon" aria-hidden>
        <Icon size={20} />
      </div>
      <div className="admin-metric__body">
        <strong className="admin-metric__value">{value}</strong>
        <span className="admin-metric__label">{label}</span>
      </div>
    </article>
  )
}
