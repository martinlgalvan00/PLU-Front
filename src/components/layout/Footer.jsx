import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildMailtoHref, CONTACT_EMAIL } from '../../lib/contact.js'
import AnalyticsOptOut from '../ui/AnalyticsOptOut.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'
import { openCookiePreferences } from '../../services/cookieConsentService.js'

const FOOTER_GROUPS = [
  {
    labelKey: 'navCompetition',
    items: [
      { key: 'members' },
      { key: 'events', children: [{ key: 'pitbull' }] },
      { key: 'results' },
      { key: 'records' },
      { key: 'standards' },
    ],
  },
  {
    labelKey: 'navResources',
    items: [{ key: 'resources' }, { key: 'rulebook' }, { key: 'faq' }, { key: 'community' }],
  },
  {
    labelKey: 'navInstitution',
    items: [{ key: 'team' }, { key: 'sponsors' }, { key: 'contact' }, { key: 'login' }],
  },
]

function FooterLink({ itemKey, onNavigate, t }) {
  return (
    <button type="button" onClick={() => onNavigate?.(itemKey)}>
      {itemKey === 'login' ? t('nav.login') : t(`nav.${itemKey}`)}
    </button>
  )
}

export default function Footer({ onNavigate }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer site-footer--institutional">
      <div className="institutional-footer__rule" aria-hidden>
        <div className="institutional-footer__glow-line" />
      </div>

      <div className="institutional-footer__inner">
        <div className="institutional-footer__cta">
          <p className="institutional-footer__kicker">{t('footer.actionEyebrow')}</p>
          <h2 className="institutional-footer__cta-title">{t('footer.actionTitle')}</h2>

          <div className="institutional-footer__cta-row">
            <button
              type="button"
              className="institutional-footer__action-editorial motion-icon-shift"
              onClick={() => onNavigate?.('members')}
            >
              <span>{t('footer.actionCta')}</span>
              <ArrowRight size={20} aria-hidden className="motion-icon-shift__target" />
            </button>
            <a href={buildMailtoHref()} className="institutional-footer__mail-editorial">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

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

          <div className="institutional-footer__directory">
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.labelKey} aria-label={t(`footer.${group.labelKey}`)}>
                <h3>{t(`footer.${group.labelKey}`)}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <FooterLink itemKey={item.key} onNavigate={onNavigate} t={t} />
                      {item.children?.length ? (
                        <ul className="institutional-footer__sublist">
                          {item.children.map((child) => (
                            <li key={child.key} className="institutional-footer__subitem">
                              <FooterLink itemKey={child.key} onNavigate={onNavigate} t={t} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
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
            <div className="institutional-footer__privacy">
              <AnalyticsOptOut className="institutional-footer__optout" />
              <button
                type="button"
                className="institutional-footer__cookies"
                onClick={openCookiePreferences}
              >
                {t('cookies.reopen')}
              </button>
            </div>
            <span>{t('footer.poweredBy')}</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
