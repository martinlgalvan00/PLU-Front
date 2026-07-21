import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  ContactRound,
  IdCard,
  ListChecks,
  LogOut,
  Mail,
  Scale,
  ShoppingBag,
  Trophy,
  User,
  UsersRound,
  X,
} from 'lucide-react'
import { NAV_EVENTOS, NAV_EVENTOS_VIEWS, NAV_RECURSOS, NAV_RECURSOS_VIEWS } from '../../lib/constants.js'
import { sessionDisplayName, sessionInitial, sessionPhotoUrl } from '../../lib/format.js'
import { canViewAdmin } from '../../lib/roles.js'
import { useHeaderScroll, useSlidingIndicator } from '../../hooks/useMotion.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'

function NavLink({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`plu-global-nav__link${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {children}
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
        className={`plu-global-nav__link plu-global-nav__trigger${active ? ' is-active' : ''}`}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        ref={triggerRef}
        onClick={onToggle}
        onKeyDown={handleTriggerKeyDown}
      >
        {label}<ChevronDown size={13} aria-hidden />
      </button>
      {open ? (
        <div
          className={`plu-nav-menu plu-nav-menu--${variant}`}
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

function DrawerItem({ active = false, children, description, icon: Icon, onClick, priority = false }) {
  return (
    <button
      type="button"
      className={`plu-drawer__item${active ? ' is-active' : ''}${priority ? ' plu-drawer__item--priority' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {Icon ? <span className="plu-drawer__item-icon"><Icon size={18} aria-hidden /></span> : null}
      <span><strong>{children}</strong>{description ? <small>{description}</small> : null}</span>
      <ArrowRight size={15} aria-hidden />
    </button>
  )
}

export default function NavbarPublic({ activeView, latestEvent, onLogout, onNavigate, session }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dropdown, setDropdown] = useState(null)
  const [resourcesExpanded, setResourcesExpanded] = useState(false)
  const shellRef = useRef(null)
  const drawerRef = useRef(null)
  const closeRef = useRef(null)
  const menuButtonRef = useRef(null)
  const navDesktopRef = useRef(null)
  const restoreDrawerFocusRef = useRef(true)
  const scrolled = useHeaderScroll(shellRef)
  const { t } = useI18n()

  const adminSession = canViewAdmin(session?.role)
  const sessionFullName = session ? sessionDisplayName(session) : ''
  const sessionInitialLetter = session ? sessionInitial(session) : ''
  const sessionPhoto = session ? sessionPhotoUrl(session) : ''
  const eventosActive = NAV_EVENTOS_VIEWS.includes(activeView)
  const recursosActive = NAV_RECURSOS_VIEWS.includes(activeView)

  useSlidingIndicator(navDesktopRef, [activeView, eventosActive, recursosActive], '.plu-global-nav__link.is-active')
  const latestEventTitle = latestEvent?.title ?? t('nav.pitbull')
  const latestEventView = latestEvent?.featured || latestEvent?.slug === 'pitbull-classic-2026' ? 'pitbull' : 'events'
  const latestEventActive = activeView === latestEventView

  const resourceGroups = [
    {
      label: t('nav.resourcesCompetition'),
      items: [
        { key: 'rulebook', icon: BookOpen, label: t('nav.rulebook'), hint: t('nav.rulebookHint') },
        { key: 'rulebook', icon: Scale, label: t('nav.categories'), hint: t('nav.categoriesHint') },
        { key: 'members', icon: IdCard, label: t('nav.athleteInfo'), hint: t('nav.athleteInfoHint') },
      ],
    },
    {
      label: t('nav.resourcesHelp'),
      items: [
        { key: 'faq', icon: CircleHelp, label: t('nav.faq'), hint: t('nav.faqHint') },
        { key: 'contact', icon: Mail, label: t('nav.contact'), hint: t('nav.contactHint') },
      ],
    },
    {
      label: t('nav.resourcesCommunity'),
      items: [
        { key: 'community', icon: UsersRound, label: t('nav.community'), hint: t('nav.communityHintNew') },
      ],
    },
  ]

  function go(view) {
    restoreDrawerFocusRef.current = false
    onNavigate?.(view)
    setDrawerOpen(false)
    setDropdown(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeDrawer(restoreFocus = true) {
    restoreDrawerFocusRef.current = restoreFocus
    setDrawerOpen(false)
  }

  function openDrawer() {
    restoreDrawerFocusRef.current = true
    setDropdown(null)
    setResourcesExpanded(recursosActive)
    setDrawerOpen(true)
  }

  useEffect(() => {
    if (!drawerOpen) return undefined
    const previousOverflow = document.body.style.overflow
    const menuButton = menuButtonRef.current
    document.body.style.overflow = 'hidden'
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
      document.removeEventListener('keydown', onKeyDown)
      if (restoreDrawerFocusRef.current) window.requestAnimationFrame(() => menuButton?.focus())
    }
  }, [drawerOpen])

  useEffect(() => {
    function onEscape(event) {
      if (event.key === 'Escape') setDropdown(null)
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [])

  const overHero = ['home', 'pitbull', 'tickets'].includes(activeView) && !drawerOpen

  return (
    <div ref={shellRef} className={`site-header-shell site-header-shell--institutional${drawerOpen ? ' site-header-shell--menu-open' : ''}`}>
      <a className="skip-link" href="#main-content">{t('nav.skipContent')}</a>
      <header className={`site-header site-header--lux site-header--institutional${scrolled ? ' site-header--scrolled' : ''}${overHero ? ' site-header--over-hero' : ''}`}>
        <div className="plu-global-nav">
          <button type="button" className="plu-global-nav__brand" aria-label={t('nav.home')} onClick={() => go('home')}>
            <BrandLogo variant="argentina" imgClassName="plu-global-nav__emblem" height={34} />
            <span>
              <BrandLogo variant="letterhead" letterheadBlend imgClassName="plu-global-nav__letterhead" height={24} />
              <small>{t('brand.federationLine')}</small>
            </span>
          </button>

          <nav className="plu-global-nav__desktop" aria-label={t('nav.mainAria')} ref={navDesktopRef}>
            <span className="plu-global-nav__indicator" aria-hidden />
            <NavLink active={activeView === 'members'} onClick={() => go('members')}>{t('nav.members')}</NavLink>
            <NavDropdown
              active={eventosActive}
              label={t('nav.groupEventos')}
              menuId="plu-events-menu"
              open={dropdown === 'events'}
              onClose={() => setDropdown(null)}
              onToggle={() => setDropdown((current) => current === 'events' ? null : 'events')}
            >
              <p className="plu-nav-menu__label">{t('nav.competitionMenuLabel')}</p>
              {NAV_EVENTOS.map(({ key, featured }) => {
                const isFeaturedEvent = key === 'pitbull'
                const Icon = isFeaturedEvent ? Trophy : key === 'shop' ? ShoppingBag : CalendarDays
                return (
                  <NavDropdownItem
                    key={key}
                    active={isFeaturedEvent ? latestEventActive : activeView === key}
                    description={isFeaturedEvent && latestEvent?.date ? `${latestEvent.date} · ${latestEvent.venue}` : t(`nav.${key}Hint`)}
                    icon={Icon}
                    label={isFeaturedEvent ? latestEventTitle : t(`nav.${key}`)}
                    onClick={() => go(isFeaturedEvent ? latestEventView : key)}
                    tone={featured ? 'featured' : 'default'}
                  />
                )
              })}
              <button type="button" role="menuitem" className="plu-nav-menu__footer" onClick={() => go('events')}>
                {t('nav.viewAllEvents')}<ArrowRight size={14} aria-hidden />
              </button>
            </NavDropdown>
            <NavLink active={activeView === 'results'} onClick={() => go('results')}>{t('nav.results')}</NavLink>
            <NavLink active={activeView === 'records'} onClick={() => go('records')}>{t('nav.records')}</NavLink>
            <NavDropdown
              active={recursosActive}
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
          </nav>

          <div className="plu-global-nav__actions">
            <div className="plu-global-nav__preferences"><ThemeToggle compact /><LanguageToggle compact /></div>
            <button type="button" className="plu-global-nav__affiliate" onClick={() => go('members')}>{t('nav.affiliate')}</button>
            {session ? (
              <div className="plu-global-nav__account">
                <button type="button" className="plu-global-nav__profile" aria-label={sessionFullName} title={sessionFullName} onClick={() => go(adminSession ? 'admin' : 'profile')}>
                  <span aria-hidden>{sessionPhoto ? <img src={sessionPhoto} alt="" /> : sessionInitialLetter}</span>
                </button>
                <button type="button" className="plu-global-nav__logout" aria-label={t('nav.logout')} title={t('nav.logout')} onClick={onLogout}><LogOut size={15} aria-hidden /></button>
              </div>
            ) : (
              <button type="button" className="plu-global-nav__login" onClick={() => go('login')}>{t('nav.login')}</button>
            )}
          </div>

          <div className="plu-global-nav__mobile-actions">
            <button type="button" className="plu-global-nav__mobile-affiliate" onClick={() => go('members')}>{t('nav.affiliate')}</button>
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
      </header>

      {drawerOpen ? (
        <>
          <div className="plu-drawer-backdrop" aria-hidden onClick={() => closeDrawer(true)} />
          <aside className="plu-drawer" id="plu-mobile-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={t('nav.mobileMenu')}>
            <header className="plu-drawer__head">
              <button type="button" className="plu-drawer__brand" aria-label={t('nav.home')} onClick={() => go('home')}>
                <BrandLogo variant="letterhead" imgClassName="plu-drawer__logo" height={25} />
              </button>
              <span>{t('nav.drawerTag')}</span>
              <button type="button" className="plu-drawer__close" aria-label={t('nav.closeMenu')} ref={closeRef} onClick={() => closeDrawer(true)}><X size={19} aria-hidden /></button>
            </header>

            <div className="plu-drawer__scroll">
              <nav className="plu-drawer__nav" aria-label={t('nav.mobileMenu')}>
                <DrawerItem active={activeView === 'members'} description={t('nav.membersHint')} icon={IdCard} priority onClick={() => go('members')}>{t('nav.members')}</DrawerItem>

                <div className="plu-drawer__section">
                  <p>{t('nav.groupEventos')}</p>
                  <DrawerItem active={activeView === 'events'} description={t('nav.eventsHint')} icon={CalendarDays} onClick={() => go('events')}>{t('nav.events')}</DrawerItem>
                  <DrawerItem active={latestEventActive} description={latestEvent?.date ? `${latestEvent.date} · ${latestEvent.venue}` : t('nav.pitbullHint')} icon={Trophy} onClick={() => go(latestEventView)}>{latestEventTitle}</DrawerItem>
                  <DrawerItem active={activeView === 'results'} description={t('nav.resultsHint')} icon={ListChecks} onClick={() => go('results')}>{t('nav.results')}</DrawerItem>
                  <DrawerItem active={activeView === 'records'} description={t('nav.recordsHint')} icon={Scale} onClick={() => go('records')}>{t('nav.records')}</DrawerItem>
                </div>

                <div className="plu-drawer__section plu-drawer__section--resources">
                  <button
                    type="button"
                    className="plu-drawer__section-toggle"
                    aria-controls="plu-drawer-resources"
                    aria-expanded={resourcesExpanded}
                    onClick={() => setResourcesExpanded((current) => !current)}
                  >
                    <span>{t('nav.groupRecursos')}</span><ChevronDown size={16} aria-hidden />
                  </button>
                  <div id="plu-drawer-resources" hidden={!resourcesExpanded}>
                    {NAV_RECURSOS.map(({ key }) => {
                      const icons = { resources: ContactRound, rulebook: BookOpen, faq: CircleHelp, community: UsersRound, contact: Mail }
                      const Icon = icons[key]
                      return <DrawerItem key={key} active={activeView === key} description={t(`nav.${key}Hint`)} icon={Icon} onClick={() => go(key)}>{t(`nav.${key}`)}</DrawerItem>
                    })}
                  </div>
                </div>
              </nav>
            </div>

            <footer className="plu-drawer__foot">
              <div className="plu-drawer__preferences"><ThemeToggle compact /><LanguageToggle compact /></div>
              {session ? (
                <div className="plu-drawer__account-actions">
                  <button type="button" onClick={() => go(adminSession ? 'admin' : 'profile')}><User size={17} aria-hidden />{sessionFullName || t('nav.myProfile')}</button>
                  <button type="button" onClick={() => { closeDrawer(false); onLogout?.() }}><LogOut size={17} aria-hidden />{t('nav.logout')}</button>
                </div>
              ) : (
                <button type="button" className="plu-drawer__login" onClick={() => go('login')}><User size={17} aria-hidden />{t('nav.login')}</button>
              )}
            </footer>
          </aside>
        </>
      ) : null}
    </div>
  )
}
