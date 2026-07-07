import {
  BadgeCheck,
  BookOpen,
  Calendar,
  ChevronRight,
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

export default function PlatformMap({ sections, onNavigate, variant = 'default' }) {
  const isCompact = variant === 'compact'
  const groups = isCompact ? [null] : [...new Set(sections.map((section) => section.group))]

  return (
    <div className={`platform-map${isCompact ? ' platform-map--compact' : ''}`}>
      {groups.map((group) => (
        <div key={group ?? 'all'} className="platform-map__group">
          {!isCompact && group && <h3 className="platform-map__group-label">{group}</h3>}
          <div className="platform-map__grid">
            {sections
              .filter((section) => (isCompact ? true : section.group === group))
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
                      <Icon size={isCompact ? 16 : 18} />
                    </span>
                    <span className="platform-map__body">
                      <strong>{section.title}</strong>
                      {!isCompact && <p>{section.desc}</p>}
                    </span>
                    {isCompact ? (
                      <ChevronRight size={16} className="platform-map__chevron" aria-hidden />
                    ) : (
                      <span className="platform-map__link">Explorar</span>
                    )}
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
