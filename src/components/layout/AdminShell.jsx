import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  LayoutDashboard,
  LayoutGrid,
  KeyRound,
  Menu,
  PanelLeft,
  PanelLeftClose,
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

// Cada `icon` de ADMIN_NAV_GROUPS tiene que estar acá: el lookup no tiene
// fallback, y una clave faltante devuelve undefined, que React rechaza como
// tipo de elemento y tira toda la shell del panel, no solo ese ítem.
const ICONS = {
  LayoutDashboard,
  LayoutGrid,
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
  KeyRound,
}

const ALERT_BADGE_KEYS = new Set(['payments', 'registrations'])
// `audit` salió de acá al dejar de ser un placeholder: ahora lee
// `domain_audit_logs` a través de /api/audit.
const UNAVAILABLE_NAV_KEYS = new Set(['results', 'exports', 'checkin'])
const SIDEBAR_MODE_STORAGE_KEY = 'plu-admin-sidebar-mode'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'plu-admin-sidebar-collapsed'
const SIDEBAR_MODES = ['expanded', 'collapsed', 'hidden']

function readStoredSidebarMode() {
  if (typeof window === 'undefined') return 'collapsed'
  try {
    const stored = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)
    if (SIDEBAR_MODES.includes(stored)) return stored

    // Migración del flag booleano anterior.
    const legacy = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    if (legacy === null) return 'collapsed'
    return legacy === '1' ? 'collapsed' : 'expanded'
  } catch {
    return 'collapsed'
  }
}

function nextSidebarMode(mode) {
  if (mode === 'expanded') return 'collapsed'
  if (mode === 'collapsed') return 'hidden'
  return 'expanded'
}

export default function AdminShell({
  activeSection,
  onSectionChange,
  onExit,
  navBadges = {},
  allowedSections,
  roleLabel = 'Sin rol',
  restrictedNav = false,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarMode, setSidebarMode] = useState(readStoredSidebarMode)
  const { t } = useI18n()

  const collapsed = sidebarMode === 'collapsed'
  const sidebarHidden = sidebarMode === 'hidden'

  const navGroups = useMemo(() => {
    let groups
    if (restrictedNav === 'pluUsa') {
      groups = ADMIN_NAV_GROUPS.filter((group) => group.labelKey === 'admin.nav.groups.pluUsa')
    } else if (restrictedNav === 'checkin') {
      groups = ADMIN_NAV_GROUPS
        .map((group) => ({ ...group, items: group.items.filter(([key]) => key === 'checkin') }))
        .filter((group) => group.items.length > 0)
    } else {
      groups = ADMIN_NAV_GROUPS
        .map((group) => ({
          ...group,
          items: group.items.filter(([key]) => !UNAVAILABLE_NAV_KEYS.has(key)),
        }))
        .filter((group) => group.items.length > 0)
    }

    if (!Array.isArray(allowedSections) || allowedSections.length === 0) return groups
    const allowed = new Set(allowedSections)
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(([key]) => allowed.has(key)),
      }))
      .filter((group) => group.items.length > 0)
  }, [allowedSections, restrictedNav])

  const canGoDashboard = useMemo(
    () => navGroups.some((group) => group.items.some(([key]) => key === 'dashboard')),
    [navGroups],
  )

  const activeLabel = useMemo(() => {
    const match = ADMIN_NAV_GROUPS.flatMap((group) => group.items).find(([key]) => key === activeSection)
    return match?.[1] ? t(match[1]) : t('admin.shell.defaultSection')
  }, [activeSection, t])

  const collapseToggleMeta = useMemo(() => {
    if (sidebarMode === 'expanded') {
      return {
        label: t('admin.shell.collapseSidebar'),
        icon: ChevronLeft,
      }
    }
    if (sidebarMode === 'collapsed') {
      return {
        label: t('admin.shell.hideSidebar'),
        icon: PanelLeftClose,
      }
    }
    return {
      label: t('admin.shell.showSidebar'),
      icon: PanelLeft,
    }
  }, [sidebarMode, t])

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
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, sidebarMode)
      // Compat con historias/tests que aún leen el flag viejo.
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarMode === 'expanded' ? '0' : '1')
    } catch {
      // localStorage puede no estar disponible (modo privado); no bloquea la UI.
    }
  }, [sidebarMode])

  function handleSectionChange(key) {
    onSectionChange(key)
    setSidebarOpen(false)
  }

  const brandMark = (
    <div className="admin-shell__brand-mark">
      <BrandLogo
        variant="argentina"
        imgClassName="admin-shell__brand-logo"
        height={28}
      />
    </div>
  )

  const CollapseIcon = collapseToggleMeta.icon
  const revealMenuLabel = sidebarHidden
    ? t('admin.shell.showSidebar')
    : sidebarOpen
      ? t('admin.shell.closeMenu')
      : t('admin.shell.openMenu')

  function handleChromeMenuClick() {
    if (sidebarHidden) {
      setSidebarMode('collapsed')
      // En phone el rail no se ve: hay que abrir el drawer.
      const isPhone =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      setSidebarOpen(isPhone)
      return
    }
    setSidebarOpen((open) => !open)
  }

  return (
    <div
      className={`admin-shell${sidebarOpen ? ' admin-shell--nav-open' : ''}${
        collapsed ? ' admin-shell--collapsed' : ''
      }${sidebarHidden ? ' admin-shell--sidebar-hidden' : ''}`}
    >
      <button
        type="button"
        className="admin-shell__backdrop"
        aria-label={t('admin.shell.closeMenu')}
        onClick={() => setSidebarOpen(false)}
      />
      {!sidebarHidden ? (
        <button
          type="button"
          className="admin-shell__collapse-toggle"
          aria-label={collapseToggleMeta.label}
          title={collapseToggleMeta.label}
          aria-pressed={sidebarMode !== 'expanded'}
          onClick={() => setSidebarMode((mode) => nextSidebarMode(mode))}
        >
          <CollapseIcon size={14} strokeWidth={2.2} />
        </button>
      ) : null}
      <aside
        className={`admin-shell__sidebar${sidebarOpen ? ' is-open' : ''}`}
        aria-hidden={sidebarHidden && !sidebarOpen ? true : undefined}
      >
        <div className="admin-shell__brand">
          <div className="admin-shell__brand-inner">
            {canGoDashboard ? (
              <button
                type="button"
                className="admin-shell__brand-home"
                aria-label={t('admin.shell.goToDashboard')}
                title={collapsed || sidebarHidden ? t('admin.shell.goToDashboard') : undefined}
                onClick={() => handleSectionChange('dashboard')}
              >
                {brandMark}
              </button>
            ) : (
              brandMark
            )}
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
            {navGroups.map((group) => {
              const groupLabel = t(group.labelKey)

              return (
                <div key={group.labelKey} className="admin-shell__group">
                  <span className="admin-shell__group-label">{groupLabel}</span>
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
                        aria-label={label}
                        title={collapsed || sidebarHidden ? label : undefined}
                        onClick={() => handleSectionChange(key)}
                      >
                        <span className="admin-shell__nav-icon" aria-hidden>
                          <Icon size={collapsed || sidebarHidden ? 18 : 16} strokeWidth={1.75} />
                        </span>
                        <span className="admin-shell__nav-label">
                          <span className="admin-shell__nav-label-meta">{groupLabel}</span>
                          <span className="admin-shell__nav-label-text">{label}</span>
                        </span>
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
              )
            })}
          </nav>
        </div>

        <div className="admin-shell__footer">
          <div
            className="admin-shell__account"
            title={collapsed || sidebarHidden ? roleLabel : undefined}
          >
            <span
              className="admin-shell__account-mark"
              role="img"
              aria-label={roleLabel}
              title={roleLabel}
            />
            <div className="admin-shell__account-copy">
              <strong className="admin-shell__account-role">{roleLabel}</strong>
              <span className="admin-shell__account-hint">{t('admin.shell.activeProfile')}</span>
            </div>
          </div>

          <div className="admin-shell__prefs" role="group" aria-label={t('admin.shell.prefsAria')}>
            <ThemeToggle compact />
            <LanguageToggle compact variant={collapsed || sidebarHidden ? 'glyph' : 'segment'} />
          </div>

          <button
            type="button"
            className="admin-shell__exit"
            onClick={onExit}
            title={collapsed || sidebarHidden ? t('admin.shell.exit') : undefined}
            aria-label={t('admin.shell.exit')}
          >
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            <span className="admin-shell__exit-label">{t('admin.shell.exit')}</span>
          </button>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className={`admin-mobile-bar${sidebarHidden ? ' admin-mobile-bar--reveal' : ''}`}>
          <button
            type="button"
            className={`admin-mobile-bar__menu${sidebarOpen ? ' is-active' : ''}${
              sidebarHidden ? ' admin-mobile-bar__menu--reveal' : ''
            }`}
            aria-label={revealMenuLabel}
            title={revealMenuLabel}
            aria-expanded={sidebarHidden ? false : sidebarOpen}
            onClick={handleChromeMenuClick}
          >
            {sidebarHidden ? (
              <PanelLeft size={18} strokeWidth={2} />
            ) : sidebarOpen ? (
              <X size={20} />
            ) : (
              <Menu size={20} />
            )}
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
