import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { formatScheduleTime } from '../../lib/eventSchedule.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const UNASSIGNED = ''

/**
 * Barra de asignación masiva de grilla — PLU ARG
 *
 * Aparece cuando hay inscripciones seleccionadas en el listado. La operación
 * real de la organización es por lote: se filtra (todas las Open Raw, por
 * ejemplo), se selecciona y se manda el grupo entero al mismo día y tanda.
 *
 * La RPC trabaja sobre un evento a la vez, así que una selección que cruza
 * eventos se bloquea con el motivo a la vista en vez de asignar a medias.
 */
export default function AdminScheduleAssigner({
  assigning = false,
  days = [],
  sessions = [],
  mixedEvents = false,
  onAssign,
  onClearSelection,
  scheduleStatus = 'idle',
  selectedCount = 0,
}) {
  const { locale, t } = useI18n()
  const [dayIndex, setDayIndex] = useState(UNASSIGNED)
  const [sessionId, setSessionId] = useState(UNASSIGNED)

  const daySessions = useMemo(
    () =>
      dayIndex === UNASSIGNED
        ? []
        : sessions.filter((session) => session.dayIndex === Number(dayIndex)),
    [dayIndex, sessions],
  )

  // Cambiar de día invalida la tanda elegida: son tandas de otro día y la
  // constraint del backend las rechazaría.
  useEffect(() => {
    setSessionId((current) =>
      current && !daySessions.some((session) => session.id === current) ? UNASSIGNED : current,
    )
  }, [daySessions])

  if (selectedCount === 0) return null

  const canAssign = !assigning && !mixedEvents && scheduleStatus === 'ready'

  function handleAssign() {
    onAssign({
      dayIndex: dayIndex === UNASSIGNED ? null : Number(dayIndex),
      sessionId: sessionId === UNASSIGNED ? null : sessionId,
    })
  }

  function handleUnassign() {
    onAssign({ dayIndex: null, sessionId: null })
  }

  function sessionLabel(session) {
    const time = formatScheduleTime(session.weighInAt, locale)
    const parts = [session.name, session.platform, time && `${t('admin.checkin.weighIn')} ${time}`]
    return parts.filter(Boolean).join(' · ')
  }

  return (
    <div className="admin-schedule-assigner" role="region" aria-label={t('admin.schedule.assignerLabel')}>
      <div className="admin-schedule-assigner__lead">
        <span className="admin-schedule-assigner__icon" aria-hidden>
          <CalendarClock size={16} strokeWidth={1.8} />
        </span>
        <p className="admin-schedule-assigner__count">
          {t('admin.schedule.selectedCount', { count: selectedCount })}
        </p>
      </div>

      {mixedEvents ? (
        <p className="admin-schedule-assigner__notice">{t('admin.schedule.mixedEvents')}</p>
      ) : scheduleStatus === 'error' ? (
        <p className="admin-schedule-assigner__notice">{t('admin.schedule.loadError')}</p>
      ) : days.length === 0 && scheduleStatus === 'ready' ? (
        <p className="admin-schedule-assigner__notice">{t('admin.schedule.noDays')}</p>
      ) : (
        <div className="admin-schedule-assigner__controls">
          <label className="admin-schedule-assigner__field">
            <span>{t('admin.schedule.dayField')}</span>
            <select
              value={dayIndex}
              onChange={(event) => setDayIndex(event.target.value)}
              disabled={assigning || scheduleStatus !== 'ready'}
            >
              <option value={UNASSIGNED}>{t('admin.schedule.dayPlaceholder')}</option>
              {days.map((day) => (
                <option key={day.id} value={day.dayIndex}>
                  {day.label}
                  {day.assignedCount ? ` (${day.assignedCount})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-schedule-assigner__field">
            <span>{t('admin.schedule.sessionField')}</span>
            <select
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              disabled={assigning || dayIndex === UNASSIGNED || daySessions.length === 0}
            >
              <option value={UNASSIGNED}>
                {dayIndex === UNASSIGNED
                  ? t('admin.schedule.sessionNeedsDay')
                  : daySessions.length === 0
                    ? t('admin.schedule.sessionNone')
                    : t('admin.schedule.sessionPlaceholder')}
              </option>
              {daySessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {sessionLabel(session)}
                  {session.assignedCount ? ` (${session.assignedCount})` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-schedule-assigner__actions">
            <Button
              type="button"
              onClick={handleAssign}
              disabled={!canAssign || dayIndex === UNASSIGNED}
            >
              {assigning ? t('admin.schedule.assigning') : t('admin.schedule.assign')}
            </Button>
            <button
              type="button"
              className="admin-schedule-assigner__text-btn"
              onClick={handleUnassign}
              disabled={!canAssign}
            >
              {t('admin.schedule.unassign')}
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="admin-schedule-assigner__dismiss"
        onClick={onClearSelection}
        aria-label={t('admin.schedule.clearSelection')}
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  )
}
