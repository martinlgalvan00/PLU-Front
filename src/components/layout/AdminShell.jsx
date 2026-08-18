import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Drawer, Button, Typography, Space, Badge, Dropdown } from 'antd'
import {
  Activity,
  BadgeDollarSign,
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Check,
  ChevronLeft,
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
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { TOUR_MODES, useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAdminIntroTourSteps, getTourForSection } from '../../lib/adminTourSteps.js'
import { ADMIN_NAV_GROUPS } from '../../lib/content.js'

const { Header, Sider, Content } = Layout
const { Text } = Typography

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

const ALERT_BADGE_KEYS = new Set(['payments', 'registrations'])
const UNAVAILABLE_NAV_KEYS = new Set(['results', 'exports', 'checkin'])
const PINNED_NAV_KEY = 'dashboard'
const SIDEBAR_MODE_STORAGE_KEY = 'plu-admin-sidebar-mode'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'plu-admin-sidebar-collapsed'
const SIDEBAR_MODES = ['expanded', 'collapsed', 'hidden']
const PHONE_DRAWER_MQ = '(max-width: 767px)'

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
  const badgeCount = Number(navBadges[key]) || 0
  const isAlert = ALERT_BADGE_KEYS.has(key)

  return {
    key,
    title: t(labelKey),
    icon: <Icon size={16} strokeWidth={1.75} />,
    label: (
      <div className="admin-shell__menu-label">
        <span>{t(labelKey)}</span>
        {badgeCount > 0 && (
          <Badge
            count={badgeCount}
            style={{
              backgroundColor: isAlert ? 'var(--color-brand-red)' : 'var(--color-brand-celeste)',
              color: '#fff',
            }}
          />
        )}
      </div>
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
  restrictedNav = false,
  onOpenAccount,
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
        items: group.items.filter(([key]) => !UNAVAILABLE_NAV_KEYS.has(key)),
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

  const activeLabel = useMemo(() => {
    const match = ADMIN_NAV_GROUPS.flatMap((group) => group.items).find(
      ([key]) => key === activeSection,
    )
    return match?.[1] ? t(match[1]) : t('admin.shell.defaultSection')
  }, [activeSection, t])

  const collapseToggleMeta = useMemo(() => {
    if (sidebarMode === 'expanded')
      return { label: t('admin.shell.collapseSidebar'), icon: ChevronLeft }
    if (sidebarMode === 'collapsed')
      return { label: t('admin.shell.hideSidebar'), icon: PanelLeftClose }
    return { label: t('admin.shell.showSidebar'), icon: PanelLeft }
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

  const brandMark = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 40,
        width: 40,
        flexShrink: 0,
      }}
    >
      <BrandLogo variant="argentina" height={28} />
    </div>
  )

  const CollapseIcon = collapseToggleMeta.icon

  const sidebarContent = (
    <div className="admin-shell__sidebar-inner">
      <div className="admin-shell__brand">
        {brandMark}
        {(!collapsed || isPhoneViewport) && (
          <div className="admin-shell__brand-copy">
            <Text strong className="admin-shell__brand-name">
              {t('brand.name')}
            </Text>
            <Text type="secondary" className="admin-shell__brand-subtitle">
              {restrictedNav === 'pluUsa'
                ? t('admin.shell.brandTagPartner')
                : restrictedNav === 'checkin'
                  ? t('admin.shell.brandSubtitleSecurity')
                  : t('admin.shell.brandTag')}
            </Text>
          </div>
        )}
      </div>

      <div className="admin-shell__nav-body" data-tour="admin-nav">
        {pinnedMenuItems.length > 0 && (
          <div className="admin-shell__nav-pin">
            <Menu
              className="admin-shell__pin-menu"
              mode="inline"
              inlineCollapsed={collapsed && !isPhoneViewport}
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
            inlineCollapsed={collapsed && !isPhoneViewport}
            selectedKeys={[activeSection]}
            items={menuItems}
            onClick={({ key }) => handleSectionChange(key)}
          />
        </div>
      </div>

      <div className="admin-shell__footer">
        <Space orientation="vertical" style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: !collapsed || isPhoneViewport ? 'flex-start' : 'center',
              width: '100%',
            }}
          >
            {onOpenAccount ? (
              <Button
                type="text"
                onClick={onOpenAccount}
                style={{ padding: 0, height: 'auto', textAlign: 'left', width: '100%' }}
              >
                <Space>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--plu-success-400)',
                    }}
                  />
                  {(!collapsed || isPhoneViewport) && (
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {roleLabel}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {t('staffAccount.dialogEyebrow')}
                      </div>
                    </div>
                  )}
                </Space>
              </Button>
            ) : (
              <Space>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--plu-success-400)',
                  }}
                />
                {(!collapsed || isPhoneViewport) && (
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {roleLabel}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {t('admin.shell.activeProfile')}
                    </div>
                  </div>
                )}
              </Space>
            )}
          </div>

          <Button
            type="text"
            icon={<ArrowLeft size={16} />}
            onClick={onExit}
            block={!collapsed || isPhoneViewport}
            style={{ justifyContent: !collapsed || isPhoneViewport ? 'flex-start' : 'center' }}
          >
            {(!collapsed || isPhoneViewport) && t('admin.shell.exit')}
          </Button>
        </Space>
      </div>
    </div>
  )

  return (
    <Layout
      className={`admin-shell${sidebarHidden ? ' admin-shell--sidebar-hidden' : ''}${collapsed && !isPhoneViewport ? ' admin-shell--collapsed' : ''}`}
    >
      {!isPhoneViewport && !sidebarHidden && (
        <>
          <Sider
            trigger={null}
            collapsible
            collapsed={collapsed}
            width={260}
            collapsedWidth={88}
            className="admin-shell__sidebar-component"
          >
            {sidebarContent}
          </Sider>
          <button
            className="admin-shell__collapse-toggle"
            onClick={() => setSidebarMode(nextSidebarMode(sidebarMode))}
            title={collapseToggleMeta.label}
            aria-label={collapseToggleMeta.label}
          >
            <CollapseIcon size={14} className="admin-shell__collapse-icon" />
          </button>
        </>
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
          size={260}
          className="admin-shell__drawer"
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout className="admin-shell__main">
        <Header className="admin-shell__header">
          <Space>
            {isPhoneViewport && (
              <Button
                type="text"
                icon={<MenuIcon size={20} />}
                onClick={() => setSidebarOpen(true)}
              />
            )}
            <div className="admin-shell__header-copy">
              <div className="admin-shell__breadcrumb">
                {t('admin.shell.breadcrumbRoot')} / {activeLabel}
              </div>
            </div>
          </Space>

          <div className="admin-shell__header-actions">
            {sidebarHidden && !isPhoneViewport && (
              <button
                className="admin-mobile-bar__menu--reveal"
                onClick={() => setSidebarMode('collapsed')}
                title={t('admin.shell.showSidebar')}
                aria-label={t('admin.shell.showSidebar')}
              >
                <PanelLeft size={16} />
              </button>
            )}
            <LanguageToggle compact variant="segment" />
            <ThemeToggle compact />
            <Dropdown
              menu={{ items: tourMenuItems, onClick: handleTourMenuClick }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button
                type="text"
                icon={<HelpCircle size={18} />}
                aria-label={t('admin.tour.startAria')}
                data-tour="admin-help"
              />
            </Dropdown>
          </div>
        </Header>
        <Content className="admin-shell__content">{children}</Content>
      </Layout>
    </Layout>
  )
}
