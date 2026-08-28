import { useCallback, useEffect, useRef, useState } from 'react'
import { Radio, RefreshCw } from 'lucide-react'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatAnalyticsPath } from '../../lib/analyticsPathLabels.js'
import { fetchAnalyticsLive } from '../../services/analyticsReportService.js'

/**
 * LivePresenceBar — PLU ARG
 *
 * Cuanta gente hay en el sitio ahora mismo, donde esta parada y como viene la
 * curva de la ultima hora.
 */

const REFRESH_MS = 15_000

function ConcurrencySparkline({ series, label }) {
  if (!series?.length) return null

  const values = series.map((point) => Number(point.sessions ?? 0))
  const max = Math.max(...values, 1)
  const width = 100
  const height = 36
  const step = values.length > 1 ? width / (values.length - 1) : width

  const points = values.map((value, index) => {
    const x = index * step
    const y = height - (value / max) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg
      className="admin-live__spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polygon
        className="admin-live__spark-area"
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
      />
      <polyline className="admin-live__spark-line" points={points.join(' ')} />
    </svg>
  )
}

export default function LivePresenceBar({ windowMinutes = 5 }) {
  const { t, locale } = useI18n()
  const [data, setData] = useState(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)
  const hasDataRef = useRef(false)

  useEffect(() => {
    hasDataRef.current = Boolean(data)
  }, [data])

  const number = useCallback(
    (value) =>
      new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0)),
    [locale],
  )

  const load = useCallback(async () => {
    try {
      const result = await fetchAnalyticsLive({ windowMinutes })
      if (!mountedRef.current) return
      setData(result)
      setStale(false)
      setFailed(false)
    } catch {
      if (!mountedRef.current) return
      setStale(true)
      if (!hasDataRef.current) setFailed(true)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [windowMinutes])

  useEffect(() => {
    mountedRef.current = true

    const tick = async () => {
      if (document.visibilityState === 'visible') await load()
      if (!mountedRef.current) return
      timerRef.current = window.setTimeout(tick, REFRESH_MS)
    }

    void tick()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMinutes])

  if (loading && !data) {
    return (
      <section
        className="admin-live admin-live--loading"
        aria-label={t('admin.analytics.live.aria')}
      >
        <p className="admin-live__loading">{t('admin.analytics.live.loading')}</p>
      </section>
    )
  }

  if (failed && !data) return null

  const visitors = Number(data?.visitors ?? 0)
  const pages = data?.pages ?? []
  const pageMax = Math.max(...pages.map((page) => Number(page.visitors ?? 0)), 1)

  const miniMetrics = [
    { key: 'identified', label: t('admin.analytics.live.identified'), value: data?.identified },
    { key: 'peakHour', label: t('admin.analytics.live.peakHour'), value: data?.peakLastHour },
    { key: 'peakToday', label: t('admin.analytics.live.peakToday'), value: data?.peakToday },
    { key: 'today', label: t('admin.analytics.live.today'), value: data?.visitorsToday },
  ]

  return (
    <section
      className={`admin-live${stale ? ' admin-live--stale' : ''}`}
      aria-label={t('admin.analytics.live.aria')}
    >
      <div className="admin-live__top">
        <div className="admin-live__hero">
          <p className="admin-live__status">
            <span className="admin-live__pulse" aria-hidden />
            <Radio size={13} aria-hidden />
            {stale ? t('admin.analytics.live.stale') : t('admin.analytics.live.now')}
          </p>

          <p className="admin-live__count" aria-live="polite" aria-atomic="true">
            <AnimatedNumber className="admin-live__count-value" value={visitors} />
            <span className="admin-live__count-unit">
              {visitors === 1
                ? t('admin.analytics.live.personSingular')
                : t('admin.analytics.live.personPlural')}
            </span>
          </p>

          <ConcurrencySparkline
            series={data?.series}
            label={t('admin.analytics.live.sparkAria', { peak: number(data?.peakLastHour) })}
          />
        </div>

        <dl className="admin-live__mini-grid">
          {miniMetrics.map((metric) => (
            <div key={metric.key} className="admin-live__mini">
              <dt>{metric.label}</dt>
              <dd>{number(metric.value)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {pages.length ? (
        <div className="admin-live__distribution">
          <p className="admin-live__distribution-title">{t('admin.analytics.live.distribution')}</p>
          <ul className="admin-live__pages">
            {pages.slice(0, 5).map((page) => {
              const pathMeta = formatAnalyticsPath(page.path, t)
              const fill = Number(page.visitors ?? 0) / pageMax
              return (
                <li key={page.path}>
                  <div className="admin-live__page-row">
                    <span
                      className={`admin-live__page-path${pathMeta.mono ? ' admin-live__page-path--mono' : ''}`}
                      title={page.path}
                    >
                      {pathMeta.label}
                    </span>
                    <span className="admin-live__page-count">{number(page.visitors)}</span>
                  </div>
                  <div className="admin-live__page-track" aria-hidden>
                    <span className="admin-live__page-fill" style={{ '--page-fill': fill }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="admin-live__empty">
          {t('admin.analytics.live.empty', { minutes: data?.windowMinutes ?? windowMinutes })}
        </p>
      )}

      {stale ? (
        <p className="admin-live__stale-note" role="status">
          <RefreshCw size={12} aria-hidden /> {t('admin.analytics.live.staleNote')}
        </p>
      ) : null}
    </section>
  )
}
