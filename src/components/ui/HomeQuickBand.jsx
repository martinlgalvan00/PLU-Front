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
      <div className="home-quick-band__inner">
        <ul className="home-quick-band__menu">
          {HOME_QUICK_LINKS.map(({ key, labelKey }) => (
            <li key={key}>
              <button
                type="button"
                className={`home-quick-band__item${key === 'pitbull' ? ' home-quick-band__item--featured' : ''}`}
                onClick={() => onNavigate(key)}
              >
                {t(labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
