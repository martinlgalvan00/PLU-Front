import { useI18n } from '../../i18n/I18nProvider.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'

const FOOTER_PLATFORM = ['members', 'pitbull', 'events', 'results', 'rulebook']
const FOOTER_COMMUNITY = ['community', 'faq', 'contact']

export default function Footer({ onNavigate }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer site-footer--design">
      <div className="site-footer__wrap">
        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <button type="button" className="site-footer__logo" onClick={() => onNavigate('home')}>
              <BrandLogo variant="letterhead" imgClassName="site-footer__logo-img" height={40} />
            </button>
            <p className="site-footer__brand-desc">{t('footer.brandDesc')}</p>
          </div>

          <nav className="site-footer__col" aria-label={t('footer.navPlatform')}>
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

          <nav className="site-footer__col" aria-label={t('footer.navCommunity')}>
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

          <div className="site-footer__col">
            <h4>{t('footer.navAccess')}</h4>
            <ul>
              <li>
                <button type="button" onClick={() => onNavigate('login')}>
                  {t('footer.loginLink')}
                </button>
              </li>
            </ul>
            <h4 className="site-footer__col-subtitle">{t('footer.directContact')}</h4>
            <a href="mailto:hola@pluarg.com.ar" className="site-footer__email">
              hola@pluarg.com.ar
            </a>
            <p className="site-footer__location">Buenos Aires, Argentina</p>
          </div>
        </div>

        <div className="site-footer__bottom-bar">
          <span>
            © {year} {t('brand.name')} / {t('brand.tagline')}. {t('footer.copyright')}
          </span>
          <span>{t('footer.poweredBy')}</span>
        </div>
      </div>
    </footer>
  )
}
