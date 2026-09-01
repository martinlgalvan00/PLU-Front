import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildMonthMatrix, calendarIntensity, monthDayKey } from '../../lib/analyticsCalendar.js'

/**
 * AnalyticsCalendarHeatmap — PLU ARG
 *
 * Calendario de visitas: un mes por vista, con la intensidad de cada dia
 * proporcional a los visitantes que entraron. Es la respuesta visual a "que
 * paso este mes": los picos de evento y los baches se ven antes de leer
 * numero alguno.
 *
 * Los dias sin trafico no son botones: no hay nada que abrir. El dia
 * seleccionado abre su detalle abajo, con la comparacion contra el promedio
 * de los ultimos 30 dias con datos para darle escala al numero.
 */

const WEEKDAY_KEYS = [
  'admin.analytics.calendar.weekdays.mon',
  'admin.analytics.calendar.weekdays.tue',
  'admin.analytics.calendar.weekdays.wed',
  'admin.analytics.calendar.weekdays.thu',
  'admin.analytics.calendar.weekdays.fri',
  'admin.analytics.calendar.weekdays.sat',
  'admin.analytics.calendar.weekdays.sun',
]

function parseDay(day) {
  const [year, month, date] = String(day ?? '').split('-').map(Number)
  return { year, month: (month ?? 1) - 1, date: date ?? 1 }
}

export default function AnalyticsCalendarHeatmap({ series = [], peak = null }) {
  const { locale, t } = useI18n()
  const byDay = useMemo(() => {
    const map = new Map()
    for (const day of series) {
      if (day?.day) map.set(day.day, day)
    }
    return map
  }, [series])

  const lastDay = series.length > 0 ? parseDay(series[series.length - 1].day) : null
  const firstDay = series.length > 0 ? parseDay(series[0].day) : null

  const [view, setView] = useState(() => ({
    year: lastDay?.year ?? new Date().getFullYear(),
    month: lastDay?.month ?? new Date().getMonth(),
  }))
  const [selected, setSelected] = useState(null)

  const maxVisitors = useMemo(
    () => Math.max(...series.map((day) => Number(day?.visitors ?? 0)), 1),
    [series],
  )

  const monthTitle = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(view.year, view.month, 1))

  const weeks = useMemo(() => buildMonthMatrix(view.year, view.month), [view])

  function canGoBack() {
    if (!firstDay) return false
    const target = new Date(view.year, view.month, 1)
    const floor = new Date(firstDay.year, firstDay.month, 1)
    return target > floor
  }

  function canGoForward() {
    if (!lastDay) return false
    const target = new Date(view.year, view.month, 1)
    const ceil = new Date(lastDay.year, lastDay.month, 1)
    return target < ceil
  }

  function shiftMonth(delta) {
    setSelected(null)
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const number = (value) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-AR').format(Number(value ?? 0))

  const selectedDay = selected ? byDay.get(selected) : null
  const selectedDate = selected ? parseDay(selected) : null

  const comparison = useMemo(() => {
    if (!selectedDay) return null
    // Promedio de los ultimos 30 dias con datos hasta el dia elegido: comparar
    // contra la ventana entera mediria hoy contra el futuro.
    const index = series.findIndex((day) => day.day === selected)
    if (index < 0) return null
    const windowStart = Math.max(0, index - 29)
    const window = series.slice(windowStart, index + 1)
    const withTraffic = window.filter((day) => Number(day.visitors ?? 0) > 0)
    if (withTraffic.length === 0) return null
    const average =
      withTraffic.reduce((sum, day) => sum + Number(day.visitors ?? 0), 0) / withTraffic.length
    return { average, days: withTraffic.length }
  }, [selected, selectedDay, series])

  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(selectedDate.year, selectedDate.month, selectedDate.date))
    : ''

  if (series.length === 0) {
    return <p className="admin-analytics__empty">{t('admin.analytics.calendar.empty')}</p>
  }

  return (
    <div className="admin-analytics__calendar">
      <header className="admin-analytics__calendar-head">
        <button
          type="button"
          className="admin-analytics__calendar-nav"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack()}
          aria-label={t('admin.analytics.calendar.prevMonth', { month: monthTitle })}
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <p className="admin-analytics__calendar-title" aria-live="polite">
          {monthTitle}
        </p>
        <button
          type="button"
          className="admin-analytics__calendar-nav"
          onClick={() => shiftMonth(1)}
          disabled={!canGoForward()}
          aria-label={t('admin.analytics.calendar.nextMonth', { month: monthTitle })}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </header>

      <div
        className="admin-analytics__calendar-grid"
        role="grid"
        aria-label={t('admin.analytics.calendar.aria', { month: monthTitle })}
      >
        <div role="row" className="admin-analytics__calendar-weekdays">
          {WEEKDAY_KEYS.map((key) => (
            <span key={key} role="columnheader">
              {t(key)}
            </span>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div role="row" key={weekIndex} className="admin-analytics__calendar-week">
            {week.map((day, dayIndex) => {
              if (day === null) {
                return (
                  <span
                    role="gridcell"
                    key={dayIndex}
                    className="admin-analytics__calendar-cell admin-analytics__calendar-cell--pad"
                  />
                )
              }
              const key = monthDayKey(view.year, view.month, day)
              const data = byDay.get(key)
              const visitors = Number(data?.visitors ?? 0)
              const intensity = calendarIntensity(visitors, maxVisitors)
              const isSelected = selected === key
              const isPeak = Boolean(peak?.day && peak.day === key && visitors > 0)
              const dayDateLabel = new Intl.DateTimeFormat(
                locale === 'en' ? 'en-US' : 'es-AR',
                { day: 'numeric', month: 'long' },
              ).format(new Date(view.year, view.month, day))

              if (!data || visitors === 0) {
                return (
                  <span
                    role="gridcell"
                    key={dayIndex}
                    className="admin-analytics__calendar-cell admin-analytics__calendar-cell--empty"
                    aria-label={t('admin.analytics.calendar.dayNoVisits', { day: dayDateLabel })}
                  >
                    {day}
                  </span>
                )
              }

              return (
                <span role="gridcell" key={dayIndex} className="admin-analytics__calendar-cell">
                  <button
                    type="button"
                    className={`admin-analytics__calendar-day${isSelected ? ' is-selected' : ''}${isPeak ? ' is-peak' : ''}`}
                    style={{ '--calendar-intensity': intensity }}
                    onClick={() => setSelected(isSelected ? null : key)}
                    aria-pressed={isSelected}
                    aria-label={t('admin.analytics.calendar.dayAria', {
                      day: dayDateLabel,
                      visitors: number(visitors),
                    })}
                    title={t('admin.analytics.calendar.dayAria', {
                      day: dayDateLabel,
                      visitors: number(visitors),
                    })}
                  >
                    {day}
                  </button>
                </span>
              )
            })}
          </div>
        ))}
      </div>

      <p className="admin-analytics__calendar-legend" aria-hidden>
        <span>{t('admin.analytics.calendar.legendLess')}</span>
        <span className="admin-analytics__calendar-scale">
          {[0.15, 0.35, 0.55, 0.75, 1].map((level) => (
            <span
              key={level}
              className="admin-analytics__calendar-swatch"
              style={{ '--calendar-intensity': level }}
            />
          ))}
        </span>
        <span>{t('admin.analytics.calendar.legendMore')}</span>
      </p>

      {selectedDay ? (
        <div className="admin-analytics__calendar-detail" aria-live="polite">
          <header>
            <h4>{selectedDateLabel}</h4>
            {peak?.day === selected ? (
              <span className="admin-analytics__calendar-peak">
                {t('admin.analytics.calendar.peakBadge')}
              </span>
            ) : null}
          </header>
          <dl className="admin-analytics__calendar-detail-grid">
            <div>
              <dt>{t('admin.analytics.metrics.visitors')}</dt>
              <dd>{number(selectedDay.visitors)}</dd>
            </div>
            <div>
              <dt>{t('admin.analytics.metrics.sessions')}</dt>
              <dd>{number(selectedDay.sessions)}</dd>
            </div>
            <div>
              <dt>{t('admin.analytics.metrics.pageviews')}</dt>
              <dd>{number(selectedDay.pageviews)}</dd>
            </div>
            <div>
              <dt>{t('admin.analytics.calendar.detailAverage')}</dt>
              <dd>
                {comparison
                  ? t('admin.analytics.calendar.detailAverageValue', {
                      average: number(Math.round(comparison.average)),
                      days: comparison.days,
                    })
                  : '—'}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="admin-analytics__calendar-hint">
          {t('admin.analytics.calendar.hint')}
        </p>
      )}
    </div>
  )
}
