import { useMemo } from 'react'
import { formatScheduleTime } from '../../../lib/eventSchedule.js'

/**
 * PlanPreview — PLU ARG
 *
 * La propuesta del asistente: cuánto se arma, qué tan parejo queda (tamaño de
 * tandas y carga por tablado) y la lista día por día. Lo que no cierra (mezcla
 * de sexos, gente que no entró) se dice acá, antes de confirmar.
 */
export default function PlanPreview({ athletes, locale, plan, t }) {
  const byDay = useMemo(() => {
    const map = new Map()
    for (const row of plan.summaries) {
      if (!map.has(row.dayIndex)) map.set(row.dayIndex, { label: row.dayLabel, rows: [] })
      map.get(row.dayIndex).rows.push(row)
    }
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [plan.summaries])

  const platformLoads = plan.stats.byPlatform
  const maxLoad = Math.max(1, ...platformLoads.map((platform) => platform.athletes))

  if (athletes === 0) {
    return (
      <p className="admin-board__empty admin-board__empty--inline">{t('admin.board.previewEmpty')}</p>
    )
  }
  if (plan.summaries.length === 0) {
    return (
      <p className="admin-board__empty admin-board__empty--inline">{t('admin.board.planNothing')}</p>
    )
  }

  return (
    <>
      <p className="admin-board__plan-summary">
        {t('admin.board.planStats', {
          athletes: plan.placed,
          sessions: plan.stats.sessions,
          created: plan.stats.newSessions,
          min: plan.stats.smallest,
          max: plan.stats.largest,
        })}
      </p>

      {platformLoads.length > 1 ? (
        <ul className="admin-board__plan-loads" aria-label={t('admin.board.planLoadAria')}>
          {platformLoads.map((platform) => (
            <li key={platform.id} className="admin-board__plan-load">
              <span className="admin-board__plan-load-name">
                {t('admin.board.planLoadLine', {
                  name: platform.name,
                  sessions: platform.sessions,
                  athletes: platform.athletes,
                })}
              </span>
              <span className="admin-board__plan-load-bar" aria-hidden>
                <span style={{ width: `${(platform.athletes / maxLoad) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {plan.stats.mixedSex > 0 ? (
        <p className="admin-board__plan-warn" role="status">
          {t('admin.board.planMixedSessions', { count: plan.stats.mixedSex })}
        </p>
      ) : null}

      {byDay.map(([dayIndex, day]) => (
        <div className="admin-board__plan-day" key={dayIndex}>
          <h3 className="admin-board__plan-day-name">{day.label}</h3>
          <ul className="admin-board__plan-list">
            {day.rows.map((row) => {
              const starts = formatScheduleTime(row.startsAt, locale)
              const weighIn = formatScheduleTime(row.weighInAt, locale)
              return (
                <li className="admin-board__plan-row" key={row.key}>
                  <span className="admin-board__plan-row-name">
                    {row.name}
                    {row.isNew ? (
                      <span className="admin-board__plan-new">{t('admin.board.previewNew')}</span>
                    ) : null}
                  </span>
                  {row.platformName ? (
                    <span className="admin-board__plan-row-platform">{row.platformName}</span>
                  ) : null}
                  <span className="admin-board__plan-row-count">
                    {row.isNew ? row.total : t('admin.board.previewAdded', { count: row.added })}
                  </span>
                  <span className="admin-board__plan-row-composition">
                    {row.composition}
                    {row.mixedSex ? (
                      <span className="admin-board__flag"> {t('admin.board.sessionMixedSex')}</span>
                    ) : null}
                    {starts ? (
                      <span className="admin-board__plan-row-times">
                        {weighIn ? `${t('admin.checkin.weighIn')} ${weighIn} · ` : ''}
                        {t('admin.board.planRowStarts', { time: starts })}
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      {plan.leftover.length > 0 ? (
        <p className="admin-board__plan-warn" role="status">
          {t('admin.board.leftover', { count: plan.leftover.length })}
        </p>
      ) : null}
    </>
  )
}
