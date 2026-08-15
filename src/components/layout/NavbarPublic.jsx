import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  Target,
  Trophy,
  UsersRound,
  X,
  User,
} from 'lucide-react'
import { PUBLIC_NAVIGATION } from '../../lib/constants.js'
import { getFeaturedEventDestination } from '../../lib/eventNavigation.js'
import { sessionDisplayName, sessionInitial, sessionPhotoUrl } from '../../lib/format.js'
import { canViewAdmin } from '../../lib/roles.js'
import { hasCurrentMembership } from '../../services/membershipService.js'
import { useHeaderScroll } from '../../hooks/useMotion.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../../motion/tokens.ts'
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
  standards: Target,
  trophy: Trophy,
}

const COMPETITION_NAVIGATION = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'competition')
const MORE_NAVIGATION = PUBLIC_NAVIGATION.primary.find(({ key }) => key === 'more')

function getVisibleTrigger(...elements) {
  const present = elements.filter(Boolean)
  return present.find((el) => {
    const { width, height } = el.getBoundingClientRect()
    return width > 0 && height > 0
  }) ?? present[0] ?? null
}

const PROFILE_MENU_MAX_WIDTH = 272
const PROFILE_MENU_GUTTER = 12
/** Mismo corte que el chrome mobile de `.plu-global-nav` (cluster + avatar). */
const PROFILE_MENU_CENTER_MAX_WIDTH = 799

function computeProfileMenuPosition(rect, viewportWidth) {
  const menuWidth = Math.min(PROFILE_MENU_MAX_WIDTH, viewportWidth - PROFILE_MENU_GUTTER * 2)
  const top = Math.round(rect.bottom + 10)
  const shouldCenter = viewportWidth <= PROFILE_MENU_CENTER_MAX_WIDTH
  const left = shouldCenter
    ? Math.round((viewportWidth - menuWidth) / 2)
    : Math.round(Math.min(
      Math.max(PROFILE_MENU_GUTTER, rect.right - menuWidth),
      viewportWidth - menuWidth - PROFILE_MENU_GUTTER,
    ))

  return { top, left }
}

/** Línea utilitaria horizontal del drawer (Reglamento vive acá, no en el top-level). */
const DRAWER_SECONDARY = [
  { key: 'rulebook', labelKey: 'nav.rulebook' },
  { key: 'team', labelKey: 'nav.team' },
  { key: 'sponsors', labelKey: 'nav.sponsors' },
  { key: 'standards', labelKey: 'nav.standards' },
  { key: 'faq', labelKey: 'nav.faq' },
  { key: 'contact', labelKey: 'nav.contact' },
]

function mapNavGroupItems(group, {
  activeView,
  latestEventActive,
  latestEventHint,
  latestEventTitle,
  t,
}) {
  return {
    label: t(group.labelKey),
    items: group.items.map((item) => ({
      ...item,
      icon: NAV_ICON[item.icon],
      label: item.key === 'pitbull' ? latestEventTitle : t(item.labelKey),
      hint: item.key === 'pitbull' ? latestEventHint : t(item.hintKey),
      active: item.key === 'pitbull' ? latestEventActive : activeView === item.key,
    })),
  }
}

function SharedActiveIndicator() {
  const { reducedMotion } = useMotionConfig()

  return (
    <m.span
      className="plu-global-nav__indicator"
      layoutId="plu-public-nav-active-indicator"
      aria-hidden
      transition={reducedMotion
        ? { duration: 0.01 }
        : { type: 'spring', stiffness: 320, damping: 36, mass: 0.85 }}
    />
  )
}

function NavLink({ active, hovered, children, icon: Icon, onClick, onHover, onLeave, tone = 'default' }) {
  const { reducedMotion } = useMotionConfig()

  return (
    <button
      type="button"
      className={`plu-global-nav__link${tone !== 'default' ? ` plu-global-nav__link--${tone}` : ''}${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {hovered ? (
        <m.span
          layoutId="plu-nav-hover-pill"
          className="plu-global-nav__hover-pill"
          aria-hidden
          transition={reducedMotion
            ? { duration: 0.01 }
            : { type: 'spring', stiffness: 340, damping: 34, mass: 0.7 }}
        />
      ) : null}
      <span className="plu-global-nav__link-content">
        {Icon ? <Icon className="plu-global-nav__link-icon" size={14} aria-hidden /> : null}
        {children}
      </span>
      {active ? <SharedActiveIndicator /> : null}
    </button>
  )
}

function NavDropdownItem({
  active = false,
  description,
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}) {
  const className = `plu-nav-menu__item plu-nav-menu__item--${tone}${active ? ' is-active' : ''}`

  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {Icon ? <span className="plu-nav-menu__icon"><Icon size={17} aria-hidden /></span> : null}
      <span className="plu-nav-menu__copy"><strong>{label}</strong>{description ? <small>{description}</small> : null}</span>
      <ArrowRight size={14} aria-hidden />
    </button>
  )
}

function NavDropdown({ active, hovered, onHover, onLeave, children, label, menuId, open, onClose, onToggle, variant = 'compact', secondary = false }) {
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const { reducedMotion } = useMotionConfig()

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) onClose()
    }
    function onFocusIn(event) {
      if (!rootRef.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open, onClose])

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') onClose()
  }

  function focusItem(index) {
    const focusable = menuRef.current?.querySelectorAll('[role="menuitem"]')
    if (!focusable?.length) return
    if (index === -1) focusable[focusable.length - 1].focus()
    else focusable[index].focus()
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) onToggle()
      setTimeout(() => focusItem(0), 0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) onToggle()
      setTimeout(() => focusItem(-1), 0)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(-1)
    }
  }

  /* Shell CSS lleva el translate; Motion solo anima opacity en el panel interno. */
  const panelVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: reducedMotion ? 0.01 : MOTION_DURATION.fast,
        ease: MOTION_EASE.out,
      },
    },
    exit: {
      opacity: 0,
      transition: {
        duration: reducedMotion ? 0.01 : 0.12,
        ease: MOTION_EASE.standard,
      },
    },
  }

  return (
    <div className={`plu-global-nav__dropdown${secondary ? ' plu-global-nav__dropdown--secondary' : ''}`} data-open={open || undefined} ref={rootRef}>
      <button
        type="button"
        id={`${menuId}-trigger`}
        className={`plu-global-nav__link plu-global-nav__trigger${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-controls={menuId}
        aria-current={active ? 'page' : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        ref={triggerRef}
        onClick={onToggle}
        onKeyDown={handleTriggerKeyDown}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
      >
        {hovered ? (
          <m.span
            layoutId="plu-nav-hover-pill"
            className="plu-global-nav__hover-pill"
            aria-hidden
            transition={reducedMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 340, damping: 34, mass: 0.7 }}
          />
        ) : null}
        <span className="plu-global-nav__link-content">
          {label}<ChevronDown size={13} aria-hidden className="plu-global-nav__chevron" />
        </span>
        {active ? <SharedActiveIndicator /> : null}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            key={menuId}
            className={`plu-nav-menu-shell plu-nav-menu-shell--${variant}`}
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants}
          >
            <div
              className={`plu-nav-menu plu-nav-menu--${variant}`}
              id={menuId}
              ref={menuRef}
              role="menu"
              aria-labelledby={`${menuId}-trigger`}
              onKeyDown={handleMenuKeyDown}
            >
              {children}
            </div>
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
        : { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 }}
    />
  )
}

function DrawerRow({ active = false, children, delay = 0, description, feature = false, icon: Icon, iconSize, indent = false, onClick, reveal = true, tone = 'neutral' }) {
  const { reducedMotion } = useMotionConfig()
  const motionProps = reveal
    ? {
        initial: reducedMotion ? false : { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: reducedMotion ? 0.01 : 0.26,
          ease: [0.22, 1, 0.36, 1],
          delay: reducedMotion ? 0 : Math.min(delay, 0.12),
        },
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

export default function NavbarPublic({
  activeEventSlug = null,
  activeView,
  latestEvent,
  memberships = [],
  onLogout,
  onNavigate,
  session,
  sessionPending = false,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dropdown, setDropdown] = useState(null)
  const [hoveredNav, setHoveredNav] = useState(null)
  const shellRef = useRef(null)
  const drawerRef = useRef(null)
  const closeRef = useRef(null)
  const menuButtonRef = useRef(null)
  const profileMenuRef = useRef(null)
  const profileTriggerRef = useRef(null)
  const mobileProfileTriggerRef = useRef(null)
  const [profileMenuPos, setProfileMenuPos] = useState(null)
  const restoreDrawerFocusRef = useRef(true)
  const suppressScrollRestoreRef = useRef(false)
  /* Morph compositor (~140px, cuantizado 24 pasos). Compact layout solo al
     cruzar scrolled — evita thrash de height/font en cada frame (PC/desktop). */
  const { scrolled } = useHeaderScroll(shellRef, {
    autoHide: false,
    range: 140,
    threshold: 120,
    hysteresis: 40,
    steps: 24,
  })
  const { reducedMotion } = useMotionConfig()
  const { locale, t } = useI18n()

  const adminSession = canViewAdmin(session)
  const sessionFullName = session ? sessionDisplayName(session) : ''
  const sessionInitialLetter = session ? sessionInitial(session) : ''
  const sessionPhoto = session ? sessionPhotoUrl(session) : ''
  const hasActiveMembership =
    session?.role === 'athlete_plu' && hasCurrentMembership(memberships, session.athleteId)
  const competitionActive = Boolean(COMPETITION_NAVIGATION?.views?.includes(activeView))
  const moreActive = Boolean(MORE_NAVIGATION?.views?.includes(activeView))

  const latestEventTitle = latestEvent?.title ?? t('nav.pitbull')
  const latestEventDestination = getFeaturedEventDestination(latestEvent)
  const latestEventView = latestEventDestination.view
  const latestEventOptions = latestEventDestination.options
  const latestEventActive =
    activeView === latestEventView &&
    (latestEventView !== 'events' ||
      !latestEventOptions?.eventSlug ||
      activeEventSlug === latestEventOptions.eventSlug)
  const latestEventHint = latestEvent?.date ?? t('nav.pitbullHint')

  const navGroupContext = {
    activeView,
    latestEventActive,
    latestEventHint,
    latestEventTitle,
    t,
  }
  const competitionGroups = (COMPETITION_NAVIGATION?.groups ?? []).map((group) =>
    mapNavGroupItems(group, navGroupContext),
  )
  const moreGroups = (MORE_NAVIGATION?.groups ?? []).map((group) =>
    mapNavGroupItems(group, navGroupContext),
  )

  function navigateNavItem(item) {
    if (item.key === 'pitbull') {
      go(latestEventView, latestEventOptions)
      return
    }
    go(item.key)
  }

  const drawerSecondary = DRAWER_SECONDARY.map((item) => ({
    ...item,
    label: t(item.labelKey),
    active: activeView === item.key,
  }))

  function go(view, options = {}) {
    restoreDrawerFocusRef.current = false
    if (drawerOpen) suppressScrollRestoreRef.current = true
    onNavigate?.(view, options)
    setDrawerOpen(false)
    setDropdown(null)
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  function toggleProfileMenu() {
    setDropdown((current) => (current === 'profile' ? null : 'profile'))
  }

  function handleLogout() {
    setDropdown(null)
    closeDrawer(false)
    onLogout?.()
  }

  function closeDrawer(restoreFocus = true) {
    restoreDrawerFocusRef.current = restoreFocus
    suppressScrollRestoreRef.current = false
    setDrawerOpen(false)
  }

  function openDrawer() {
    restoreDrawerFocusRef.current = true
    suppressScrollRestoreRef.current = false
    setDropdown(null)
    setDrawerOpen(true)
  }

  useEffect(() => {
    if (!drawerOpen) return undefined

    const html = document.documentElement
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }
    const backgroundNodes = Array.from(shellRef.current?.parentElement?.children ?? [])
      .filter((node) => node !== shellRef.current)
      .map((node) => ({ inert: node.inert, node }))

    html.classList.add('plu-drawer-open')
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
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
      html.classList.remove('plu-drawer-open')
      html.style.overflow = previous.htmlOverflow
      html.style.overscrollBehavior = previous.htmlOverscroll
      body.style.overflow = previous.bodyOverflow
      body.style.overscrollBehavior = previous.bodyOverscroll
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.left = previous.bodyLeft
      body.style.right = previous.bodyRight
      body.style.width = previous.bodyWidth
      const skipRestore = suppressScrollRestoreRef.current
      suppressScrollRestoreRef.current = false
      window.scrollTo(0, skipRestore ? 0 : scrollY)
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

  useLayoutEffect(() => {
    if (dropdown !== 'profile') {
      setProfileMenuPos(null)
      return undefined
    }

    function updatePosition() {
      const trigger = getVisibleTrigger(mobileProfileTriggerRef.current, profileTriggerRef.current)
      if (!trigger) return
      setProfileMenuPos(computeProfileMenuPosition(trigger.getBoundingClientRect(), window.innerWidth))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [dropdown])

  useEffect(() => {
    if (dropdown !== 'profile') return undefined
    function isInProfileUi(target) {
      return Boolean(
        profileTriggerRef.current?.contains(target)
        || mobileProfileTriggerRef.current?.contains(target)
        || profileMenuRef.current?.contains(target),
      )
    }
    function handlePointerDown(event) {
      if (!isInProfileUi(event.target)) setDropdown(null)
    }
    function handleFocusIn(event) {
      if (!isInProfileUi(event.target)) setDropdown(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [dropdown])

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
            <BrandLogo variant="argentina" imgClassName="plu-global-nav__emblem" height={46} />
            <span className="plu-global-nav__wordmark" aria-hidden={scrolled || undefined}>
              <BrandLogo variant="letterhead" letterheadBlend imgClassName="plu-global-nav__letterhead" height={22} />
              <small>{t('brand.federationLine')}</small>
            </span>
          </button>

          <span className="plu-global-nav__rail" aria-hidden />

          <nav className="plu-global-nav__desktop" aria-label={t('nav.mainAria')}>
            <LayoutGroup id={`plu-public-navigation-${locale}`}>
              {PUBLIC_NAVIGATION.primary.map((item) => {
                if (item.type === 'menu' && item.key === 'competition') {
                  return (
                    <NavDropdown
                      key={item.key}
                      active={competitionActive}
                      hovered={hoveredNav === 'competition'}
                      onHover={() => setHoveredNav('competition')}
                      onLeave={() => setHoveredNav(null)}
                      label={t(item.labelKey)}
                      menuId="plu-competition-menu"
                      open={dropdown === 'competition'}
                      onClose={() => setDropdown(null)}
                      onToggle={() =>
                        setDropdown((current) => (current === 'competition' ? null : 'competition'))
                      }
                      variant="compact"
                    >
                      {competitionGroups[0]?.items.map((navItem) => (
                        <NavDropdownItem
                          key={navItem.key}
                          active={navItem.active}
                          description={navItem.hint}
                          icon={navItem.icon}
                          label={navItem.label}
                          tone={navItem.featured ? 'featured' : 'default'}
                          onClick={() => navigateNavItem(navItem)}
                        />
                      ))}
                    </NavDropdown>
                  )
                }

                if (item.type === 'menu' && item.key === 'more') {
                  return (
                    <NavDropdown
                      key={item.key}
                      active={moreActive}
                      hovered={hoveredNav === 'more'}
                      onHover={() => setHoveredNav('more')}
                      onLeave={() => setHoveredNav(null)}
                      label={t(item.labelKey)}
                      menuId="plu-more-menu"
                      open={dropdown === 'more'}
                      onClose={() => setDropdown(null)}
                      onToggle={() => setDropdown((current) => (current === 'more' ? null : 'more'))}
                      variant="resources"
                      secondary
                    >
                      <div className="plu-resources-menu__head" role="presentation">
                        <div>
                          <p>{t('nav.moreMenuLabel')}</p>
                          <span>{t('nav.moreMenuIntro')}</span>
                        </div>
                        <button type="button" role="menuitem" onClick={() => go('resources')}>
                          {t('nav.viewResources')}
                          <ArrowRight size={14} aria-hidden />
                        </button>
                      </div>
                      <div className="plu-resources-menu__groups" role="presentation">
                        {moreGroups.map((group) => (
                          <div
                            key={group.label}
                            className="plu-resources-menu__group"
                            role="presentation"
                          >
                            <p>{group.label}</p>
                            {group.items.map((navItem) => (
                              <NavDropdownItem
                                key={navItem.key}
                                active={navItem.active}
                                description={navItem.hint}
                                icon={navItem.icon}
                                label={navItem.label}
                                tone={navItem.featured ? 'featured' : 'default'}
                                onClick={() => navigateNavItem(navItem)}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </NavDropdown>
                  )
                }

                return (
                  <NavLink
                    key={item.key}
                    active={activeView === item.key}
                    hovered={hoveredNav === item.key}
                    onHover={() => setHoveredNav(item.key)}
                    onLeave={() => setHoveredNav(null)}
                    tone={item.key === 'members' ? 'affiliate' : 'default'}
                    onClick={() => go(item.key)}
                  >
                    {t(item.labelKey)}
                  </NavLink>
                )
              })}
            </LayoutGroup>
          </nav>

          <div className="plu-global-nav__actions">
            <div className="plu-global-nav__preferences"><ThemeToggle compact /><LanguageToggle compact /></div>
            {session ? (
              <div className="plu-global-nav__account">
                <button
                  type="button"
                  id="plu-profile-menu-trigger"
                  ref={profileTriggerRef}
                  className={`plu-global-nav__profile${dropdown === 'profile' ? ' is-active' : ''}`}
                  aria-controls="plu-profile-menu"
                  aria-expanded={dropdown === 'profile'}
                  aria-haspopup="menu"
                  aria-label={sessionFullName || t('nav.myProfile')}
                  onClick={toggleProfileMenu}
                >
                  <span className="plu-global-nav__profile-mark" aria-hidden>
                    {sessionPhoto ? <img src={sessionPhoto} alt="" /> : sessionInitialLetter}
                  </span>
                </button>
              </div>
            ) : sessionPending ? (
              <span className="plu-global-nav__session-skeleton" aria-hidden="true" />
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
              {session ? (
                <button
                  type="button"
                  id="plu-profile-menu-trigger-mobile"
                  ref={mobileProfileTriggerRef}
                  className={`plu-global-nav__mobile-login plu-global-nav__mobile-login--account${
                    dropdown === 'profile' || activeView === 'profile' || activeView === 'admin' ? ' is-active' : ''
                  }`}
                  aria-controls="plu-profile-menu"
                  aria-expanded={dropdown === 'profile'}
                  aria-haspopup="menu"
                  aria-label={sessionFullName || t('nav.myProfile')}
                  title={sessionFullName || t('nav.myProfile')}
                  onClick={toggleProfileMenu}
                >
                  <span className="plu-global-nav__mobile-login-avatar" aria-hidden>
                    {sessionPhoto ? <img src={sessionPhoto} alt="" /> : sessionInitialLetter}
                  </span>
                </button>
              ) : sessionPending ? (
                <span className="plu-global-nav__session-skeleton" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className={`plu-global-nav__mobile-login${activeView === 'login' ? ' is-active' : ''}`}
                  aria-current={activeView === 'login' ? 'page' : undefined}
                  onClick={() => go('login')}
                >
                  {t('nav.login')}
                </button>
              )}
              <span className="plu-global-nav__mobile-divider" aria-hidden />
              <button
                type="button"
                className={`plu-global-nav__mobile-affiliate${
                  hasActiveMembership
                    ? ' plu-global-nav__mobile-affiliate--member'
                    : ''
                }${
                  hasActiveMembership
                    ? activeView === 'profile'
                      ? ' is-active'
                      : ''
                    : activeView === 'members'
                      ? ' is-active'
                      : ''
                }`}
                aria-current={
                  hasActiveMembership
                    ? activeView === 'profile'
                      ? 'page'
                      : undefined
                    : activeView === 'members'
                      ? 'page'
                      : undefined
                }
                aria-label={
                  hasActiveMembership ? t('nav.affiliatedAria') : t('nav.affiliate')
                }
                title={hasActiveMembership ? t('nav.affiliatedShort') : t('nav.affiliate')}
                onClick={() => go(hasActiveMembership ? 'profile' : 'members')}
              >
                <span className="plu-global-nav__mobile-affiliate-label">
                  {hasActiveMembership ? t('nav.affiliatedShort') : t('nav.affiliateShort')}
                </span>
              </button>
            </div>
            <button
              type="button"
              className="plu-global-nav__menu-button"
              aria-controls="plu-mobile-drawer"
              aria-expanded={drawerOpen}
              aria-label={drawerOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              ref={menuButtonRef}
              onClick={drawerOpen ? () => closeDrawer(true) : openDrawer}
            >
              <span className="plu-global-nav__menu-icon" aria-hidden>
                <span className="plu-global-nav__menu-line" />
                <span className="plu-global-nav__menu-line" />
                <span className="plu-global-nav__menu-line" />
              </span>
            </button>
          </div>
        </div>
      </header>

      {createPortal(
        <AnimatePresence initial={false}>
          {dropdown === 'profile' && profileMenuPos ? (
            <m.div
              className="plu-profile-menu"
              id="plu-profile-menu"
              ref={profileMenuRef}
              role="menu"
              aria-labelledby="plu-profile-menu-trigger plu-profile-menu-trigger-mobile"
              style={{ top: profileMenuPos.top, left: profileMenuPos.left }}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion
                ? { opacity: 0, transition: { duration: 0.01 } }
                : { opacity: 0, y: 4, scale: 0.99, transition: { duration: 0.14, ease: MOTION_EASE.out } }}
              transition={{ duration: reducedMotion ? 0.08 : 0.2, ease: MOTION_EASE.out }}
            >
              <div className="plu-profile-menu__header">
                <div className="plu-profile-menu__avatar" aria-hidden>
                  {sessionPhoto ? <img src={sessionPhoto} alt="" /> : sessionInitialLetter}
                </div>
                <div className="plu-profile-menu__info">
                  <p className="plu-profile-menu__eyebrow">
                    {adminSession ? t('nav.roleAdmin') : t('nav.roleAthlete')}
                  </p>
                  <p className="plu-profile-menu__name">{sessionFullName || t('nav.myProfile')}</p>
                </div>
              </div>
              <div className="plu-profile-menu__actions">
                <button type="button" role="menuitem" onClick={() => go(adminSession ? 'admin' : 'profile')}>
                  <User size={15} strokeWidth={1.6} aria-hidden />
                  <span>{adminSession ? t('nav.admin') : t('nav.myProfile')}</span>
                </button>
                <button type="button" role="menuitem" onClick={handleLogout} className="plu-profile-menu__logout">
                  <LogOut size={15} strokeWidth={1.6} aria-hidden />
                  <span>{t('nav.logout')}</span>
                </button>
              </div>
            </m.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}

      {createPortal(
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
                initial={reducedMotion ? { opacity: 0 } : { opacity: 1, x: '100%' }}
                animate={{ opacity: 1, x: 0 }}
                exit={reducedMotion
                  ? { opacity: 0, transition: { duration: 0.01 } }
                  : { opacity: 0, x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
                // Settle cinematográfico: el panel desliza y frena suave, sin
                // rebote — la superficie es grande y un spring se leería
                // elástico, no lujoso.
                transition={{ duration: reducedMotion ? 0.01 : 0.34, ease: MOTION_EASE.cinematic }}
              >
            <m.header
              className="plu-drawer__head"
              initial={reducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.22, ease: MOTION_EASE.out, delay: reducedMotion ? 0 : 0.04 }}
            >
              <div className="plu-drawer__head-bar">
                <button
                  type="button"
                  className={`plu-drawer__brand${activeView === 'home' ? ' is-active' : ''}`}
                  aria-current={activeView === 'home' ? 'page' : undefined}
                  aria-label={t('nav.home')}
                  onClick={() => go('home')}
                >
                  <BrandLogo variant="argentina" imgClassName="plu-drawer__emblem" height={38} />
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
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.22, ease: MOTION_EASE.out, delay: reducedMotion ? 0 : 0.04 }}
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
                    <DrawerRow
                      active={latestEventActive}
                      delay={0.02}
                      description={latestEvent?.date ?? t('nav.pitbullHint')}
                      onClick={() => go(latestEventView, latestEventOptions)}
                    >
                      {latestEventTitle}
                    </DrawerRow>
                    <DrawerRow
                      active={['shop', 'tickets'].includes(activeView)}
                      delay={0.04}
                      description={t('nav.shopHint')}
                      onClick={() => go('shop')}
                    >
                      {t('nav.shop')}
                    </DrawerRow>
                    <DrawerRow active={activeView === 'events'} delay={0.06} onClick={() => go('events')}>
                      {t('nav.calendarOfficial')}
                    </DrawerRow>
                    <DrawerRow active={activeView === 'results'} delay={0.08} onClick={() => go('results')}>
                      {t('nav.results')}
                    </DrawerRow>
                    <DrawerRow active={activeView === 'records'} delay={0.1} onClick={() => go('records')}>
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
                          delay={0.08 + index * 0.02}
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
                        ? `${sessionFullName || t('nav.myProfile')} · ${t('nav.roleAdmin')}`
                        : `${sessionFullName || t('nav.myProfile')} · ${t('nav.roleAthlete')}`
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
                        {adminSession ? t('nav.roleAdmin') : t('nav.roleAthlete')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="plu-drawer__account-logout"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} aria-hidden />
                    <span>{t('nav.logout')}</span>
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
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
