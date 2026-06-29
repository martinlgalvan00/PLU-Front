import { Mail } from 'lucide-react'
import { NAV_ITEMS } from '../../lib/constants.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function Footer({ onNavigate }) {
  const { t } = useI18n()

  return (
    <footer className="site-footer">
      <div className="site-footer__wrap">
        <div className="footer-cta">
          <h3>¿Listo para competir con PLU ARG?</h3>
          <p>Afiliate, inscribite a Pitbull Classic o accedé al panel operativo.</p>
          <div className="footer-cta__actions">
            <button type="button" className="btn" onClick={() => onNavigate('register')}>
              {t('nav.register')}
            </button>
            <button type="button" className="btn btn--outline" onClick={() => onNavigate('pitbull')}>
              {t('nav.pitbull')}
            </button>
          </div>
        </div>

        <div className="site-footer__grid">
          <div className="site-footer__brand">
            <strong>{t('brand.name')}</strong>
            <p>Federación argentina de powerlifting. Operación junto a Maximal.</p>
            <span className="site-footer__flag" aria-hidden="true" />
          </div>
          <div>
            <h4>Navegación</h4>
            <ul>
              {NAV_ITEMS.map(([key]) => (
                <li key={key}>
                  <button type="button" onClick={() => onNavigate(key)}>
                    {t(`nav.${key}`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Acciones</h4>
            <ul>
              <li>
                <button type="button" onClick={() => onNavigate('register')}>
                  {t('nav.register')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('pitbull')}>
                  {t('nav.pitbull')}
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('login')}>
                  {t('nav.login')}
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h4>Contacto</h4>
            <a href="mailto:soporte@pluarg.com">
              <Mail size={16} /> soporte@pluarg.com
            </a>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} PLU ARG · Maximal</span>
          <span>Powerlifting con estándar internacional</span>
        </div>
      </div>
    </footer>
  )
}
