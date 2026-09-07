import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatDayMonth } from '../../lib/format.js'
import {
  fetchAnalyticsDashboardSummary,
  fetchAnalyticsLive,
  fetchAnalyticsTimeseries,
} from '../../services/analyticsReportService.js'

/**
 * DashboardTrafficCard — PLU ARG
 *
 * Puente entre el tablero operativo y la analitica: cuanta gente hay ahora,
 * como viene el dia y cual es la curva reciente. El informe completo vive en
 * su seccion; aca solo entra lo que cambia una decision en el turno.
 *
 * Tres lecturas, no cinco: el resumen del dia (60s), la presencia en vivo
 * (30s, mas lenta que los 15s de LivePresenceBar porque esta franja acompana)
 * y la serie de 14 dias para la curva. Si una falla, las otras siguen.
 */

const SUMMARY_MS = 60_000
const LIVE_MS = 30_000
const SERIES_DAYS = 14
const LIVE_WINDOW_MINUTES = 5

function settledValue(result) {
  return result.status === 'fulfilled' ? result.value : null
}

function sparkDotStyle(coord, height) {
  return {
    '--spark-x': `${coord.x}%`,
    '--spark-y': `${(coord.y / height) * 100}%`,
  }
}

function HistorySparkline({ series, label, startLabel, endLabel }) {
  if (!series?.length) return null

  const values = series.map((day) => Number(day.visitors ?? 0))
  const max = Math.max(...values, 1)
  const width = 100
  const height = 36
  const step = values.length > 1 ? width / (values.length - 1) : width
  const coords = values.map((value, index) => ({
    x: index * step,
    y: height - (value / max) * (height - 6) - 3,
  }))
  const line = coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  const last = coords.at(-1)
  const peakIndex = values.reduce(
    (best, value, index) => (value >= values[best] ? index : best),
    0,
  )
  const peak = coords[peakIndex]
  const lastIsPeak = peakIndex === coords.length - 1

  return (
    <div className="admin-ops__traffic-spark">
      <div className="admin-ops__traffic-spark-frame">
        <svg
          className="admin-ops__traffic-spark-plot"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
        >
          <polygon className="admin-ops__traffic-spark-area" points={area} />
          <polyline
            className="admin-ops__traffic-spark-line"
            points={line}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {peak && !lastIsPeak ? (
          <span
            className="admin-ops__traffic-spark-dot admin-ops__traffic-spark-dot--peak"
            style={sparkDotStyle(peak, height)}
            aria-hidden
          />
        ) : null}
        {last ? (
          <span
            className="admin-ops__traffic-spark-dot"
            style={sparkDotStyle(last, height)}
            aria-hidden
          />
        ) : null}
      </div>
      {startLabel || endLabel ? (
        <p className="admin-ops__traffic-spark-axis" aria-hidden>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </p>
      ) : null}
    </div>
  )
}

export default function DashboardTrafficCard({ onNavigate }) {
  const { locale, t } = useI18n()
  const [summary, setSummary] = useState(null)
  const [live, setLive] = useState(null)
  const [series, setSeries] = useState(null)
  const [liveStale, setLiveStale] = useState(false)
  const [ready, setReady] = useState(false)
  const summaryTimerRef = useRef(null)
  const liveTimerRef = useRef(null)
  const mountedRef = useRef(true)
  const hasLiveRef = useRef(false)

  useEffect(() => {
    hasLiveRef.current = Boolean(live)
  }, [live])

  const loadSnapshot = useCallback(async () => {
    const [summaryResult, seriesResult] = await Promise.allSettled([
      fetchAnalyticsDashboardSummary(),
      fetchAnalyticsTimeseries({ days: SERIES_DAYS }),
    ])
    if (!mountedRef.current) return

    const nextSummary = settledValue(summaryResult)
    const nextSeries = settledValue(seriesResult)?.series ?? null
    if (nextSummary) setSummary(nextSummary)
    if (Array.isArray(nextSeries) && nextSeries.length > 0) setSeries(nextSeries)
  }, [])

  const loadLive = useCallback(async () => {
    try {
      const result = await fetchAnalyticsLive({ windowMinutes: LIVE_WINDOW_MINUTES })
      if (!mountedRef.current) return
      setLive(result)
      setLiveStale(false)
    } catch {
      if (!mountedRef.current) return
      if (hasLiveRef.current) setLiveStale(true)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    const start = async () => {
      await Promise.all([loadSnapshot(), loadLive()])
      if (mountedRef.current) setReady(true)
    }

    const tickSnapshot = async () => {
      if (document.visibilityState === 'visible') await loadSnapshot()
      if (!mountedRef.current) return
      summaryTimerRef.current = window.setTimeout(tickSnapshot, SUMMARY_MS)
    }

    const tickLive = async () => {
      if (document.visibilityState === 'visible') await loadLive()
      if (!mountedRef.current) return
      liveTimerRef.current = window.setTimeout(tickLive, LIVE_MS)
    }

    void start().then(() => {
      if (!mountedRef.current) return
      summaryTimerRef.current = window.setTimeout(tickSnapshot, SUMMARY_MS)
      liveTimerRef.current = window.setTimeout(tickLive, LIVE_MS)
    })

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      void loadSnapshot()
      void loadLive()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibility)
      if (summaryTimerRef.current) window.clearTimeout(summaryTimerRef.current)
      if (liveTimerRef.current) window.clearTimeout(liveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasLive = Boolean(live)
  if (!ready || (!summary && !hasLive && !series)) return null

  const todayVisitors = Number(summary?.today?.visitors ?? 0)
  const yesterdayVisitors = Number(summary?.yesterday?.visitors ?? 0)
  const last7Visitors = Number(summary?.last7?.visitors ?? 0)
  const peak = summary?.peak ?? null
  const liveVisitors = Number(live?.visitors ?? 0)
  const peakToday = live?.peakToday
  const heroValue = hasLive ? liveVisitors : todayVisitors

  const number = (value) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0))

  const firstDay = series?.[0]?.day
  const lastDay = series?.at(-1)?.day
  const seriesMax = Math.max(...(series ?? []).map((day) => Number(day.visitors ?? 0)), 0)

  return (
    <section
      className={`admin-ops__traffic${liveStale ? ' admin-ops__traffic--stale' : ''}`}
      aria-label={t('admin.dashboard.traffic.aria')}
    >
      <header className="admin-ops__traffic-head">
        <p className="admin-ops__eyebrow">{t('admin.dashboard.traffic.eyebrow')}</p>
        <button
          type="button"
          className="admin-dashboard-link admin-ops__traffic-link"
          onClick={() => onNavigate?.('analytics')}
        >
          {t('admin.dashboard.traffic.viewReport')}
          <ArrowRight size={12} aria-hidden />
        </button>
      </header>

      <div className="admin-ops__traffic-readout">
        <div className="admin-ops__traffic-now">
          <p className="admin-ops__traffic-status">
            {hasLive ? <span className="admin-ops__traffic-pulse" aria-hidden /> : null}
            {hasLive
              ? liveStale
                ? t('admin.dashboard.traffic.stale')
                : t('admin.dashboard.traffic.now')
              : t('admin.dashboard.traffic.todayLabel')}
          </p>
          <p
            className="admin-ops__traffic-count"
            aria-live={hasLive ? 'polite' : undefined}
            aria-atomic={hasLive ? 'true' : undefined}
          >
            <AnimatedNumber className="admin-ops__traffic-value" value={heroValue} />
            <span className="admin-ops__traffic-unit">
              {hasLive
                ? liveVisitors === 1
                  ? t('admin.dashboard.traffic.nowUnitSingular')
                  : t('admin.dashboard.traffic.nowUnitPlural')
                : todayVisitors === 1
                  ? t('admin.dashboard.traffic.personSingular')
                  : t('admin.dashboard.traffic.personPlural')}
            </span>
          </p>
          {summary ? (
            <p className="admin-ops__traffic-today">
              {hasLive ? (
                <span>{t('admin.dashboard.traffic.todayCount', { count: number(todayVisitors) })}</span>
              ) : null}
              <span>
                {t('admin.dashboard.traffic.yesterdayCount', { count: number(yesterdayVisitors) })}
              </span>
            </p>
          ) : null}
        </div>

        <HistorySparkline
          series={series}
          label={t('admin.dashboard.traffic.sparkAria', {
            days: series?.length ?? SERIES_DAYS,
            max: number(seriesMax),
          })}
          startLabel={firstDay ? formatDayMonth(firstDay, locale) : ''}
          endLabel={lastDay ? formatDayMonth(lastDay, locale) : ''}
        />
      </div>

      {summary || peakToday != null ? (
        <ul className="admin-ops__traffic-meta">
          {summary ? (
            <li>{t('admin.dashboard.traffic.last7', { count: number(last7Visitors) })}</li>
          ) : null}
          {peak?.day ? (
            <li>
              {t('admin.dashboard.traffic.peak', {
                count: number(peak.visitors),
                date: formatDayMonth(peak.day, locale),
              })}
            </li>
          ) : null}
          {hasLive && peakToday != null ? (
            <li>{t('admin.dashboard.traffic.peakToday', { count: number(peakToday) })}</li>
          ) : null}
        </ul>
      ) : null}
    </section>
  )
}
