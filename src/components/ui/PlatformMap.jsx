import {
  BadgeCheck,
  BookOpen,
  Calendar,
  HelpCircle,
  Mail,
  Trophy,
  Users,
} from 'lucide-react'

const ICONS = {
  members: BadgeCheck,
  pitbull: Trophy,
  events: Calendar,
  results: Trophy,
  rulebook: BookOpen,
  community: Users,
  faq: HelpCircle,
  contact: Mail,
}

export default function PlatformMap({ sections, onNavigate }) {
  const groups = [...new Set(sections.map((section) => section.group))]

  return (
    <div className="platform-map">
      {groups.map((group) => (
        <div key={group} className="platform-map__group">
          <h3 className="platform-map__group-label">{group}</h3>
          <div className="platform-map__grid">
            {sections
              .filter((section) => section.group === group)
              .map((section) => {
                const Icon = ICONS[section.key] ?? BadgeCheck
                return (
                  <button
                    key={section.key}
                    type="button"
                    className="platform-map__card surface-card"
                    onClick={() => onNavigate(section.key)}
                  >
                    <span className="platform-map__icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <strong>{section.title}</strong>
                    <p>{section.desc}</p>
                    <span className="platform-map__link">Explorar</span>
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
