import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight } from 'lucide-react'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatDayMonth } from '../../lib/format.js'
import { fetchAnalyticsDashboardSummary } from '../../services/analyticsReportService.js'

/**
 * DashboardTrafficCard — PLU ARG
 *
 * Puente entre el tablero operativo y la analitica del sitio: cuanta gente
 * entro hoy, como viene la semana y cual es el record historico, en una sola
 * lectura. El resto del informe vive en su seccion; aca solo entra el numero
 * que cambia la decision del dia.
 *
 * Refresco cada 60 segundos -- mas agresivo (los 15s de LivePresenceBar)
 * sobra para una franja acompanante, y menos la dejaria vieja todo el turno.
 * Si falla y todavia no hay datos, la franja desaparece: el tablero no tiene
 * que explicar la analitica, solo mostrarla cuando esta.
 */

const REFRESH_MS = 60_000

function percentChange(current, previous) {
  const prev = Number(previous ?? 0)
  if (!(prev > 0)) return null
  return (Number(current ?? 0) - prev) / prev
}

export default function DashboardTrafficCard({ onNavigate }) {
  const { locale, t } = useI18n()
  const [summary, setSummary] = useState(null)
  const [failed, setFailed] = useState(false)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    try {
      const result = await fetchAnalyticsDashboardSummary()
      if (!mountedRef.current) return
      setSummary(result)
      setFailed(false)
    } catch {
      if (!mountedRef.current) return
      setFailed(true)
    }
  }, [])

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
  }, [])

  if (!summary || failed) return null

  const todayVisitors = Number(summary.today?.visitors ?? 0)
  const yesterdayVisitors = Number(summary.yesterday?.visitors ?? 0)
  const last7Visitors = Number(summary.last7?.visitors ?? 0)
  const previous7Visitors = Number(summary.previous7?.visitors ?? 0)
  const peak = summary.peak ?? null

  const dayChange = percentChange(todayVisitors, yesterdayVisitors)
  const weekChange = percentChange(last7Visitors, previous7Visitors)

  const number = (value) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0))

  const deltaLabel = (value) => {
    if (value === null) return null
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR', {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(value)
  }

  const dayDelta = deltaLabel(dayChange)
  const weekDelta = deltaLabel(weekChange)

  return (
    <section className="admin-ops__traffic" aria-label={t('admin.dashboard.traffic.aria')}>
      <div className="admin-ops__traffic-hero">
        <p className="admin-ops__eyebrow">
          <Activity size={12} aria-hidden /> {t('admin.dashboard.traffic.eyebrow')}
        </p>
        <p className="admin-ops__traffic-count">
          <AnimatedNumber className="admin-ops__traffic-value" value={todayVisitors} />
          <span className="admin-ops__traffic-unit">
            {todayVisitors === 1
              ? t('admin.dashboard.traffic.personSingular')
              : t('admin.dashboard.traffic.personPlural')}
          </span>
        </p>
        <p className="admin-ops__traffic-note">
          {dayDelta
            ? t('admin.dashboard.traffic.vsYesterday', { delta: dayDelta })
            : t('admin.dashboard.traffic.today')}
        </p>
      </div>

      <dl className="admin-ops__traffic-mini">
        <div className="admin-ops__traffic-stat">
          <dt>{t('admin.dashboard.traffic.last7')}</dt>
          <dd>
            {number(last7Visitors)}
            {weekDelta ? (
              <span
                className={`admin-ops__traffic-delta admin-ops__traffic-delta--${weekChange > 0 ? 'up' : weekChange < 0 ? 'down' : 'flat'}`}
              >
                {weekDelta}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="admin-ops__traffic-stat">
          <dt>{t('admin.dashboard.traffic.peak')}</dt>
          <dd>{peak ? number(peak.visitors) : '—'}</dd>
          {peak?.day ? (
            <p className="admin-ops__traffic-peak-date">{formatDayMonth(peak.day, locale)}</p>
          ) : null}
        </div>
        <div className="admin-ops__traffic-stat">
          <dt>{t('admin.dashboard.traffic.yesterday')}</dt>
          <dd>{number(yesterdayVisitors)}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="admin-dashboard-link admin-ops__traffic-link"
        onClick={() => onNavigate?.('analytics')}
      >
        {t('admin.dashboard.traffic.viewReport')}
        <ArrowRight size={12} aria-hidden />
      </button>
    </section>
  )
}
