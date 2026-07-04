import { HOME_QUICK_LINKS } from '../../lib/content.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function HomeQuickBand({ onNavigate }) {
  const { t } = useI18n()

  return (
    <section className="home-quick-band" aria-label={t('hero.quickNavLabel')}>
      <div className="home-quick-band__inner">
        {HOME_QUICK_LINKS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className="home-quick-band__link"
            onClick={() => onNavigate(key)}
          >
            {t(labelKey)}
            <span className="home-quick-band__arrow" aria-hidden>
              →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
