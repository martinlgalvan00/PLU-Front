import { ArrowRight } from 'lucide-react'
import { HOME_QUICK_LINKS } from '../../lib/content.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HomeQuickBand({ onNavigate, variant = 'default' }) {
  const { t } = useI18n()
  const isDock = variant === 'dock'

  return (
    <nav
      className={`home-quick-band ${isDock ? 'home-quick-band--dock' : ''}`.trim()}
      aria-label={t('hero.quickNavLabel')}
    >
      {isDock ? <span className="home-quick-band__stripe" aria-hidden /> : null}

      <div className="home-quick-band__inner">
        <div className="home-quick-band__aside">
          <p className="home-quick-band__label">{t('hero.quickNavLabel')}</p>
        </div>

        <div className="home-quick-band__shell">
          <div className="home-quick-band__track">
            {HOME_QUICK_LINKS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                className="home-quick-band__link"
                onClick={() => onNavigate(key)}
              >
                <span className="home-quick-band__link-text">{t(labelKey)}</span>
                <ArrowRight size={13} aria-hidden className="home-quick-band__arrow" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}
