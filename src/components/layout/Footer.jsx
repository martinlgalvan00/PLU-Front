import { useI18n } from '../../i18n/I18nProvider.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'

const FOOTER_PLATFORM = ['members', 'pitbull', 'events', 'shop', 'results', 'records', 'rulebook']
const FOOTER_COMMUNITY = ['community', 'faq', 'contact']

export default function Footer({ onNavigate }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer site-footer--design site-footer--premium">
      <div className="site-footer__wrap">
        <div className="site-footer__shell">
          <div className="site-footer__brand">
            <button type="button" className="site-footer__logo" onClick={() => onNavigate('home')}>
              <BrandLogo variant="letterhead" imgClassName="site-footer__logo-img" height={32} />
            </button>
            <p className="site-footer__brand-desc site-footer__brand-desc--full">{t('footer.brandDesc')}</p>
            <p className="site-footer__brand-desc site-footer__brand-desc--short">{t('footer.brandDescShort')}</p>
          </div>

          <div className="site-footer__contact-bar" aria-label={t('footer.directContact')}>
            <a href="mailto:hola@pluarg.com.ar" className="site-footer__contact-link site-footer__email">
              hola@pluarg.com.ar
            </a>
            <span className="site-footer__contact-sep" aria-hidden>
              ·
            </span>
            <span className="site-footer__contact-text">{t('footer.locationShort')}</span>
            <button type="button" className="site-footer__contact-login" onClick={() => onNavigate('login')}>
              {t('footer.loginLinkShort')}
            </button>
          </div>

          <div className="site-footer__nav-rail">
            <nav className="site-footer__nav-group" aria-label={t('footer.navPlatform')}>
              <h4>{t('footer.navPlatform')}</h4>
              <ul>
                {FOOTER_PLATFORM.map((key) => (
                  <li key={key}>
                    <button type="button" onClick={() => onNavigate(key)}>
                      {t(`nav.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <nav className="site-footer__nav-group" aria-label={t('footer.navCommunity')}>
              <h4>{t('footer.navCommunity')}</h4>
              <ul>
                {FOOTER_COMMUNITY.map((key) => (
                  <li key={key}>
                    <button type="button" onClick={() => onNavigate(key)}>
                      {t(`nav.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        <div className="site-footer__bottom-bar">
          <span>
            © {year} {t('brand.name')} · {t('footer.copyright')}
          </span>
          <span>{t('footer.poweredBy')}</span>
        </div>
      </div>
    </footer>
  )
}
