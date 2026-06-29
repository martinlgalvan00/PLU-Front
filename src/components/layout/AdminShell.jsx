import {
  BadgeCheck,
  Calendar,
  ClipboardList,
  CreditCard,
  Download,
  LayoutDashboard,
  ScrollText,
  Shield,
  Trophy,
  Users,
} from 'lucide-react'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import { ADMIN_SECTIONS } from '../../lib/content.js'
import { ROLES } from '../../lib/constants.js'

const ICONS = {
  LayoutDashboard,
  Users,
  BadgeCheck,
  Calendar,
  ClipboardList,
  CreditCard,
  Trophy,
  Download,
  Shield,
  ScrollText,
}

export default function AdminShell({
  activeSection,
  onSectionChange,
  onExit,
  role,
  onRoleChange,
  children,
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-shell__sidebar">
        <div className="admin-shell__brand">
          <span>PLU ARG</span>
          <strong>Panel operativo</strong>
        </div>
        <nav className="admin-shell__nav" aria-label="Panel administrativo">
          {ADMIN_SECTIONS.map(([key, label, iconName]) => {
            const Icon = ICONS[iconName]
            return (
              <button
                key={key}
                type="button"
                className={activeSection === key ? 'active' : ''}
                onClick={() => onSectionChange(key)}
              >
                <Icon size={18} />
                {label}
              </button>
            )
          })}
        </nav>
        <div className="admin-shell__footer">
          <div className="admin-shell__prefs">
            <ThemeToggle compact />
            <LanguageToggle compact />
          </div>
          <label className="admin-shell__role">
            Rol activo
            <select value={role} onChange={(e) => onRoleChange(e.target.value)}>
              {Object.entries(ROLES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        <button type="button" className="btn btn--ghost admin-shell__exit" onClick={onExit}>
          Volver al sitio
        </button>
        </div>
      </aside>
      <div className="admin-shell__main">{children}</div>
    </div>
  )
}
