import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, X } from 'lucide-react'
import { NAV_PRIMARY, NAV_SECONDARY } from '../../lib/constants.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useScrolled } from '../../hooks/useMotion.js'
import Button from '../ui/Button.jsx'
import LanguageToggle from '../ui/LanguageToggle.jsx'
import LoginButton from '../ui/LoginButton.jsx'
import ThemeToggle from '../ui/ThemeToggle.jsx'
import logo from '../../assets/PLU Official Letterhead Logo.png'

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

export default function NavbarPublic({ activeView, onLogout, onNavigate, session }) {
  const [open, setOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const scrolled = useScrolled(16)
  const { t } = useI18n()

  function go(view) {
    onNavigate(view)
    setOpen(false)
    setMoreOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        setMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onClickOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const secondaryActive = NAV_SECONDARY.includes(activeView)

  return (
    <header className={`site-header ${scrolled ? 'site-header--scrolled' : ''} ${open ? 'site-header--menu-open' : ''}`}>
      <div className="site-header__inner">
        <button className="site-header__logo" type="button" onClick={() => go('home')}>
          <img src={logo} alt="" />
          <span className="site-header__brand">
            <strong>{t('brand.name')}</strong>
            <small>{t('brand.tagline')}</small>
          </span>
        </button>

        <nav className="site-header__nav" aria-label="Principal">
          {NAV_PRIMARY.map((key) => (
            <NavLink key={key} active={activeView === key} onClick={() => go(key)}>
              {t(`nav.${key}`)}
            </NavLink>
          ))}
          {NAV_SECONDARY.map((key) => (
            <NavLink
              key={key}
              className="site-header__link--extended"
              active={activeView === key}
              onClick={() => go(key)}
            >
              {t(`nav.${key}`)}
            </NavLink>
          ))}
          <div className="site-header__more" ref={moreRef}>
            <button
              type="button"
              className={`site-header__link site-header__more-trigger ${secondaryActive ? 'is-active' : ''}`}
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={() => setMoreOpen((v) => !v)}
            >
              {t('nav.more')}
              <ChevronDown size={14} aria-hidden className={moreOpen ? 'is-rotated' : ''} />
            </button>
            {moreOpen && (
              <div className="site-header__more-menu" role="menu">
                {NAV_SECONDARY.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    className={activeView === key ? 'is-active' : ''}
                    onClick={() => go(key)}
                  >
                    {t(`nav.${key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="site-header__actions">
          <div className="site-header__prefs">
            <ThemeToggle compact />
            <LanguageToggle compact />
          </div>
          {session ? (
            <>
              <LoginButton compact label={session.role === 'admin_plu' ? 'Panel PLU' : 'Mi perfil'} onClick={() => go(session.role === 'admin_plu' ? 'admin' : 'profile')} />
              <button type="button" className="site-header__icon-action" onClick={onLogout} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={18} /></button>
            </>
          ) : (
            <><LoginButton compact label={t('nav.login')} onClick={() => go('login')} /><Button className="site-header__cta btn--small" onClick={() => go('register')}>{t('nav.register')}</Button></>
          )}
        </div>

        <div className="site-header__mobile-actions">
          <Button className="site-header__cta site-header__cta--mobile btn--small" onClick={() => go('register')}>
            {t('nav.register')}
          </Button>
          <button
            type="button"
            className="site-header__toggle"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`site-header__backdrop ${open ? 'is-visible' : ''}`}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      <aside className={`site-header__drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <div className="site-header__drawer-head">
          <span className="site-header__drawer-brand">{t('brand.name')}</span>
          <button type="button" className="site-header__drawer-close" aria-label="Cerrar menú" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="site-header__drawer-nav" aria-label="Menú móvil">
          <p className="site-header__drawer-group">Competencia</p>
          {NAV_PRIMARY.filter((k) => k !== 'home').map((key) => (
            <button key={key} type="button" className={activeView === key ? 'is-active' : ''} onClick={() => go(key)}>
              {t(`nav.${key}`)}
            </button>
          ))}
          <button type="button" className={activeView === 'home' ? 'is-active' : ''} onClick={() => go('home')}>
            {t('nav.home')}
          </button>

          <p className="site-header__drawer-group">Institucional</p>
          {NAV_SECONDARY.map((key) => (
            <button key={key} type="button" className={activeView === key ? 'is-active' : ''} onClick={() => go(key)}>
              {t(`nav.${key}`)}
            </button>
          ))}

          <div className="site-header__drawer-actions">
            <div className="site-header__prefs">
              <ThemeToggle compact />
              <LanguageToggle compact />
            </div>
            {session ? <><LoginButton label={session.role === 'admin_plu' ? 'Panel PLU' : 'Mi perfil'} onClick={() => go(session.role === 'admin_plu' ? 'admin' : 'profile')} /><Button variant="ghost" className="btn--block" onClick={onLogout}><LogOut size={17} /> Cerrar sesión</Button></> : <><LoginButton label={t('nav.login')} onClick={() => go('login')} /><Button className="site-header__cta site-header__cta--block" onClick={() => go('register')}>{t('nav.register')}</Button></>}
          </div>
        </nav>
      </aside>
    </header>
  )
}
