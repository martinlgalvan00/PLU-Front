import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, LockKeyhole, LogOut, User, X } from 'lucide-react'
import {
  NAV_EVENTOS,
  NAV_EVENTOS_VIEWS,
  NAV_RECURSOS,
  NAV_RECURSOS_VIEWS,
} from '../../lib/constants.js'
import { canViewAdmin } from '../../lib/roles.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useScrolled } from '../../hooks/useMotion.js'
import Button from '../ui/Button.jsx'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import LoginButton from '../ui/LoginButton.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'

function NavLink({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      className={`site-header__link ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function NavDropdownItem({ featured, hint, onClick, title }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`site-header__dropdown-item ${featured ? 'is-featured' : ''}`}
      onClick={onClick}
    >
      <span className="site-header__dropdown-item-bar" aria-hidden />
      <span>
        <strong>{title}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  )
}

function NavDropdown({ active, children, footerAction, label, menuLabel, open, onToggle, triggerRef }) {
  return (
    <div className="site-header__dropdown" ref={triggerRef}>
      <button
        type="button"
        className={`site-header__link site-header__dropdown-trigger ${active ? 'is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={onToggle}
      >
        {label}
        <ChevronDown size={13} aria-hidden className={open ? 'is-rotated' : ''} />
      </button>

      {open && (
        <div className="site-header__dropdown-menu" role="menu" aria-label={menuLabel}>
          <p className="site-header__dropdown-label">{menuLabel}</p>
          {children}
          {footerAction}
        </div>
      )}
    </div>
  )
}

function DrawerSection({ accent = 'neutral', children, label }) {
  return (
    <div className={`site-header__drawer-section site-header__drawer-section--${accent}`}>
      <p className="site-header__drawer-section-label">
        <span>{label}</span>
      </p>
      <div className="site-header__drawer-section-items">{children}</div>
    </div>
  )
}

function DrawerItem({ active, children, className = '', featured = false, onClick }) {
  return (
    <button
      type="button"
      className={`site-header__drawer-item ${active ? 'is-active' : ''} ${featured ? 'is-featured' : ''} ${className}`.trim()}
      onClick={onClick}
    >
      {featured && (
        <span
          className={`site-header__drawer-item-bar ${active ? 'is-active' : ''}`.trim()}
          aria-hidden
        />
      )}
      <span className="site-header__drawer-item-label">{children}</span>
    </button>
  )
}

export default function NavbarPublic({ activeView, onLogout, onNavigate, session }) {
  const [open, setOpen] = useState(false)
  const [dropdown, setDropdown] = useState(null)
  const eventosRef = useRef(null)
  const recursosRef = useRef(null)
  const navRef = useRef(null)
  const navTrackRef = useRef(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, visible: false })
  const scrolled = useScrolled(16)
  const { t } = useI18n()
  const adminSession = canViewAdmin(session?.role)

  const eventosActive = NAV_EVENTOS_VIEWS.includes(activeView)
  const recursosActive = NAV_RECURSOS_VIEWS.includes(activeView)

  function go(view) {
    onNavigate(view)
    setOpen(false)
    setDropdown(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleDropdown(name) {
    setDropdown((current) => (current === name ? null : name))
  }

  useEffect(() => {
    function updateIndicator() {
      const track = navTrackRef.current
      if (!track) return
      const activeEl = track.querySelector('.site-header__link.is-active, .site-header__dropdown-trigger.is-active')
      if (!activeEl) {
        setIndicator((prev) => ({ ...prev, visible: false }))
        return
      }
      const trackRect = track.getBoundingClientRect()
      const rect = activeEl.getBoundingClientRect()
      setIndicator({
        left: rect.left - trackRect.left,
        width: rect.width,
        visible: true,
      })
    }

    updateIndicator()
    window.addEventListener('resize', updateIndicator)
    return () => window.removeEventListener('resize', updateIndicator)
  }, [activeView, dropdown, eventosActive, recursosActive])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        setDropdown(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onClickOutside(e) {
      const inEventos = eventosRef.current?.contains(e.target)
      const inRecursos = recursosRef.current?.contains(e.target)
      if (!inEventos && !inRecursos) setDropdown(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const navHint = (key) => t(`nav.${key}Hint`)

  return (
    <div className={`site-header-shell${open ? ' site-header-shell--menu-open' : ''}`}>
      <div className="site-header__stripe" aria-hidden />
      <div className="site-header__ambient" aria-hidden />

      <header
        className={`site-header ${scrolled ? 'site-header--scrolled' : ''} ${open ? 'site-header--menu-open' : ''} ${activeView === 'home' && !scrolled && !open ? 'site-header--over-hero' : ''}`}
      >
        <div className="site-header__inner">
          <button className="site-header__logo site-header__logo--design" type="button" onClick={() => go('home')}>
            <BrandLogo
              variant="argentina"
              imgClassName="site-header__logo-emblem"
              height={36}
            />
            <span className="site-header__brand-stack">
              <BrandLogo
                variant="letterhead"
                letterheadBlend
                imgClassName="site-header__logo-letterhead"
                height={26}
              />
              <span className="site-header__brand-eyebrow">{t('brand.federationLine')}</span>
            </span>
          </button>

          <nav ref={navRef} className="site-header__nav site-header__nav--design" aria-label="Principal">
            <div className="site-header__nav-track" ref={navTrackRef}>
            <NavLink active={activeView === 'members'} onClick={() => go('members')}>
              {t('nav.members')}
            </NavLink>

            <NavDropdown
              active={eventosActive}
              label={t('nav.groupEventos')}
              menuLabel={t('nav.groupEventos')}
              open={dropdown === 'eventos'}
              onToggle={() => toggleDropdown('eventos')}
              triggerRef={eventosRef}
              footerAction={(
                <button type="button" className="site-header__dropdown-footer" onClick={() => go('events')}>
                  {t('nav.viewAllEvents')} <span aria-hidden>→</span>
                </button>
              )}
            >
              {NAV_EVENTOS.map(({ key, featured }) => (
                <NavDropdownItem
                  key={key}
                  featured={featured}
                  title={t(`nav.${key}`)}
                  hint={navHint(key)}
                  onClick={() => go(key)}
                />
              ))}
            </NavDropdown>

            <NavDropdown
              active={recursosActive}
              label={t('nav.groupRecursos')}
              menuLabel={t('nav.groupRecursos')}
              open={dropdown === 'recursos'}
              onToggle={() => toggleDropdown('recursos')}
              triggerRef={recursosRef}
            >
              {NAV_RECURSOS.map(({ key }) => (
                <NavDropdownItem
                  key={key}
                  title={t(`nav.${key}`)}
                  hint={navHint(key)}
                  onClick={() => go(key)}
                />
              ))}
            </NavDropdown>

            <span
              className={`site-header__nav-indicator ${indicator.visible ? 'is-visible' : ''}`}
              style={{ left: indicator.left, width: indicator.width }}
              aria-hidden
            />
            </div>
          </nav>

          <div className="site-header__actions">
            <div className="site-header__actions-cluster">
            <div className="site-header__prefs-rail">
              <div className="site-header__prefs">
                <ThemeToggle compact />
                <LanguageToggle compact />
              </div>
            </div>

            <span className="site-header__actions-sep" aria-hidden />

            <div className="site-header__actions-main">
            {session ? (
              <>
                <LoginButton
                  compact
                  label={adminSession ? 'Panel' : 'Mi perfil'}
                  onClick={() => go(adminSession ? 'admin' : 'profile')}
                />
                <button
                  type="button"
                  className="site-header__icon-action"
                  onClick={onLogout}
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <LoginButton compact label={t('nav.login')} onClick={() => go('login')} />
                <Button
                  className="site-header__cta site-header__cta--lux site-header__cta--pill btn--small"
                  onClick={() => go('register')}
                >
                  {t('nav.affiliate')}
                </Button>
              </>
            )}
            </div>
            </div>
          </div>

          <div className="site-header__mobile-actions">
            <div className={`site-header__mobile-cluster${open ? ' is-menu-open' : ''}`}>
              {session ? (
                <>
                  <button
                    type="button"
                    className="site-header__mobile-chip site-header__mobile-chip--account"
                    onClick={() => go(adminSession ? 'admin' : 'profile')}
                  >
                    <User size={15} aria-hidden />
                    <span className="site-header__mobile-chip-text">
                      {adminSession ? 'Panel' : 'Cuenta'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="site-header__mobile-chip site-header__mobile-chip--ghost"
                    onClick={onLogout}
                    aria-label="Cerrar sesión"
                  >
                    <LogOut size={15} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="site-header__mobile-chip site-header__mobile-chip--ghost"
                    onClick={() => go('login')}
                    aria-label={t('nav.login')}
                  >
                    <LockKeyhole size={18} strokeWidth={2.25} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="site-header__mobile-chip site-header__mobile-chip--cta"
                    onClick={() => go('register')}
                  >
                    <span className="site-header__mobile-chip-text">{t('nav.affiliate')}</span>
                    <ArrowRight size={14} aria-hidden className="site-header__mobile-chip-arrow" />
                  </button>
                </>
              )}

              <span className="site-header__mobile-cluster-divider" aria-hidden />

              <button
                type="button"
                className={`site-header__mobile-chip site-header__mobile-chip--menu${open ? ' is-open' : ''}`}
                aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
                aria-expanded={open}
                onClick={() => setOpen(!open)}
              >
                <span className="site-header__menu-bars" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <button
        type="button"
        className={`site-header__backdrop ${open ? 'is-visible' : ''}`}
        aria-label={t('nav.closeMenu')}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`site-header__drawer ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
        aria-label={t('nav.menu')}
      >
          <div className="site-header__drawer-head">
            <button type="button" className="site-header__drawer-brand" onClick={() => go('home')}>
              <BrandLogo
                variant="letterhead"
                imgClassName="site-header__drawer-logo site-header__logo-letterhead"
                height={24}
              />
            </button>
            <button
              type="button"
              className="site-header__drawer-close"
              aria-label={t('nav.closeMenu')}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          <div className="site-header__drawer-body">
            <nav className="site-header__drawer-nav" aria-label="Menú móvil">
              <DrawerItem
                active={activeView === 'members'}
                className="site-header__drawer-item--hero"
                onClick={() => go('members')}
              >
                {t('nav.members')}
              </DrawerItem>

              <DrawerSection accent="red" label={t('nav.groupEventos')}>
                {NAV_EVENTOS.map(({ key, featured }) => (
                  <DrawerItem
                    key={key}
                    active={activeView === key}
                    featured={featured}
                    onClick={() => go(key)}
                  >
                    {t(`nav.${key}`)}
                  </DrawerItem>
                ))}
                <button type="button" className="site-header__drawer-more" onClick={() => go('events')}>
                  {t('nav.viewAllEvents')}
                  <ArrowRight size={14} aria-hidden />
                </button>
              </DrawerSection>

              <DrawerSection accent="celeste" label={t('nav.groupRecursos')}>
                {NAV_RECURSOS.map(({ key }) => (
                  <DrawerItem key={key} active={activeView === key} onClick={() => go(key)}>
                    {t(`nav.${key}`)}
                  </DrawerItem>
                ))}
                <DrawerItem active={activeView === 'contact'} onClick={() => go('contact')}>
                  {t('nav.contact')}
                </DrawerItem>
              </DrawerSection>
            </nav>
          </div>

          <div className="site-header__drawer-foot">
            <div className="site-header__drawer-prefs">
              <ThemeToggle compact />
              <LanguageToggle compact />
            </div>

            {session ? (
              <div className="site-header__drawer-actions">
                <button
                  type="button"
                  className="site-header__drawer-foot-btn site-header__drawer-foot-btn--outline"
                  onClick={() => go(adminSession ? 'admin' : 'profile')}
                >
                  <User size={16} aria-hidden />
                  {adminSession ? 'Panel PLU' : 'Mi perfil'}
                </button>
                <button
                  type="button"
                  className="site-header__drawer-foot-btn site-header__drawer-foot-btn--ghost"
                  onClick={onLogout}
                >
                  <LogOut size={16} aria-hidden />
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <div className="site-header__drawer-actions">
                <button
                  type="button"
                  className="site-header__drawer-foot-btn site-header__drawer-foot-btn--primary"
                  onClick={() => go('register')}
                >
                  {t('nav.affiliate')}
                  <ArrowRight size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="site-header__drawer-foot-btn site-header__drawer-foot-btn--outline"
                  onClick={() => go('login')}
                >
                  <LockKeyhole size={16} aria-hidden />
                  {t('nav.login')}
                </button>
              </div>
            )}
          </div>
        </aside>
    </div>
  )
}
