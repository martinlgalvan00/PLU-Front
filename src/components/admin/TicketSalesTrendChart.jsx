import { useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * TicketSalesTrendChart — PLU ARG
 *
 * Serie diaria de entradas vendidas para el tab "Análisis" de Pagos. Misma
 * técnica SVG que `AnalyticsTrafficChart.jsx` (área + línea + cursor por
 * puntero/teclado) pero de una sola serie -- sus campos (`visitors`,
 * `sessions`, `pageviews`) son de analítica web, no de ventas, así que no se
 * reusa el componente: se sigue la misma regla del repo ("SVG propio, sin
 * librería nueva") con la forma de dato que corresponde acá (`{ date,
 * count }`).
 */

const WIDTH = 100
const HEIGHT = 44

function parseDay(day) {
  // `YYYY-MM-DD` sin zona: parsearlo con `new Date(str)` lo clava en
  // medianoche UTC y en zonas negativas corre el dia hacia atras.
  const [year, month, date] = String(day ?? '').split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, date ?? 1)
}

function dayLabel(day, locale) {
  const date = parseDay(day)
  if (Number.isNaN(date.getTime())) return String(day ?? '')
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export default function TicketSalesTrendChart({ series = [] }) {
  const { locale, t } = useI18n()
  const [cursor, setCursor] = useState(null)
  const svgRef = useRef(null)

  const points = useMemo(
    () =>
      series.map((day) => ({
        date: day.date,
        label: dayLabel(day.date, locale),
        count: Number(day.count ?? 0),
      })),
    [locale, series],
  )

  const max = Math.max(...points.map((point) => point.count), 1)

  const geometry = useMemo(() => {
    if (points.length === 0) return null
    const step = points.length > 1 ? WIDTH / (points.length - 1) : WIDTH
    const coords = points.map((point, index) => {
      const x = index * step
      const y = HEIGHT - (point.count / max) * (HEIGHT - 4) - 2
      return { x, y }
    })
    const line = coords.map((coord) => `${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ')
    const area = `0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`
    return { coords, line, area }
  }, [max, points])

  const cursorPoint = cursor !== null && points[cursor] ? points[cursor] : null
  const cursorCoord = cursor !== null && geometry?.coords[cursor] ? geometry.coords[cursor] : null

  function moveCursorFromEvent(event) {
    if (!geometry || !svgRef.current || points.length === 0) return
    const bounds = svgRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    setCursor(Math.round(ratio * (points.length - 1)))
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
    ? t('admin.ticketSalesAnalysis.trend.cursorAria', {
        day: cursorPoint.label,
        value: number(cursorPoint.count),
      })
    : t('admin.ticketSalesAnalysis.trend.chartAria', { days: points.length, max: number(max) })

  if (points.length === 0 || !geometry) {
    return <p className="admin-analytics__empty">{t('admin.ticketSalesAnalysis.trend.empty')}</p>
  }

  return (
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
          <strong>{number(cursorPoint.count)}</strong>
          <span>{cursorPoint.label}</span>
        </p>
      ) : null}
    </div>
  )
}
