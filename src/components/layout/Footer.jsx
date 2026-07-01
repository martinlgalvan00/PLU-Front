import { ArrowRight, Mail, MapPin, ShieldCheck } from 'lucide-react'
import { NAV_PRIMARY, NAV_SECONDARY } from '../../lib/constants.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import logo from '../../assets/PLU Official Letterhead Logo.png'

export default function Footer({ onNavigate }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="site-footer__cta-band">
        <div className="site-footer__wrap">
          <div className="footer-cta">
            <div className="footer-cta__glow" aria-hidden />
            <div className="footer-cta__copy">
              <span className="footer-cta__eyebrow">{t('footer.ctaEyebrow')}</span>
              <h3>{t('footer.ctaTitle')}</h3>
              <p>{t('footer.ctaDesc')}</p>
            </div>
            <div className="footer-cta__actions">
              <button type="button" className="btn" onClick={() => onNavigate('register')}>
                {t('nav.register')}
                <ArrowRight size={16} />
              </button>
              <button type="button" className="btn btn--outline" onClick={() => onNavigate('pitbull')}>
                {t('hero.ctaPitbullShort')}
              </button>
              <button type="button" className="btn btn--ghost footer-cta__panel" onClick={() => onNavigate('login')}>
                {t('nav.login')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="site-footer__main">
        <div className="site-footer__wrap">
          <div className="site-footer__grid">
            <div className="site-footer__brand">
              <button type="button" className="site-footer__logo" onClick={() => onNavigate('home')}>
                <img src={logo} alt={t('brand.name')} />
                <span>
                  <strong>{t('brand.name')}</strong>
                  <small>{t('brand.tagline')}</small>
                </span>
              </button>
              <p>{t('footer.brandDesc')}</p>
              <div className="site-footer__badges">
                <span>
                  <ShieldCheck size={14} />
                  {t('footer.badgeStandard')}
                </span>
                <span className="site-footer__flag" aria-hidden="true" title="Argentina" />
              </div>
            </div>

            <nav className="site-footer__col" aria-label={t('footer.navPlatform')}>
              <h4>{t('footer.navPlatform')}</h4>
              <ul>
                {NAV_PRIMARY.map((key) => (
                  <li key={key}>
                    <button type="button" onClick={() => onNavigate(key)}>
                      {t(`nav.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <nav className="site-footer__col" aria-label={t('footer.navFederation')}>
              <h4>{t('footer.navFederation')}</h4>
              <ul>
                {NAV_SECONDARY.map((key) => (
                  <li key={key}>
                    <button type="button" onClick={() => onNavigate(key)}>
                      {t(`nav.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="site-footer__col site-footer__contact">
              <h4>{t('footer.contact')}</h4>
              <a href="mailto:soporte@pluarg.com" className="site-footer__email">
                <Mail size={16} />
                soporte@pluarg.com
              </a>
              <p className="site-footer__location">
                <MapPin size={14} />
                Maximal Strength Club · Buenos Aires
              </p>
              <p className="site-footer__hours">{t('footer.contactHours')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="site-footer__bottom">
        <div className="site-footer__wrap site-footer__bottom-inner">
          <span>© {year} {t('brand.name')} · {t('brand.tagline')}</span>
          <span className="site-footer__tagline">{t('footer.tagline')}</span>
        </div>
      </div>
    </footer>
  )
}
