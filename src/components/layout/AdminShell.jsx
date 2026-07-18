import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  LayoutDashboard,
  Menu,
  ScanLine,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
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
  ScanLine,
  Eye,
  ShoppingBag,
}

const ALERT_BADGE_KEYS = new Set(['payments', 'registrations'])
const UNAVAILABLE_NAV_KEYS = new Set(['results', 'exports', 'audit'])
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'plu-admin-sidebar-collapsed'

function readStoredCollapsed() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function AdminShell({
  activeSection,
  onSectionChange,
  onExit,
  navBadges = {},
  roleLabel = 'Sin rol',
  restrictedNav = false,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readStoredCollapsed)
  const { t } = useI18n()

  const navGroups = useMemo(() => {
    if (restrictedNav === 'pluUsa') {
      return ADMIN_NAV_GROUPS.filter((group) => group.labelKey === 'admin.nav.groups.pluUsa')
    }
    if (restrictedNav === 'checkin') {
      return ADMIN_NAV_GROUPS
        .map((group) => ({ ...group, items: group.items.filter(([key]) => key === 'checkin') }))
        .filter((group) => group.items.length > 0)
    }
    return ADMIN_NAV_GROUPS
      .map((group) => ({
        ...group,
        items: group.items.filter(([key]) => !UNAVAILABLE_NAV_KEYS.has(key)),
      }))
      .filter((group) => group.items.length > 0)
  }, [restrictedNav])

  const activeLabel = useMemo(() => {
    const match = ADMIN_NAV_GROUPS.flatMap((group) => group.items).find(([key]) => key === activeSection)
    return match?.[1] ? t(match[1]) : t('admin.shell.defaultSection')
  }, [activeSection, t])

  useEffect(() => {
    if (!sidebarOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // localStorage puede no estar disponible (modo privado); no bloquea la UI.
    }
  }, [collapsed])

  function handleSectionChange(key) {
    onSectionChange(key)
    setSidebarOpen(false)
  }

  return (
    <div
      className={`admin-shell${sidebarOpen ? ' admin-shell--nav-open' : ''}${
        collapsed ? ' admin-shell--collapsed' : ''
      }`}
    >
      <button
        type="button"
        className="admin-shell__backdrop"
        aria-label={t('admin.shell.closeMenu')}
        onClick={() => setSidebarOpen(false)}
      />
      <button
        type="button"
        className="admin-shell__collapse-toggle"
        aria-label={collapsed ? t('admin.shell.expandSidebar') : t('admin.shell.collapseSidebar')}
        title={collapsed ? t('admin.shell.expandSidebar') : t('admin.shell.collapseSidebar')}
        aria-pressed={collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? <ChevronRight size={14} strokeWidth={2.2} /> : <ChevronLeft size={14} strokeWidth={2.2} />}
      </button>
      <aside className={`admin-shell__sidebar${sidebarOpen ? ' is-open' : ''}`}>
        <div className="admin-shell__brand">
          <div className="admin-shell__brand-inner">
            <div className="admin-shell__brand-mark">
              <BrandLogo imgClassName="admin-shell__brand-logo" height={28} />
            </div>
            <div className="admin-shell__brand-copy">
              <span className="admin-shell__brand-name">{t('brand.name')}</span>
              <span className="admin-shell__brand-subtitle">
                {restrictedNav === 'pluUsa'
                  ? t('admin.shell.brandTagPartner')
                  : restrictedNav === 'checkin'
                    ? t('admin.shell.brandSubtitleSecurity')
                    : t('admin.shell.brandTag')}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="admin-shell__close"
            aria-label={t('admin.shell.closeMenu')}
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="admin-shell__nav-scroll">
          <nav className="admin-shell__nav" aria-label={t('admin.shell.navAria')}>
            {navGroups.map((group) => (
              <div key={group.labelKey} className="admin-shell__group">
                <span className="admin-shell__group-label">{t(group.labelKey)}</span>
                {group.items.map(([key, labelKey, iconName]) => {
                  const Icon = ICONS[iconName]
                  const badge = navBadges[key]
                  const label = t(labelKey)

                  return (
                    <button
                      key={key}
                      type="button"
                      className={activeSection === key ? 'active' : ''}
                      aria-current={activeSection === key ? 'page' : undefined}
                      onClick={() => handleSectionChange(key)}
                      title={collapsed ? label : undefined}
                    >
                      <span className="admin-shell__nav-icon" aria-hidden>
                        <Icon size={15} strokeWidth={1.75} />
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
          <div className="admin-shell__session-bar">
            <span className="admin-shell__session-context">
              <span className="admin-shell__session-dot" aria-hidden />
              <span className="admin-shell__session-copy">
                <small>{t('admin.shell.activeProfile')}</small>
                <span className="admin-shell__session-role">{roleLabel}</span>
              </span>
            </span>
            <div className="admin-shell__prefs">
              <ThemeToggle compact />
              <LanguageToggle compact />
            </div>
          </div>
          <button type="button" className="admin-shell__exit" onClick={onExit} title={collapsed ? t('admin.shell.exit') : undefined}>
            <ArrowLeft size={14} strokeWidth={2} aria-hidden />
            <span className="admin-shell__exit-label">{t('admin.shell.exit')}</span>
          </button>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-mobile-bar">
          <button
            type="button"
            className={`admin-mobile-bar__menu${sidebarOpen ? ' is-active' : ''}`}
            aria-label={sidebarOpen ? t('admin.shell.closeMenu') : t('admin.shell.openMenu')}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="admin-mobile-bar__title">{activeLabel}</h1>
          <div className="admin-mobile-bar__actions">
            <LanguageToggle compact />
            <ThemeToggle compact />
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
