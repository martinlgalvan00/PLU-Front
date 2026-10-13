import { Fragment, useId, useState } from 'react'
import '../../styles/components/public-event-schedule.css'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatScheduleDate, formatScheduleTime } from '../../lib/eventSchedule.js'
import { formatPublicCompositionParts, pickInitialDayIndex } from '../../lib/publicSchedule.js'

const FOCUS_ALL = 'all'

/**
 * Pestañas tipográficas (días y filtro por tablado). Flechas, Inicio y Fin
 * mueven la selección; solo la pestaña activa entra en el orden de tabulación.
 */
function ScheduleTabs({ active, ariaLabel, className = '', idPrefix, items, onChange }) {
  function handleKeyDown(event) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const current = items.findIndex((item) => item.key === active)
    const last = items.length - 1
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length
    onChange(items[next].key)
    event.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      className={`public-schedule__tabs ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const isActive = item.key === active
        return (
          <button
            aria-controls={item.controls}
            aria-selected={isActive}
            className={`public-schedule__tab${isActive ? ' is-active' : ''}`}
            id={`${idPrefix}-${item.key}`}
            key={item.key}
            onClick={() => onChange(item.key)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            <span className="public-schedule__tab-label">{item.label}</span>
            {item.sub ? <span className="public-schedule__tab-sub"> {item.sub}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * PublicEventSchedule — PLU ARG
 *
 * Grilla de competencia publicada, un día a la vez. Cada tablado es una tabla
 * propia —hora, tanda y atletas— y a quién corresponde cada tanda (sexo,
 * categoría, división, peso, edad). Sin nombres de atletas: el dato público es
 * la composición.
 *
 * Lado a lado cuando el contenedor da el ancho; si no, apiladas con un filtro
 * por tablado para quien compite en uno solo. Cada tabla scrollea por dentro
 * con el encabezado fijo, así dos tablados de largo distinto no se estiran
 * entre sí ni alargan la página.
 *
 * `updatedAt` (ms) es cuándo se confirmó la grilla por última vez: se muestra como
 * "Actualizada 14:32" y avanza solo con cada refresco bueno.
 *
 * Recibe la grilla ya normalizada (`normalizePublicSchedule`); sin contenido no
 * renderiza nada, y el consumidor decide si dibuja el encabezado de la sección.
 */
export default function PublicEventSchedule({ className = '', schedule, updatedAt = null }) {
  const { locale, t } = useI18n()
  const baseId = useId()
  const [pickedDay, setPickedDay] = useState(null)
  const [focus, setFocus] = useState(FOCUS_ALL)
  if (!schedule?.hasContent) return null

  const labels = {
    sex: {
      Femenino: t('pages.pitbull.gridSexFemale'),
      Masculino: t('pages.pitbull.gridSexMale'),
    },
    years: t('pages.pitbull.gridYears'),
  }

  // La elección puede quedar vieja si la grilla se republica sin ese día.
  const day =
    schedule.days.find((entry) => entry.dayIndex === pickedDay) ??
    schedule.days.find((entry) => entry.dayIndex === pickInitialDayIndex(schedule.days)) ??
    schedule.days[0]
  const date = formatScheduleDate({ dayDate: day.date }, locale)
  const hasLanes = day.lanes.length > 1
  const activeFocus = day.lanes.some((lane) => lane.key === focus) ? focus : FOCUS_ALL
  const multiDay = schedule.days.length > 1
  const panelId = `${baseId}-panel`

  const summary = [
    day.sessionCount === 1
      ? t('pages.pitbull.gridFlightOne')
      : t('pages.pitbull.gridFlights', { count: day.sessionCount }),
    hasLanes ? t('pages.pitbull.gridPlatformsCount', { count: day.lanes.length }) : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={`public-schedule ${className}`.trim()}>
      {multiDay ? (
        <ScheduleTabs
          active={String(day.dayIndex)}
          ariaLabel={t('pages.pitbull.gridDaysAria')}
          className="public-schedule__days"
          idPrefix={`${baseId}-day`}
          items={schedule.days.map((entry) => ({
            key: String(entry.dayIndex),
            controls: panelId,
            label: entry.label,
            sub: formatScheduleDate({ dayDate: entry.date }, locale),
          }))}
          onChange={(key) => setPickedDay(Number(key))}
        />
      ) : null}

      <section
        className="public-schedule__day"
        id={panelId}
        key={day.dayIndex}
        role={multiDay ? 'tabpanel' : undefined}
        aria-labelledby={multiDay ? `${baseId}-day-${day.dayIndex}` : undefined}
        aria-label={multiDay ? undefined : [day.label, date].filter(Boolean).join(' · ')}
      >
        <header className="public-schedule__day-head">
          <h3 className={`public-schedule__day-name${multiDay ? ' visually-hidden' : ''}`}>
            {day.label}
            {date ? (
              <time className="public-schedule__day-date" dateTime={String(day.date).slice(0, 10)}>
                {date}
              </time>
            ) : null}
          </h3>
          <p className="public-schedule__day-summary">
            {summary}
            {updatedAt ? (
              <time
                className="public-schedule__updated"
                dateTime={new Date(updatedAt).toISOString()}
                key={updatedAt}
              >
                {t('pages.pitbull.gridUpdated', {
                  time: formatScheduleTime(new Date(updatedAt).toISOString(), locale),
                })}
              </time>
            ) : null}
          </p>
        </header>

        {hasLanes ? (
          <ScheduleTabs
            active={activeFocus}
            ariaLabel={t('pages.pitbull.gridFocusAria')}
            className="public-schedule__focus"
            idPrefix={`${baseId}-focus`}
            items={[
              { key: FOCUS_ALL, label: t('pages.pitbull.gridFocusAll') },
              ...day.lanes.map((lane) => ({ key: lane.key, label: lane.name })),
            ]}
            onChange={setFocus}
          />
        ) : null}

        <div className="public-schedule__panels" data-lanes={day.lanes.length}>
          {day.lanes.map((lane) => {
            const hiddenNarrow = activeFocus !== FOCUS_ALL && activeFocus !== lane.key
            const flights =
              lane.sessions.length === 1
                ? t('pages.pitbull.gridFlightOne')
                : t('pages.pitbull.gridFlights', { count: lane.sessions.length })
            const athletes =
              lane.athleteCount === 1
                ? t('pages.pitbull.gridAthleteOne')
                : t('pages.pitbull.gridAthletes', { count: lane.athleteCount })

            return (
              <div
                className="public-schedule__panel"
                data-hidden-narrow={hiddenNarrow || undefined}
                key={lane.key}
              >
                {lane.name ? (
                  <header className="public-schedule__panel-head">
                    <h4 className="public-schedule__panel-name">{lane.name}</h4>
                    <p className="public-schedule__panel-meta">
                      {[flights, lane.athleteCount > 0 ? athletes : ''].filter(Boolean).join(' · ')}
                    </p>
                  </header>
                ) : null}

                <div
                  className="public-schedule__scroll"
                  role={lane.name ? 'group' : undefined}
                  aria-label={lane.name || undefined}
                  tabIndex={0}
                >
                  <table className="public-schedule__table">
                    <thead>
                      <tr>
                        <th scope="col">{t('pages.pitbull.gridColTime')}</th>
                        <th scope="col">{t('pages.pitbull.gridColFlight')}</th>
                        <th scope="col" className="public-schedule__num">
                          {t('pages.pitbull.gridColAthletes')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lane.sessions.map((session, index) => {
                        const start = formatScheduleTime(session.startsAt, locale)
                        const weighIn = formatScheduleTime(session.weighInAt, locale)
                        const { profile, range } = formatPublicCompositionParts(session, labels)
                        return (
                          <tr key={`${session.name}-${index}`}>
                            <th scope="row" className="public-schedule__time">
                              {start ? (
                                <time
                                  className="public-schedule__start"
                                  dateTime={session.startsAt}
                                >
                                  {start}
                                </time>
                              ) : (
                                <span className="public-schedule__tbd">
                                  {t('pages.pitbull.gridTimeTbd')}
                                </span>
                              )}
                              {weighIn ? (
                                <span className="public-schedule__weighin">
                                  {t('pages.pitbull.gridWeighIn')}{' '}
                                  <time dateTime={session.weighInAt}>{weighIn}</time>
                                </span>
                              ) : null}
                            </th>
                            <td className="public-schedule__flight">
                              <span className="public-schedule__session-name">{session.name}</span>
                              {profile ? (
                                <span className="public-schedule__session-profile">{profile}</span>
                              ) : null}
                              {range ? (
                                <span className="public-schedule__session-range">
                                  {/* Cada rango en una pieza: no se parte "18–23 años". */}
                                  {range.split(' · ').map((part, position) => (
                                    <Fragment key={part}>
                                      {position > 0 ? ' · ' : null}
                                      <span className="public-schedule__nowrap">{part}</span>
                                    </Fragment>
                                  ))}
                                </span>
                              ) : null}
                            </td>
                            <td className="public-schedule__num public-schedule__count">
                              {session.athleteCount > 0 ? session.athleteCount : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
