import '../../styles/components/public-event-schedule.css'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatScheduleDate, formatScheduleTime } from '../../lib/eventSchedule.js'
import { formatPublicComposition } from '../../lib/publicSchedule.js'

/**
 * PublicEventSchedule — PLU ARG
 *
 * Grilla de competencia publicada: por día, una columna por tablado con sus
 * tandas, horario y a quién corresponde cada una (sexo, categoría, división,
 * peso, edad). Sin nombres de atletas: el dato público es la composición.
 *
 * Recibe la grilla ya normalizada (`normalizePublicSchedule`); sin contenido no
 * renderiza nada, y el consumidor decide si dibuja el encabezado de la sección.
 */
export default function PublicEventSchedule({ className = '', schedule }) {
  const { locale, t } = useI18n()
  if (!schedule?.hasContent) return null

  const labels = {
    sex: {
      Femenino: t('pages.pitbull.gridSexFemale'),
      Masculino: t('pages.pitbull.gridSexMale'),
    },
    years: t('pages.pitbull.gridYears'),
  }

  return (
    <div className={`public-schedule ${className}`.trim()}>
      {schedule.days.map((day) => {
        const date = formatScheduleDate({ dayDate: day.date }, locale)
        return (
          <section
            className="public-schedule__day"
            key={day.dayIndex}
            aria-label={[day.label, date].filter(Boolean).join(' · ')}
          >
            <h3 className="public-schedule__day-name">
              {day.label}
              {date ? (
                <time className="public-schedule__day-date" dateTime={String(day.date).slice(0, 10)}>
                  {date}
                </time>
              ) : null}
            </h3>

            <div className="public-schedule__lanes" data-lanes={day.lanes.length}>
              {day.lanes.map((lane) => (
                <div
                  className="public-schedule__lane"
                  key={lane.key}
                  role="group"
                  aria-label={lane.name || undefined}
                >
                  {lane.name ? <h4 className="public-schedule__lane-name">{lane.name}</h4> : null}
                  <ol className="public-schedule__sessions">
                    {lane.sessions.map((session) => {
                      const weighIn = formatScheduleTime(session.weighInAt, locale)
                      const starts = formatScheduleTime(session.startsAt, locale)
                      const composition = formatPublicComposition(session, labels)
                      return (
                        <li className="public-schedule__session" key={`${lane.key}-${session.name}`}>
                          <div className="public-schedule__session-head">
                            <span className="public-schedule__session-name">{session.name}</span>
                            {session.athleteCount > 0 ? (
                              <span className="public-schedule__session-count">
                                {session.athleteCount === 1
                                  ? t('pages.pitbull.gridAthleteOne')
                                  : t('pages.pitbull.gridAthletes', {
                                      count: session.athleteCount,
                                    })}
                              </span>
                            ) : null}
                          </div>
                          {weighIn || starts ? (
                            <p className="public-schedule__session-times">
                              {weighIn ? (
                                <span>
                                  {t('pages.pitbull.gridWeighIn')}{' '}
                                  <time dateTime={session.weighInAt}>{weighIn}</time>
                                </span>
                              ) : null}
                              {starts ? (
                                <span>
                                  {t('pages.pitbull.gridStarts')}{' '}
                                  <time dateTime={session.startsAt}>{starts}</time>
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                          {composition ? (
                            <p className="public-schedule__session-composition">{composition}</p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
