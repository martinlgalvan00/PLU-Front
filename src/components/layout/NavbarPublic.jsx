import { Fragment, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, m } from 'motion/react'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  IdCard,
  ListChecks,
  LogOut,
  Mail,
  Scale,
  ShoppingBag,
  Trophy,
  UsersRound,
  X,
} from 'lucide-react'
import { PUBLIC_NAVIGATION } from '../../lib/constants.js'
import { sessionDisplayName, sessionInitial, sessionPhotoUrl } from '../../lib/format.js'
import { canViewAdmin } from '../../lib/roles.js'
import { useHeaderScroll } from '../../hooks/useMotion.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_EASE } from '../../motion/tokens.ts'
import BrandLogo from '../ui/BrandLogo.jsx'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'

const NAV_ICON = {
  book: BookOpen,
  calendar: CalendarDays,
  community: UsersRound,
  help: CircleHelp,
  mail: Mail,
  member: IdCard,
  results: ListChecks,
  records: Scale,
  shop: ShoppingBag,
  trophy: Trophy,
}

const COMPETITIONS_NAVIGATION = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'competitions')
const RESOURCES_NAVIGATION = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'resources')

function SharedActiveIndicator() {
  const { reducedMotion } = useMotionConfig()

  return (
    <m.span
      className="plu-global-nav__indicator"
      layoutId="plu-public-nav-active-indicator"
      aria-hidden
      transition={reducedMotion
        ? { duration: 0.01 }
        : { type: 'spring', stiffness: 460, damping: 42, mass: 0.72 }}
    />
  )
}

function NavLink({ active, children, icon: Icon, onClick, tone = 'default' }) {
  return (
    <button
      type="button"
      className={`plu-global-nav__link${tone !== 'default' ? ` plu-global-nav__link--${tone}` : ''}${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {Icon ? <Icon className="plu-global-nav__link-icon" size={14} aria-hidden /> : null}
      {children}
      {active ? <SharedActiveIndicator /> : null}
    </button>
  )
}

function NavDropdownItem({ active = false, description, icon: Icon, label, onClick, tone = 'default' }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`plu-nav-menu__item plu-nav-menu__item--${tone}${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {Icon ? <span className="plu-nav-menu__icon"><Icon size={17} aria-hidden /></span> : null}
      <span className="plu-nav-menu__copy"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <ArrowRight size={14} aria-hidden />
    </button>
  )
}

function NavDropdown({ active, children, label, menuId, open, onClose, onToggle, variant = 'compact' }) {
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const { reducedMotion } = useMotionConfig()

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) onClose()
    }
    function handleFocus(event) {
      if (!rootRef.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('focusin', handleFocus)
    }
  }, [onClose, open])

  function menuItems() {
    return Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])
  }

  function focusItem(index) {
    const items = menuItems()
    if (!items.length) return
    items[(index + items.length) % items.length]?.focus()
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      onClose()
      return
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    if (!open) onToggle()
    window.requestAnimationFrame(() => focusItem(event.key === 'ArrowDown' ? 0 : -1))
  }

  function handleMenuKeyDown(event) {
    const items = menuItems()
    const currentIndex = items.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      triggerRef.current?.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusItem(currentIndex + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusItem(currentIndex - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(-1)
    } else if (event.key === 'Tab') {
      onClose()
    }
  }

  return (
    <div className="plu-global-nav__dropdown" data-open={open || undefined} ref={rootRef}>
      <button
        type="button"
        id={`${menuId}-trigger`}
        className={`plu-global-nav__link plu-global-nav__trigger${active ? ' is-active' : ''}`}
        aria-controls={menuId}
        aria-current={active ? 'page' : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        ref={triggerRef}
        onClick={onToggle}
        onKeyDown={handleTriggerKeyDown}
      >
        {label}<ChevronDown size={13} aria-hidden />{active ? <SharedActiveIndicator /> : null}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            key={menuId}
            className={`plu-nav-menu plu-nav-menu--${variant}`}
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-labelledby={`${menuId}-trigger`}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reducedMotion
              ? { opacity: 0, transition: { duration: 0.01 } }
              : {
                  opacity: 0,
                  y: 4,
                  scale: 0.995,
                  filter: 'blur(1px)',
                  transition: { duration: 0.14, ease: [0.2, 0, 0, 1] },
                }}
            transition={{ duration: reducedMotion ? 0.08 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            onKeyDown={handleMenuKeyDown}
          >
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function DrawerRowIndicator() {
  const { reducedMotion } = useMotionConfig()

  return (
    <m.span
      className="plu-drawer__row-indicator"
      layoutId="plu-drawer-active-indicator"
      aria-hidden
      transition={reducedMotion
        ? { duration: 0.01 }
        : { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }}
    />
  )
}

function DrawerRow({ active = false, children, delay = 0, description, feature = false, icon: Icon, iconSize, indent = false, onClick, reveal = true, tone = 'neutral' }) {
  const { reducedMotion } = useMotionConfig()
  const motionProps = reveal
    ? {
        initial: reducedMotion ? false : { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: reducedMotion ? 0.01 : 0.46, ease: MOTION_EASE.spring, delay: reducedMotion ? 0 : delay },
      }
    : {}

  return (
    <m.button
      type="button"
      className={`plu-drawer__row${indent ? ' plu-drawer__row--indent' : ''}${feature ? ' plu-drawer__row--feature' : ''}${Icon ? '' : ' plu-drawer__row--flush'}${tone !== 'neutral' ? ` plu-drawer__row--${tone}` : ''}${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      {...motionProps}
    >
      {Icon ? <Icon className="plu-drawer__row-icon" size={iconSize ?? (indent ? 16 : 20)} strokeWidth={1.6} aria-hidden /> : null}
      <span className="plu-drawer__row-copy">
        <strong>{children}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <ArrowRight className="plu-drawer__row-arrow" size={indent ? 13 : 14} aria-hidden />
      {active ? <DrawerRowIndicator /> : null}
    </m.button>
  )
}

const DRAWER_SECONDARY = [
  { key: 'rulebook', labelKey: 'nav.rulebook' },
  { key: 'faq', labelKey: 'nav.faq' },
  { key: 'community', labelKey: 'nav.community' },
  { key: 'contact', labelKey: 'nav.contact' },
]

export default function NavbarPublic({ activeView, latestEvent, onLogout, onNavigate, session }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dropdown, setDropdown] = useState(null)
  const shellRef = useRef(null)
  const drawerRef = useRef(null)
  const closeRef = useRef(null)
  const menuButtonRef = useRef(null)
  const restoreDrawerFocusRef = useRef(true)
  const scrolled = useHeaderScroll(shellRef)
  const { reducedMotion } = useMotionConfig()
  const { locale, t } = useI18n()

  const adminSession = canViewAdmin(session)
  const sessionFullName = session ? sessionDisplayName(session) : ''
  const sessionInitialLetter = session ? sessionInitial(session) : ''
  const sessionPhoto = session ? sessionPhotoUrl(session) : ''
  const competitionsActive = COMPETITIONS_NAVIGATION.views.includes(activeView)
  const resourcesActive = RESOURCES_NAVIGATION.views.includes(activeView)

  const latestEventTitle = latestEvent?.title ?? t('nav.pitbull')
  const latestEventView = latestEvent?.featured || latestEvent?.slug === 'pitbull-classic-2026' ? 'pitbull' : 'events'
  const latestEventActive = activeView === latestEventView

  const resourceGroups = RESOURCES_NAVIGATION.groups.map((group) => ({
    label: t(group.labelKey),
    items: group.items.map((item) => ({
      ...item,
      icon: NAV_ICON[item.icon],
      label: t(item.labelKey),
      hint: t(item.hintKey),
    })),
  }))

  const drawerSecondary = DRAWER_SECONDARY.map((item) => ({
    ...item,
    label: t(item.labelKey),
    active: activeView === item.key || (item.key === 'rulebook' && activeView === 'resources'),
  }))

  function go(view) {
    restoreDrawerFocusRef.current = false
    onNavigate?.(view)
    setDrawerOpen(false)
    setDropdown(null)
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  function closeDrawer(restoreFocus = true) {
    restoreDrawerFocusRef.current = restoreFocus
    setDrawerOpen(false)
  }

  function openDrawer() {
    restoreDrawerFocusRef.current = true
    setDropdown(null)
    setDrawerOpen(true)
  }

  useEffect(() => {
    if (!drawerOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const backgroundNodes = Array.from(shellRef.current?.parentElement?.children ?? [])
      .filter((node) => node !== shellRef.current)
      .map((node) => ({ inert: node.inert, node }))
    document.body.style.overflow = 'hidden'
    backgroundNodes.forEach(({ node }) => { node.inert = true })
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer(true)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = drawerRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      backgroundNodes.forEach(({ inert, node }) => { node.inert = inert })
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [drawerOpen])

  function handleDrawerExitComplete() {
    if (restoreDrawerFocusRef.current) menuButtonRef.current?.focus()
  }

  useEffect(() => {
    function onEscape(event) {
      if (event.key === 'Escape') setDropdown(null)
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [])

  const overHero = ['home', 'pitbull', 'tickets'].includes(activeView)

  return (
    <div ref={shellRef} className={`site-header-shell site-header-shell--institutional${drawerOpen ? ' site-header-shell--menu-open' : ''}`}>
      <a className="skip-link" href="#main-content">{t('nav.skipContent')}</a>
      <header
        className={`site-header site-header--lux site-header--institutional${scrolled ? ' site-header--scrolled' : ''}${overHero ? ' site-header--over-hero' : ''}`}
        inert={drawerOpen ? true : undefined}
      >
        <div className="plu-global-nav">
          <button
            type="button"
            className={`plu-global-nav__brand${activeView === 'home' ? ' is-active' : ''}`}
            aria-current={activeView === 'home' ? 'page' : undefined}
            aria-label={t('nav.home')}
            onClick={() => go('home')}
          >
            <BrandLogo variant="argentina" imgClassName="plu-global-nav__emblem" height={34} />
            <span>
              <BrandLogo variant="letterhead" letterheadBlend imgClassName="plu-global-nav__letterhead" height={24} />
              <small>{t('brand.federationLine')}</small>
            </span>
          </button>

          <nav className="plu-global-nav__desktop" aria-label={t('nav.mainAria')}>
            <LayoutGroup id={`plu-public-navigation-${locale}`}>
              <NavLink active={activeView === 'members'} icon={IdCard} tone="affiliate" onClick={() => go('members')}>
                {t('nav.members')}
              </NavLink>
              <NavLink active={activeView === 'events'} onClick={() => go('events')}>
                {t('nav.calendarOfficial')}
              </NavLink>
              <NavDropdown
              active={competitionsActive}
              label={t('nav.competitions')}
              menuId="plu-competitions-menu"
              open={dropdown === 'competitions'}
              onClose={() => setDropdown(null)}
              onToggle={() => setDropdown((current) => current === 'competitions' ? null : 'competitions')}
            >
              <p className="plu-nav-menu__label">{t('nav.competitionMenuLabel')}</p>
              {COMPETITIONS_NAVIGATION.items.map(({ key, featured, icon }) => {
                const isFeaturedEvent = key === 'pitbull'
                const Icon = NAV_ICON[icon]
                return (
                  <NavDropdownItem
                    key={key}
                    active={isFeaturedEvent ? latestEventActive : [key, 'tickets'].includes(activeView)}
                    description={isFeaturedEvent && latestEvent?.date ? `${latestEvent.date} · ${latestEvent.venue}` : t(`nav.${key}Hint`)}
                    icon={Icon}
                    label={isFeaturedEvent ? latestEventTitle : t(`nav.${key}`)}
                    onClick={() => go(isFeaturedEvent ? latestEventView : key)}
                    tone={featured ? 'featured' : 'default'}
                  />
                )
              })}
              <button type="button" role="menuitem" className="plu-nav-menu__footer" onClick={() => go('events')}>
                <span><CalendarDays size={14} aria-hidden />{t('nav.calendarOfficial')}</span><ArrowRight size={14} aria-hidden />
              </button>
              </NavDropdown>
              <NavLink active={activeView === 'results'} onClick={() => go('results')}>{t('nav.results')}</NavLink>
              <NavLink active={activeView === 'records'} onClick={() => go('records')}>{t('nav.records')}</NavLink>
              <NavDropdown
              active={resourcesActive}
              label={t('nav.groupRecursos')}
              menuId="plu-resources-menu"
              open={dropdown === 'resources'}
              onClose={() => setDropdown(null)}
              onToggle={() => setDropdown((current) => current === 'resources' ? null : 'resources')}
              variant="resources"
            >
              <div className="plu-resources-menu__head" role="presentation">
                <div><p>{t('nav.resourcesMenuLabel')}</p><span>{t('nav.resourcesMenuIntro')}</span></div>
                <button type="button" role="menuitem" onClick={() => go('resources')}>
                  {t('nav.viewResources')}<ArrowRight size={14} aria-hidden />
                </button>
              </div>
              <div className="plu-resources-menu__groups" role="presentation">
                {resourceGroups.map((group) => (
                  <div key={group.label} className="plu-resources-menu__group" role="presentation">
                    <p>{group.label}</p>
                    {group.items.map((item, index) => (
                      <NavDropdownItem
                        key={`${group.label}-${item.key}-${index}`}
                        active={activeView === item.key}
                        description={item.hint}
                        icon={item.icon}
                        label={item.label}
                        onClick={() => go(item.key)}
                      />
                    ))}
                  </div>
                ))}
              </div>
              </NavDropdown>
            </LayoutGroup>
          </nav>

          <div className="plu-global-nav__actions">
            <div className="plu-global-nav__preferences"><ThemeToggle compact /><LanguageToggle compact /></div>
            {session ? (
              <div className="plu-global-nav__account">
                <button type="button" className="plu-global-nav__profile" aria-label={sessionFullName} title={sessionFullName} onClick={() => go(adminSession ? 'admin' : 'profile')}>
                  <span aria-hidden>{sessionPhoto ? <img src={sessionPhoto} alt="" /> : sessionInitialLetter}</span>
                </button>
                <button type="button" className="plu-global-nav__logout" aria-label={t('nav.logout')} title={t('nav.logout')} onClick={onLogout}><LogOut size={15} aria-hidden /></button>
              </div>
            ) : (
              <button
                type="button"
                className={`plu-global-nav__login${activeView === 'login' ? ' is-active' : ''}`}
                aria-current={activeView === 'login' ? 'page' : undefined}
                onClick={() => go('login')}
              >
                {t('nav.login')}
              </button>
            )}
          </div>

          <div className="plu-global-nav__mobile-actions">
            <div className={`plu-global-nav__mobile-cluster${drawerOpen ? ' is-menu-open' : ''}`}>
              <div className="plu-global-nav__mobile-prefs" aria-label={t('nav.preferences')}>
                <ThemeToggle compact />
                <LanguageToggle compact variant="segment" />
              </div>
              <span className="plu-global-nav__mobile-divider" aria-hidden />
              <button
                type="button"
                className="plu-global-nav__mobile-affiliate"
                aria-label={t('nav.members')}
                onClick={() => go('members')}
              >
                <IdCard size={14} aria-hidden />
                <span aria-hidden>{t('nav.members')}</span>
              </button>
              <span className="plu-global-nav__mobile-divider" aria-hidden />
              <button
                type="button"
                className="plu-global-nav__menu-button"
                aria-controls="plu-mobile-drawer"
                aria-expanded={drawerOpen}
                aria-label={drawerOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                ref={menuButtonRef}
                onClick={drawerOpen ? () => closeDrawer(true) : openDrawer}
              >
                <span aria-hidden><i /><i /><i /></span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence initial={false} onExitComplete={handleDrawerExitComplete}>
        {drawerOpen ? (
          <>
            <m.div
              key="drawer-backdrop"
              className="plu-drawer-backdrop"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: reducedMotion ? 0.01 : 0.2 } }}
              transition={{ duration: reducedMotion ? 0.01 : 0.24, ease: [0.2, 0, 0, 1] }}
              onClick={() => closeDrawer(true)}
            />
            <m.aside
              key="drawer-panel"
              className="plu-drawer"
              id="plu-mobile-drawer"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t('nav.mobileMenu')}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0.85, scale: 0.995, x: '100%' }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={reducedMotion
                ? { opacity: 0, transition: { duration: 0.01 } }
                : { opacity: 0, x: '100%', transition: { duration: 0.26, ease: [0.76, 0, 0.24, 1] } }}
              transition={{ duration: reducedMotion ? 0.01 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
            <m.header
              className="plu-drawer__head"
              initial={reducedMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.4, ease: MOTION_EASE.out }}
            >
              <div className="plu-drawer__head-bar">
                <button
                  type="button"
                  className={`plu-drawer__brand${activeView === 'home' ? ' is-active' : ''}`}
                  aria-current={activeView === 'home' ? 'page' : undefined}
                  aria-label={t('nav.home')}
                  onClick={() => go('home')}
                >
                  <BrandLogo variant="argentina" imgClassName="plu-drawer__emblem" height={34} />
                  <BrandLogo variant="letterhead" imgClassName="plu-drawer__logo" height={18} />
                </button>
                <button
                  type="button"
                  className="plu-drawer__close"
                  aria-label={t('nav.closeMenu')}
                  ref={closeRef}
                  onClick={() => closeDrawer(true)}
                >
                  <X size={18} strokeWidth={1.5} aria-hidden />
                </button>
              </div>

              <m.button
                type="button"
                className={`plu-drawer__cta${activeView === 'members' ? ' is-active' : ''}`}
                aria-current={activeView === 'members' ? 'page' : undefined}
                onClick={() => go('members')}
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.4, ease: MOTION_EASE.spring, delay: reducedMotion ? 0 : 0.05 }}
              >
                <span className="plu-drawer__cta-copy">
                  <small>{t('nav.calendarSeason')}</small>
                  <strong>{t('nav.affiliate')}</strong>
                </span>
                <ArrowRight className="plu-drawer__cta-arrow" size={16} strokeWidth={1.6} aria-hidden />
              </m.button>
            </m.header>

            <div className="plu-drawer__scroll">
              <LayoutGroup id={`plu-drawer-nav-${locale}`}>
                <nav className="plu-drawer__nav" aria-label={t('nav.mobileMenu')}>
                  <div className="plu-drawer__nav-primary">
                    <DrawerRow active={activeView === 'events'} delay={0.08} onClick={() => go('events')}>
                      {t('nav.calendarOfficial')}
                    </DrawerRow>

                    <DrawerRow
                      active={latestEventActive}
                      delay={0.12}
                      description={latestEvent?.date ?? t('nav.pitbullHint')}
                      onClick={() => go(latestEventView)}
                    >
                      {latestEventTitle}
                    </DrawerRow>

                    <DrawerRow
                      active={['shop', 'tickets'].includes(activeView)}
                      delay={0.16}
                      description={t('nav.shopHint')}
                      onClick={() => go('shop')}
                    >
                      {t('nav.shop')}
                    </DrawerRow>

                    <DrawerRow active={activeView === 'results'} delay={0.2} onClick={() => go('results')}>
                      {t('nav.results')}
                    </DrawerRow>
                    <DrawerRow active={activeView === 'records'} delay={0.24} onClick={() => go('records')}>
                      {t('nav.records')}
                    </DrawerRow>
                  </div>

                  <div className="plu-drawer__nav-secondary" aria-label={t('nav.groupRecursos')}>
                    {drawerSecondary.map((item, index) => (
                      <Fragment key={item.key}>
                        {index > 0 ? (
                          <span className="plu-drawer__nav-secondary-sep" aria-hidden>
                            ·
                          </span>
                        ) : null}
                        <DrawerRow
                          active={item.active}
                          delay={0.3 + index * 0.03}
                          onClick={() => go(item.key)}
                        >
                          {item.label}
                        </DrawerRow>
                      </Fragment>
                    ))}
                  </div>
                </nav>
              </LayoutGroup>
            </div>

            <footer className="plu-drawer__footer">
              <div className="plu-drawer__preferences" aria-label={t('nav.preferences')}>
                <ThemeToggle compact />
                <span className="plu-drawer__utility-sep" aria-hidden>
                  ·
                </span>
                <LanguageToggle compact />
              </div>

              {session ? (
                <div className="plu-drawer__footer-account">
                  <button
                    type="button"
                    className="plu-drawer__account-chip"
                    aria-label={
                      adminSession
                        ? `${sessionFullName || t('nav.myProfile')} · ${t('nav.admin')}`
                        : `${sessionFullName || t('nav.myProfile')} · ${t('nav.myProfile')}`
                    }
                    onClick={() => go(adminSession ? 'admin' : 'profile')}
                  >
                    <span className="plu-drawer__account-avatar" aria-hidden>
                      {sessionPhoto ? <img src={sessionPhoto} alt="" /> : sessionInitialLetter}
                    </span>
                    <span className="plu-drawer__account-meta">
                      <span className="plu-drawer__account-name">
                        {sessionFullName || t('nav.myProfile')}
                      </span>
                      <span className="plu-drawer__account-hint">
                        {adminSession ? t('nav.admin') : t('nav.myProfile')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="plu-drawer__account-logout"
                    aria-label={t('nav.logout')}
                    title={t('nav.logout')}
                    onClick={() => {
                      closeDrawer(false)
                      onLogout?.()
                    }}
                  >
                    <LogOut size={15} aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`plu-drawer__footer-login${activeView === 'login' ? ' is-active' : ''}`}
                  onClick={() => go('login')}
                >
                  {t('nav.login')}
                </button>
              )}
            </footer>
            </m.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
