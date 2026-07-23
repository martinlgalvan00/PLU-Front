import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'

const FOOTER_GROUPS = [
  { labelKey: 'navCompetition', items: ['members', 'events', 'pitbull', 'results', 'records'] },
  { labelKey: 'navResources', items: ['resources', 'rulebook', 'faq', 'community'] },
  { labelKey: 'navInstitution', items: ['contact', 'login'] },
]

export default function Footer({ onNavigate }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer site-footer--institutional">
      <div className="institutional-footer__rule" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="institutional-footer__inner">
        <div className="institutional-footer__lead">
          <div className="institutional-footer__brand">
            <button type="button" aria-label={t('nav.home')} onClick={() => onNavigate?.('home')}>
              <BrandLogo
                variant="letterhead"
                letterheadBlend
                imgClassName="institutional-footer__logo"
                height={34}
              />
            </button>
            <span className="institutional-footer__chapter">{t('footer.chapterLine')}</span>
          </div>

          <div className="institutional-footer__cta">
            <p className="institutional-footer__kicker">{t('footer.actionEyebrow')}</p>
            <h2>{t('footer.actionTitle')}</h2>
            <div className="institutional-footer__cta-row">
              <button
                type="button"
                className="institutional-footer__action motion-icon-shift"
                onClick={() => onNavigate?.('members')}
              >
                <span>{t('footer.actionCta')}</span>
                <ArrowRight size={15} aria-hidden className="motion-icon-shift__target" />
              </button>
              <a href="mailto:hola@pluarg.com.ar" className="institutional-footer__mail">
                hola@pluarg.com.ar
              </a>
            </div>
          </div>
        </div>

        <div className="institutional-footer__directory">
          {FOOTER_GROUPS.map((group) => (
            <nav key={group.labelKey} aria-label={t(`footer.${group.labelKey}`)}>
              <h3>{t(`footer.${group.labelKey}`)}</h3>
              <ul>
                {group.items.map((key) => (
                  <li key={key}>
                    <button type="button" onClick={() => onNavigate?.(key)}>
                      {key === 'login' ? t('nav.login') : t(`nav.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="institutional-footer__bottom">
          <span>
            © {year} {t('brand.name')}
          </span>
          <span>{t('footer.poweredBy')}</span>
        </div>
      </div>
    </footer>
  )
}
