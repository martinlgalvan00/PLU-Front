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
          <div className="admin-shell__role"><span>Perfil activo</span><strong>Admin PLU</strong></div>
        <button type="button" className="btn btn--ghost admin-shell__exit" onClick={onExit}>
          Volver al sitio
        </button>
        </div>
      </aside>
      <div className="admin-shell__main">{children}</div>
    </div>
  )
}
