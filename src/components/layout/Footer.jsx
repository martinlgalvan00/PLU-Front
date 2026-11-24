import { ArrowRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildMailtoHref, CONTACT_EMAIL } from '../../lib/contact.js'
import {
  getCompetitionNavEventKey,
  getFeaturedEventDestination,
} from '../../lib/eventNavigation.js'
import AnalyticsOptOut from '../ui/AnalyticsOptOut.jsx'
import BrandLogo from '../ui/BrandLogo.jsx'
import { openCookiePreferences } from '../../services/cookieConsentService.js'

function competitionFooterItems(navEvents) {
  return [
    { key: 'members' },
    {
      key: 'events',
      children: navEvents
        .filter((event) => event?.slug)
        .map((event) => {
          const destination = getFeaturedEventDestination(event)
          return {
            key: getCompetitionNavEventKey(event),
            label: event.title,
            view: destination.view,
            options: destination.options,
          }
        }),
    },
    { key: 'shop' },
    { key: 'results' },
    { key: 'records' },
    { key: 'standards' },
  ]
}

function FooterLink({ item, onNavigate, t }) {
  const label = item.label ?? (item.key === 'login' ? t('nav.login') : t(`nav.${item.key}`))
  return (
    <button type="button" onClick={() => onNavigate?.(item.view ?? item.key, item.options ?? {})}>
      {label}
    </button>
  )
}

/**
 * `checkoutFocus`: durante el alta o la inscripción se omite el bloque
 * "Empezá tu recorrido · Afiliarme ahora" — otra acción principal compitiendo
 * con el pago que la persona vino a completar.
 */
export default function Footer({ onNavigate, navEvents = [], checkoutFocus = false }) {
  const { t } = useI18n()
  const year = new Date().getFullYear()
  const groups = [
    { labelKey: 'navCompetition', items: competitionFooterItems(navEvents) },
    {
      labelKey: 'navResources',
      items: [
        { key: 'resources' },
        { key: 'rulebook' },
        { key: 'faq' },
        { key: 'community' },
        { key: 'staffApplication' },
      ],
    },
    {
      labelKey: 'navInstitution',
      items: [{ key: 'team' }, { key: 'sponsors' }, { key: 'contact' }, { key: 'login' }],
    },
  ]

  return (
    <footer className="site-footer site-footer--institutional">
      <div className="institutional-footer__rule" aria-hidden>
        <div className="institutional-footer__glow-line" />
      </div>

      <div className="institutional-footer__inner">
        {checkoutFocus ? null : (
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
        )}

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
            {groups.map((group) => (
              <nav key={group.labelKey} aria-label={t(`footer.${group.labelKey}`)}>
                <h3>{t(`footer.${group.labelKey}`)}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.key}>
                      <FooterLink item={item} onNavigate={onNavigate} t={t} />
                      {item.children?.length ? (
                        <ul className="institutional-footer__sublist">
                          {item.children.map((child) => (
                            <li key={child.key} className="institutional-footer__subitem">
                              <FooterLink item={child} onNavigate={onNavigate} t={t} />
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
            <p className="institutional-footer__legal">
              © {year} {t('brand.name')}
            </p>

            <nav className="institutional-footer__privacy" aria-label={t('footer.privacyNav')}>
              <AnalyticsOptOut className="institutional-footer__optout" />
              <span className="institutional-footer__privacy-sep" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="institutional-footer__cookies"
                onClick={openCookiePreferences}
              >
                {t('cookies.reopen')}
              </button>
            </nav>

            <p className="institutional-footer__powered">{t('footer.poweredBy')}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
