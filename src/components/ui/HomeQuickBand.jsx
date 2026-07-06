import { ArrowRight } from 'lucide-react'
import { HOME_QUICK_LINKS } from '../../lib/content.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const QUICK_LINK_ACCENT = {
  members: 'red',
  pitbull: 'gold',
  events: 'celeste',
  results: 'neutral',
  rulebook: 'neutral',
}

const FEATURED_QUICK_KEYS = new Set(['pitbull'])

function quickLinkClassName(key) {
  const accent = QUICK_LINK_ACCENT[key] ?? 'neutral'
  const parts = ['home-quick-band__link']

  if (accent !== 'neutral') {
    parts.push(`home-quick-band__link--accent-${accent}`)
  }

  if (FEATURED_QUICK_KEYS.has(key)) {
    parts.push('home-quick-band__link--featured')
  }

  return parts.join(' ')
}

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
                className={quickLinkClassName(key)}
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
