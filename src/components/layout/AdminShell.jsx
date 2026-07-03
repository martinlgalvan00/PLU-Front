import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
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
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'
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

const ALERT_BADGE_KEYS = new Set(['payments', 'registrations'])

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
              <BrandLogo imgClassName="admin-shell__brand-logo" height={28} />
            </div>
            <div className="admin-shell__brand-copy">
              <div className="admin-shell__brand-title">
                <strong>PLU ARG</strong>
                <span className="admin-shell__brand-tag">Operativo</span>
              </div>
              <span>Panel administrativo</span>
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
                        <Icon size={16} strokeWidth={2.1} />
                      </span>
                      <span className="admin-shell__nav-label">{label}</span>
                      {badge > 0 && (
                        <em
                          className={`admin-shell__badge${
                            ALERT_BADGE_KEYS.has(key) ? ' admin-shell__badge--alert' : ''
                          }`}
                        >
                          {badge}
                        </em>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="admin-shell__footer">
          <div className="admin-shell__account">
            <div className="admin-shell__account-mark" aria-hidden>
              <Shield size={16} strokeWidth={2.2} />
            </div>
            <div className="admin-shell__account-copy">
              <strong>{roleLabel}</strong>
              <span>Perfil activo</span>
            </div>
            <div className="admin-shell__prefs">
              <ThemeToggle compact />
              <LanguageToggle compact />
            </div>
          </div>
          <button type="button" className="admin-shell__exit" onClick={onExit}>
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Volver al sitio
          </button>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-mobile-bar">
          <button
            type="button"
            className={`admin-mobile-bar__menu${sidebarOpen ? ' is-active' : ''}`}
            aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="admin-mobile-bar__title">{activeLabel}</h1>
          <div className="admin-mobile-bar__actions">
            <ThemeToggle compact />
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
