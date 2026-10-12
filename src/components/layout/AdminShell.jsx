import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Drawer, Dropdown } from 'antd'
import {
  Activity,
  BadgeDollarSign,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  LayoutDashboard,
  LayoutGrid,
  Landmark,
  KeyRound,
  HelpCircle,
  Menu as MenuIcon,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  ScanLine,
  ScrollText,
  Shield,
  ShoppingBag,
  Trophy,
  Users,
} from 'lucide-react'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'
import AdminGlobalSearch from '../admin/AdminGlobalSearch.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { TOUR_MODES, useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAdminIntroTourSteps, getTourForSection } from '../../lib/adminTourSteps.js'
import { ADMIN_NAV_GROUPS } from '../../lib/content.js'
import { initials } from '../../lib/format.js'

const { Header, Sider, Content } = Layout

const ICONS = {
  Activity,
  BadgeDollarSign,
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
  Landmark,
}

const ALERT_BADGE_KEYS = new Set(['payments', 'registrations', 'people'])
// El contador de "por validar" seguía viviendo bajo la clave 'registrations'
// (getAdminNavBadges / sus tests) desde que esa era su propia entrada de
// menú. "Personas" la reemplaza en la barra, así que el badge se resuelve
// por alias en vez de duplicar el cálculo o renombrar esa clave.
const NAV_BADGE_ALIASES = { people: 'registrations' }
// Ítems ocultos de la barra lateral: 'results' y 'exports' todavía caen en
// `PlaceholderSection', y el check-in se opera desde la consola de cada
// evento (Eventos → Consola → Check-in), no como sección de navegación propia.
const HIDDEN_NAV_KEYS = new Set(['results', 'exports', 'checkin'])
const PINNED_NAV_KEY = 'dashboard'
const SIDEBAR_MODE_STORAGE_KEY = 'plu-admin-sidebar-mode'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'plu-admin-sidebar-collapsed'
const SIDEBAR_MODES = ['expanded', 'collapsed', 'hidden']
const PHONE_DRAWER_MQ = '(max-width: 767px)'
const SIDEBAR_WIDTH = 248
const SIDEBAR_RAIL_WIDTH = 72

function splitPinnedNav(groups) {
  let pinnedItem = null
  const scrollGroups = []
  for (const group of groups) {
    const items = []
    for (const item of group.items) {
      if (item[0] === PINNED_NAV_KEY && pinnedItem == null) {
        pinnedItem = item
        continue
      }
      items.push(item)
    }
    if (items.length > 0) scrollGroups.push({ ...group, items })
  }
  return { pinnedItem, scrollGroups }
}

function toMenuItem([key, labelKey, iconName], navBadges, t) {
  const Icon = ICONS[iconName]
  const badgeCount = Number(navBadges[key] ?? navBadges[NAV_BADGE_ALIASES[key]]) || 0
  const isAlert = ALERT_BADGE_KEYS.has(key)

  return {
    key,
    title: t(labelKey),
    // En el rail colapsado no entra el número: el ícono lleva un punto y el
    // contador completo queda para la barra expandida.
    icon: (
      <span className="admin-shell__icon">
        <Icon size={17} strokeWidth={1.5} aria-hidden />
        {badgeCount > 0 && (
          <span
            className={`admin-shell__dot${isAlert ? ' admin-shell__dot--alert' : ''}`}
            aria-hidden
          />
        )}
      </span>
    ),
    label: (
      <span className="admin-shell__menu-label">
        <span className="admin-shell__menu-text">{t(labelKey)}</span>
        {badgeCount > 0 && (
          <span className={`admin-shell__count${isAlert ? ' admin-shell__count--alert' : ''}`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </span>
    ),
  }
}

function useMatchMedia(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const media = window.matchMedia(query)
    function sync(event) {
      setMatches(event.matches)
    }
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [query])

  return matches
}

function readStoredSidebarMode() {
  if (typeof window === 'undefined') return 'collapsed'
  try {
    const stored = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)
    if (SIDEBAR_MODES.includes(stored)) return stored
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
  accountName = '',
  restrictedNav = false,
  onOpenAccount,
  athletes = [],
  events = [],
  onSelectAthlete,
  onSelectEvent,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarMode, setSidebarMode] = useState(readStoredSidebarMode)
  const { t } = useI18n()
  const { replayTour, tourMode, setTourMode } = useAdminTour()

  function handleReplayTour() {
    const tour = getTourForSection(activeSection, t) ?? {
      id: 'admin-intro',
      steps: getAdminIntroTourSteps(t),
    }
    replayTour(tour.id, tour.steps)
  }

  // Un solo control hace las dos cosas que pidió el usuario: repetir el tour
  // de la sección activa a demanda, y elegir si los tours se auto-abren una
  // vez, siempre, o nunca -- sin ir a buscar una pantalla de ajustes aparte.
  const tourMenuItems = [
    {
      key: 'replay',
      label: t('admin.tour.menuReplay'),
      icon: <PlayCircle size={14} aria-hidden />,
    },
    { type: 'divider' },
    { key: 'mode-label', label: t('admin.tour.menuModeLabel'), disabled: true },
    ...TOUR_MODES.map((mode) => ({
      key: `mode-${mode}`,
      label: t(`admin.tour.mode.${mode}`),
      icon:
        tourMode === mode ? (
          <Check size={14} aria-hidden />
        ) : (
          <span style={{ width: 14, display: 'inline-block' }} />
        ),
    })),
  ]

  function handleTourMenuClick({ key }) {
    if (key === 'replay') {
      handleReplayTour()
      return
    }
    if (key.startsWith('mode-')) {
      setTourMode(key.replace('mode-', ''))
    }
  }

  const collapsed = sidebarMode === 'collapsed'
  const sidebarHidden = sidebarMode === 'hidden'
  const isPhoneViewport = useMatchMedia(PHONE_DRAWER_MQ)
  const showLabels = !collapsed || isPhoneViewport

  const navGroups = useMemo(() => {
    let groups
    if (restrictedNav === 'pluUsa') {
      groups = ADMIN_NAV_GROUPS.filter((group) => group.labelKey === 'admin.nav.groups.pluUsa')
    } else if (restrictedNav === 'checkin') {
      groups = ADMIN_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(([key]) => key === 'checkin'),
      })).filter((group) => group.items.length > 0)
    } else {
      groups = ADMIN_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(([key]) => !HIDDEN_NAV_KEYS.has(key)),
      })).filter((group) => group.items.length > 0)
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

  const { pinnedItem, scrollGroups } = useMemo(() => splitPinnedNav(navGroups), [navGroups])

  const pinnedMenuItems = useMemo(
    () => (pinnedItem ? [toMenuItem(pinnedItem, navBadges, t)] : []),
    [pinnedItem, navBadges, t],
  )

  const menuItems = useMemo(() => {
    return scrollGroups.map((group) => ({
      type: 'group',
      label: t(group.labelKey),
      key: group.labelKey,
      children: group.items.map((item) => toMenuItem(item, navBadges, t)),
    }))
  }, [scrollGroups, navBadges, t])

  const canSearchAthletes =
    typeof onSelectAthlete === 'function' &&
    (!Array.isArray(allowedSections) || allowedSections.length === 0 || allowedSections.includes('athletes'))

  const activeLabel = useMemo(() => {
    const match = ADMIN_NAV_GROUPS.flatMap((group) => group.items).find(
      ([key]) => key === activeSection,
    )
    return match?.[1] ? t(match[1]) : t('admin.shell.defaultSection')
  }, [activeSection, t])

  // El ícono muestra a dónde lleva el próximo click: expandido → rail →
  // oculto → expandido. Vive en la barra superior (no flotando sobre el borde
  // del sidebar) para que exista también con el menú oculto.
  const panelToggleMeta = useMemo(() => {
    if (sidebarMode === 'expanded')
      return { label: t('admin.shell.collapseSidebar'), icon: PanelLeftClose }
    if (sidebarMode === 'collapsed')
      return { label: t('admin.shell.hideSidebar'), icon: PanelLeft }
    return { label: t('admin.shell.showSidebar'), icon: PanelLeftOpen }
  }, [sidebarMode, t])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, sidebarMode)
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        sidebarMode === 'expanded' ? '0' : '1',
      )
    } catch {}
  }, [sidebarMode])

  function handleSectionChange(key) {
    onSectionChange(key)
    setSidebarOpen(false)
  }

  const PanelToggleIcon = panelToggleMeta.icon
  const accountLabel = accountName || roleLabel
  const accountContent = (
    <>
      <span className="admin-shell__avatar" aria-hidden>
        {initials(accountLabel)}
      </span>
      {showLabels && (
        <span className="admin-shell__account-copy">
          <span className="admin-shell__account-name">{roleLabel}</span>
          <span className="admin-shell__account-hint">
            {onOpenAccount ? t('staffAccount.dialogEyebrow') : t('admin.shell.activeProfile')}
          </span>
        </span>
      )}
      {showLabels && onOpenAccount ? (
        <ChevronRight size={14} strokeWidth={1.5} className="admin-shell__account-chevron" aria-hidden />
      ) : null}
    </>
  )

  const sidebarContent = (
    <div className="admin-shell__sidebar-inner">
      <div className="admin-shell__brand">
        <span className="admin-shell__brand-mark">
          <BrandLogo variant="argentina" height={26} />
        </span>
        {showLabels && (
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
        )}
      </div>

      <div className="admin-shell__nav-body" data-tour="admin-nav">
        {pinnedMenuItems.length > 0 && (
          <div className="admin-shell__nav-pin">
            <Menu
              className="admin-shell__pin-menu"
              mode="inline"
              inlineCollapsed={!showLabels}
              selectedKeys={[activeSection]}
              items={pinnedMenuItems}
              onClick={({ key }) => handleSectionChange(key)}
            />
          </div>
        )}
        <div className="admin-shell__nav-scroll">
          <Menu
            className="admin-shell__scroll-menu"
            mode="inline"
            inlineCollapsed={!showLabels}
            selectedKeys={[activeSection]}
            items={menuItems}
            onClick={({ key }) => handleSectionChange(key)}
          />
        </div>
      </div>

      <div className="admin-shell__footer">
        {onOpenAccount ? (
          <button
            type="button"
            className="admin-shell__account"
            onClick={onOpenAccount}
            title={!showLabels ? `${roleLabel} · ${t('staffAccount.dialogEyebrow')}` : undefined}
            aria-label={`${roleLabel} · ${t('staffAccount.dialogEyebrow')}`}
          >
            {accountContent}
          </button>
        ) : (
          <div className="admin-shell__account admin-shell__account--static">{accountContent}</div>
        )}
        <button
          type="button"
          className="admin-shell__exit"
          onClick={onExit}
          title={!showLabels ? t('admin.shell.exit') : undefined}
          aria-label={t('admin.shell.exit')}
        >
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
          {showLabels && <span>{t('admin.shell.exit')}</span>}
        </button>
      </div>
    </div>
  )

  return (
    <Layout
      className={`admin-shell${sidebarHidden ? ' admin-shell--sidebar-hidden' : ''}${collapsed && !isPhoneViewport ? ' admin-shell--collapsed' : ''}`}
    >
      <a className="admin-shell__skip-link" href="#admin-main-content">
        {t('admin.shell.skipToContent')}
      </a>
      {!isPhoneViewport && !sidebarHidden && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={SIDEBAR_WIDTH}
          collapsedWidth={SIDEBAR_RAIL_WIDTH}
          className="admin-shell__sidebar-component"
        >
          {sidebarContent}
        </Sider>
      )}

      {isPhoneViewport && (
        <Drawer
          placement="left"
          onClose={() => setSidebarOpen(false)}
          open={sidebarOpen}
          closable={false}
          styles={{
            body: { padding: 0, height: '100%', display: 'flex', flexDirection: 'column' },
          }}
          size={SIDEBAR_WIDTH + 12}
          className="admin-shell__drawer"
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout className="admin-shell__main">
        <Header className="admin-shell__header">
          <div className="admin-shell__header-lead">
            {isPhoneViewport ? (
              <button
                type="button"
                className="admin-shell__icon-button"
                onClick={() => setSidebarOpen(true)}
                aria-label={t('admin.shell.showSidebar')}
              >
                <MenuIcon size={18} strokeWidth={1.5} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className="admin-shell__icon-button"
                onClick={() => setSidebarMode(nextSidebarMode(sidebarMode))}
                title={panelToggleMeta.label}
                aria-label={panelToggleMeta.label}
              >
                <PanelToggleIcon size={18} strokeWidth={1.5} aria-hidden />
              </button>
            )}
            <div className="admin-shell__header-copy">
              <nav
                className="admin-shell__breadcrumb"
                aria-label={t('admin.shell.breadcrumbAria')}
              >
                <ol className="admin-shell__breadcrumb-list">
                  <li className="admin-shell__breadcrumb-item">
                    {t('admin.shell.breadcrumbRoot')}
                  </li>
                  <li className="admin-shell__breadcrumb-item" aria-current="page">
                    {activeLabel}
                  </li>
                </ol>
              </nav>
            </div>
          </div>

          {canSearchAthletes && !isPhoneViewport ? (
            <div className="admin-shell__header-search">
              <AdminGlobalSearch
                athletes={athletes}
                events={events}
                onSelectAthlete={onSelectAthlete}
                onSelectEvent={onSelectEvent}
              />
            </div>
          ) : null}

          <div className="admin-shell__header-actions">
            <LanguageToggle compact variant="segment" />
            <ThemeToggle compact />
            <Dropdown
              menu={{ items: tourMenuItems, onClick: handleTourMenuClick }}
              trigger={['click']}
              placement="bottomRight"
            >
              <button
                type="button"
                className="admin-shell__icon-button"
                aria-label={t('admin.tour.startAria')}
                data-tour="admin-help"
              >
                <HelpCircle size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </Dropdown>
          </div>
        </Header>
        <Content id="admin-main-content" tabIndex={-1} className="admin-shell__content">
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
