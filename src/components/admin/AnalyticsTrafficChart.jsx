import { useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * AnalyticsTrafficChart — PLU ARG
 *
 * Grafico de la serie diaria de visitantes, sesiones o paginas vistas. SVG
 * propio, sin libreria nueva: con el area de LivePresenceBar y el heatmap de
 * clicks ya en produccion, una dependencia de charting seria el primer paquete
 * que entra para hacer lo que el sistema ya sabe dibujar.
 *
 * Interaccion: hover con puntero y flechas del teclado sobre el mismo cursor.
 * La serie completa no se vuelca a una tabla oculta --365 filas por cada
 * render seria ruido para el lector de pantalla; el resumen accesible lo dan
 * los tiles de mejor/peor dia y el pico que acompanan al grafico.
 */

const METRICS = [
  { id: 'visitors', labelKey: 'admin.analytics.metrics.visitors' },
  { id: 'sessions', labelKey: 'admin.analytics.metrics.sessions' },
  { id: 'pageviews', labelKey: 'admin.analytics.metrics.pageviews' },
]

const WIDTH = 100
const HEIGHT = 44

function parseDay(day) {
  // `YYYY-MM-DD` viene sin zona: parsearlo con `new Date(str)` lo clava en
  // medianoche local y en zonas negativas corre el dia hacia atras.
  const [year, month, date] = String(day ?? '').split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, date ?? 1)
}

function dayLabel(day, locale) {
  const date = parseDay(day)
  if (Number.isNaN(date.getTime())) return String(day ?? '')
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export default function AnalyticsTrafficChart({ series = [] }) {
  const { locale, t } = useI18n()
  const [metric, setMetric] = useState('visitors')
  const [cursor, setCursor] = useState(null)
  const svgRef = useRef(null)

  const points = useMemo(
    () =>
      series.map((day) => ({
        day: day.day,
        label: dayLabel(day.day, locale),
        visitors: Number(day.visitors ?? 0),
        sessions: Number(day.sessions ?? 0),
        pageviews: Number(day.pageviews ?? 0),
      })),
    [locale, series],
  )

  const values = points.map((point) => point[metric])
  const max = Math.max(...values, 1)

  const geometry = useMemo(() => {
    if (points.length === 0) return null
    const step = points.length > 1 ? WIDTH / (points.length - 1) : WIDTH
    const coords = points.map((point, index) => {
      const x = index * step
      const y = HEIGHT - (point[metric] / max) * (HEIGHT - 4) - 2
      return { x, y }
    })
    const line = coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ')
    const area = `0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`
    return { step, coords, line, area }
  }, [max, metric, points])

  const cursorPoint = cursor !== null && points[cursor] ? points[cursor] : null
  const cursorCoord =
    cursor !== null && geometry?.coords[cursor] ? geometry.coords[cursor] : null

  function moveCursorFromEvent(event) {
    if (!geometry || !svgRef.current || points.length === 0) return
    const bounds = svgRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const index = Math.round(ratio * (points.length - 1))
    setCursor(index)
  }

  function handleKeyDown(event) {
    if (!geometry || points.length === 0) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? -1 : 1
      setCursor((current) => {
        const base = current ?? (delta > 0 ? -1 : points.length)
        return Math.min(points.length - 1, Math.max(0, base + delta))
      })
    } else if (event.key === 'Escape') {
      setCursor(null)
    }
  }

  const number = (value) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0))

  const summaryAria = cursorPoint
    ? t('admin.analytics.traffic.cursorAria', {
        day: cursorPoint.label,
        value: number(cursorPoint[metric]),
      })
    : t('admin.analytics.traffic.chartAria', {
        days: points.length,
        max: number(max),
      })

  return (
    <div className="admin-analytics__traffic">
      <div
        className="admin-analytics__devices admin-analytics__traffic-metrics"
        role="group"
        aria-label={t('admin.analytics.traffic.metricLabel')}
      >
        {METRICS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === metric ? 'is-active' : ''}
            aria-pressed={item.id === metric}
            onClick={() => {
              setMetric(item.id)
              setCursor(null)
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {points.length === 0 || !geometry ? (
        <p className="admin-analytics__empty">{t('admin.analytics.traffic.empty')}</p>
      ) : (
        <div
          className="admin-analytics__traffic-chart"
          tabIndex={0}
          role="img"
          aria-label={summaryAria}
          onKeyDown={handleKeyDown}
          onPointerLeave={() => setCursor(null)}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden
            onPointerMove={moveCursorFromEvent}
          >
            <polygon className="admin-analytics__traffic-area" points={geometry.area} />
            <polyline
              className="admin-analytics__traffic-line"
              points={geometry.line}
              vectorEffect="non-scaling-stroke"
            />
            {cursorCoord ? (
              <>
                <line
                  className="admin-analytics__traffic-cursor-line"
                  x1={cursorCoord.x}
                  y1={0}
                  x2={cursorCoord.x}
                  y2={HEIGHT}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="admin-analytics__traffic-cursor-dot"
                  cx={cursorCoord.x}
                  cy={cursorCoord.y}
                  r={1.4}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          <div className="admin-analytics__traffic-axis" aria-hidden>
            <span>{points[0]?.label}</span>
            <span>{number(max)}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>

          {cursorPoint ? (
            <p className="admin-analytics__traffic-tooltip" aria-live="polite">
              <strong>{number(cursorPoint[metric])}</strong>
              <span>{cursorPoint.label}</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
