import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  Calendar,
  ClipboardList,
  CreditCard,
  Download,
  LayoutDashboard,
  Menu,
  ScrollText,
  Shield,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import logo from '../../assets/PLU Official Letterhead Logo.png'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import { ADMIN_NAV_GROUPS } from '../../lib/content.js'

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
  navBadges = {},
  roleLabel = 'Sin rol',
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const activeLabel = useMemo(() => {
    const match = ADMIN_NAV_GROUPS.flatMap((group) => group.items).find(([key]) => key === activeSection)
    return match?.[1] ?? 'Panel'
  }, [activeSection])

  useEffect(() => {
    if (!sidebarOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  function handleSectionChange(key) {
    onSectionChange(key)
    setSidebarOpen(false)
  }

  return (
    <div className={`admin-shell${sidebarOpen ? ' admin-shell--nav-open' : ''}`}>
      <button
        type="button"
        className="admin-shell__backdrop"
        aria-label="Cerrar menú"
        onClick={() => setSidebarOpen(false)}
      />
      <aside className={`admin-shell__sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="admin-shell__brand">
          <div className="admin-shell__brand-inner">
            <div className="admin-shell__brand-mark">
              <img src={logo} alt="" />
            </div>
            <div className="admin-shell__brand-copy">
              <strong>PLU ARG</strong>
              <span>Panel operativo</span>
            </div>
          </div>
          <button
            type="button"
            className="admin-shell__close"
            aria-label="Cerrar menú"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="admin-shell__nav-scroll">
          <nav className="admin-shell__nav" aria-label="Panel administrativo">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.label} className="admin-shell__group">
                <span className="admin-shell__group-label">{group.label}</span>
                {group.items.map(([key, label, iconName]) => {
                  const Icon = ICONS[iconName]
                  const badge = navBadges[key]

                  return (
                    <button
                      key={key}
                      type="button"
                      className={activeSection === key ? 'active' : ''}
                      onClick={() => handleSectionChange(key)}
                    >
                      <span className="admin-shell__nav-icon" aria-hidden>
                        <Icon size={17} />
                      </span>
                      <span className="admin-shell__nav-label">{label}</span>
                      {badge > 0 && <em className="admin-shell__badge">{badge}</em>}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="admin-shell__footer">
          <div className="admin-shell__prefs">
            <ThemeToggle compact />
            <LanguageToggle compact />
          </div>
          <div className="admin-shell__role">
            <span>Perfil activo</span>
            <strong>{roleLabel}</strong>
          </div>
          <button type="button" className="btn btn--ghost admin-shell__exit" onClick={onExit}>
            Volver al sitio
          </button>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-mobile-bar">
          <button
            type="button"
            className="admin-mobile-bar__menu"
            aria-label="Abrir menú"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <Menu size={20} />
          </button>
          <div className="admin-mobile-bar__brand">
            <img src={logo} alt="" />
            <div className="admin-mobile-bar__titles">
              <span>PLU ARG</span>
              <strong>{activeLabel}</strong>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
