import { useEffect, useState } from 'react'
import { useContent } from '../../hooks/useContent.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchCommunitySpotlight } from '../../services/communityService.js'

/** Métricas públicas de la red que se muestran si tienen valor real (> 0). */
const NETWORK_STATS = Object.freeze([
  { key: 'memberCount', labelKey: 'pages.community.statsRecentMembers' },
  { key: 'activeGymCount', labelKey: 'pages.community.statsActiveGyms' },
  { key: 'provinceCount', labelKey: 'pages.community.statsProvinces' },
])

/**
 * Evidencia para marcas: el próximo meet (fecha y sede del contenido oficial)
 * y las cifras públicas de la red. Los ceros y las fallas de API se ocultan:
 * nunca se muestra un número que no sea real.
 */
export default function SponsorsAudience() {
  const { t } = useI18n()
  const { PITBULL_CLASSIC } = useContent()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchCommunitySpotlight().then((data) => {
      if (!cancelled) setStats(data.stats)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const visibleStats = NETWORK_STATS.filter(({ key }) => Number(stats?.[key]) > 0)

  return (
    <section className="sponsors-audience" aria-labelledby="sponsors-audience-title">
      <header className="sponsors-audience__head">
        <p className="institutional-kicker">{t('pages.sponsors.audienceEyebrow')}</p>
        <h2 id="sponsors-audience-title">{t('pages.sponsors.audienceTitle')}</h2>
      </header>

      <div className="sponsors-audience__body">
        <div className="sponsors-audience__meet">
          <p className="sponsors-audience__meet-label">{t('pages.sponsors.audienceNextMeet')}</p>
          <p className="sponsors-audience__meet-title">{PITBULL_CLASSIC.title}</p>
          <p className="sponsors-audience__meet-meta">
            <span>{PITBULL_CLASSIC.date}</span>
            <span>
              {PITBULL_CLASSIC.venue} · {PITBULL_CLASSIC.location}
            </span>
          </p>
        </div>

        {visibleStats.length > 0 ? (
          <dl className="sponsors-audience__stats" aria-label={t('pages.sponsors.audienceStatsAria')}>
            {visibleStats.map(({ key, labelKey }) => (
              <div key={key} className="sponsors-audience__stat">
                <dt>{t(labelKey)}</dt>
                <dd>{stats[key]}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  )
}
