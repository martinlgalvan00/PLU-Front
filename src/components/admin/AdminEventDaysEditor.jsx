import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export function reindexEventDays(days) {
  return days.map((day, index) => ({ ...day, dayIndex: index }))
}

export function createEmptyEventDay(index) {
  return { dayIndex: index, label: '', date: '' }
}

export function remapTicketTypesAfterDayRemoval(ticketTypes, remainingDays) {
  const nextIndexByPreviousIndex = new Map(
    remainingDays.map((day, nextIndex) => [day.dayIndex, nextIndex]),
  )
  return ticketTypes.map((type) => ({
    ...type,
    dayIndexes: (type.dayIndexes ?? [])
      .map((dayIndex) => nextIndexByPreviousIndex.get(dayIndex))
      .filter((dayIndex) => dayIndex !== undefined),
  }))
}

/** Un día con tandas o atletas no se puede borrar: SQL lo rechaza con PLU07. */
export function isEventDayLocked(day, { sessions = [], scheduleDays = [] } = {}) {
  if (!day) return false
  if (day.id) {
    if (sessions.some((session) => session.eventDayId === day.id)) return true
    const scheduled = scheduleDays.find((item) => item.id === day.id)
    if ((scheduled?.assignedCount ?? 0) > 0) return true
  }
  if (sessions.some((session) => session.dayIndex === day.dayIndex)) return true
  const scheduled = scheduleDays.find((item) => item.dayIndex === day.dayIndex)
  return (scheduled?.assignedCount ?? 0) > 0
}

/**
 * Jornadas del evento: alimentan tandas, pesaje y tipos de entrada.
 * La consola las edita en Estructura; Ventas solo las consume.
 */
export default function AdminEventDaysEditor({
  canEdit = false,
  errors = {},
  eventDays = [],
  lockedDayIndexes,
  onChangeEventDays,
  onChangeTicketTypes,
  ticketTypes = [],
}) {
  const { t } = useI18n()

  function addDay() {
    onChangeEventDays?.(reindexEventDays([...eventDays, createEmptyEventDay(eventDays.length)]))
  }

  function removeDay(index) {
    const day = eventDays[index]
    if (day && lockedDayIndexes?.has(day.dayIndex)) return
    const remainingDays = eventDays.filter((_, i) => i !== index)
    const nextDays = reindexEventDays(remainingDays)
    onChangeEventDays?.(nextDays)
    onChangeTicketTypes?.(remapTicketTypesAfterDayRemoval(ticketTypes, remainingDays))
  }

  function patchDay(index, field, value) {
    onChangeEventDays?.(
      eventDays.map((day, position) => (position === index ? { ...day, [field]: value } : day)),
    )
  }

  return (
    <section className="admin-event-form__block admin-ticket-types">
      <header className="admin-event-form__block-head">
        <h3 className="admin-event-form__block-title">
          <CalendarDays size={13} aria-hidden />
          {t('admin.eventEditor.supabase.ticketDaysTitle')}
        </h3>
        <p className="admin-event-form__block-lead">
          {t('admin.eventEditor.supabase.ticketDaysHint')}
        </p>
      </header>

      {eventDays.length === 0 ? (
        <p className="admin-ticket-types__empty">{t('admin.eventEditor.supabase.ticketDaysEmpty')}</p>
      ) : (
        <ul className="admin-ticket-types__day-list">
          {eventDays.map((day, index) => (
            <li key={day.id ?? index} className="admin-ticket-types__day-item">
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.ticketDayLabel')}</span>
                <input
                  disabled={!canEdit}
                  type="text"
                  value={day.label}
                  name={`eventDays.${index}.label`}
                  data-field={`eventDays.${index}.label`}
                  aria-invalid={Boolean(errors[`eventDays.${index}.label`])}
                  onChange={(event) => patchDay(index, 'label', event.target.value)}
                  placeholder={t('admin.eventEditor.supabase.ticketDayLabelPlaceholder')}
                />
                {errors[`eventDays.${index}.label`] ? (
                  <small className="admin-event-form__error" role="alert">
                    {errors[`eventDays.${index}.label`]}
                  </small>
                ) : null}
              </label>
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.supabase.ticketDayDate')}</span>
                <input
                  disabled={!canEdit}
                  type="date"
                  value={day.date ?? ''}
                  name={`eventDays.${index}.date`}
                  data-field={`eventDays.${index}.date`}
                  aria-invalid={Boolean(errors[`eventDays.${index}.date`])}
                  onChange={(event) => patchDay(index, 'date', event.target.value)}
                />
                {errors[`eventDays.${index}.date`] ? (
                  <small className="admin-event-form__error" role="alert">
                    {errors[`eventDays.${index}.date`]}
                  </small>
                ) : null}
              </label>
              {canEdit ? (
                <button
                  type="button"
                  className="admin-ticket-types__remove"
                  onClick={() => removeDay(index)}
                  disabled={lockedDayIndexes?.has(day.dayIndex) === true}
                  title={
                    lockedDayIndexes?.has(day.dayIndex)
                      ? t('admin.eventEditor.supabase.ticketDayLocked')
                      : undefined
                  }
                  aria-label={
                    lockedDayIndexes?.has(day.dayIndex)
                      ? t('admin.eventEditor.supabase.ticketDayLocked')
                      : t('admin.eventEditor.supabase.ticketDayRemove', {
                          number: index + 1,
                        })
                  }
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <Button
          className="btn--small btn--ghost admin-ticket-types__add"
          type="button"
          onClick={addDay}
        >
          <Plus size={14} aria-hidden />
          {t('admin.eventEditor.supabase.ticketDayAdd')}
        </Button>
      ) : null}
    </section>
  )
}
