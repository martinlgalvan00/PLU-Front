import { useEffect, useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useEventSchedule } from '../../hooks/useEventSchedule.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildAdminEventDraft } from '../../services/eventAdminService.js'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import {
  suggestWeighInWindowsFromDays,
  weighInWindowFromForm,
  weighInWindowToForm,
} from '../../lib/weighInWindows.js'
import AdminEventDaysEditor, { isEventDayLocked } from './AdminEventDaysEditor.jsx'
import AdminEventWeighInWindowsEditor from './AdminEventWeighInWindowsEditor.jsx'
import AdminEventSessionsEditor from './AdminEventSessionsEditor.jsx'

function toFormWindows(windows) {
  return (windows ?? []).map((window, index) => weighInWindowToForm(window, index))
}

/**
 * Fold Estructura de la consola: días, ventanas públicas de pesaje y tandas.
 * Días y pesajes se guardan con el upsert del evento (preservando tipos de
 * entrada). Las tandas siguen su propio endpoint.
 */
export default function AdminEventStructureEditor({
  canEdit = false,
  chapter = null,
  event,
  eventSlug,
  onSaveEvent,
}) {
  const { t } = useI18n()
  const [days, setDays] = useState(() => event?.eventDays ?? [])
  const [ticketTypes, setTicketTypes] = useState(() => event?.ticketTypes ?? [])
  const [windows, setWindows] = useState(() => toFormWindows(event?.weighInWindows))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [scheduleReloadToken, setScheduleReloadToken] = useState(0)
  const {
    days: scheduleDays,
    saveSessions,
    sessions,
    status: scheduleStatus,
  } = useEventSchedule(eventSlug, { reloadToken: scheduleReloadToken })

  useEffect(() => {
    if (dirty) return
    setDays(event?.eventDays ?? [])
    setTicketTypes(event?.ticketTypes ?? [])
    setWindows(toFormWindows(event?.weighInWindows))
  }, [dirty, event])

  const lockedDayIndexes = useMemo(() => {
    const locked = new Set()
    const scheduleUnknown = scheduleStatus === 'idle' || scheduleStatus === 'loading'
    for (const day of days) {
      if (scheduleUnknown && day.id) {
        locked.add(day.dayIndex)
        continue
      }
      if (isEventDayLocked(day, { sessions, scheduleDays })) {
        locked.add(day.dayIndex)
      }
    }
    return locked
  }, [days, scheduleDays, scheduleStatus, sessions])

  function patchDays(nextDays) {
    setDirty(true)
    setDays(nextDays)
  }

  function patchTicketTypes(nextTypes) {
    setDirty(true)
    setTicketTypes(nextTypes)
  }

  function patchWindows(nextWindows) {
    setDirty(true)
    setWindows(nextWindows)
  }

  function prefillWindowsFromDays() {
    setDirty(true)
    setWindows((current) => suggestWeighInWindowsFromDays(days, current))
  }

  async function handleSave() {
    if (!onSaveEvent || !event) return
    const weighInWindows = windows
      .map((window, index) => weighInWindowFromForm(window, index))
      .filter((window) => window.label || window.date || window.startsAt || window.endsAt)
    const draft = {
      ...buildAdminEventDraft(event),
      eventDays: days,
      ticketTypes,
      weighInWindows,
    }
    const validation = validateAdminEventDraft(draft, t)
    const structureKeys = Object.keys(validation.fieldErrors).filter(
      (key) => key.startsWith('eventDays.') || key.startsWith('weighInWindows.'),
    )
    if (structureKeys.length > 0) {
      const nextErrors = {}
      for (const key of structureKeys) nextErrors[key] = validation.fieldErrors[key]
      setFieldErrors(nextErrors)
      setError(t('admin.eventEditor.validationSummary'))
      return
    }

    setSaving(true)
    setError(null)
    setFieldErrors({})
    try {
      const result = await onSaveEvent(draft)
      if (result?.error) throw new Error(result.error)
      setDirty(false)
      setScheduleReloadToken((current) => current + 1)
    } catch (saveError) {
      setError(saveError?.message ?? t('admin.schedule.structureSaveError'))
    } finally {
      setSaving(false)
    }
  }

  const showAll = !chapter
  const showDays = showAll || chapter === 'days'
  const showWeighIns = showAll || chapter === 'weighIns'
  const showSessions = showAll || chapter === 'sessions'
  const showEventSave = showDays || showWeighIns

  return (
    <div className="admin-event-structure">
      {showAll ? (
        <div className="admin-event-sessions__intro">
          <span className="admin-event-sessions__icon" aria-hidden>
            <CalendarClock size={16} strokeWidth={1.8} />
          </span>
          <p>{t('admin.schedule.structureLead')}</p>
        </div>
      ) : null}

      <div hidden={!showDays}>
        <AdminEventDaysEditor
          canEdit={canEdit}
          errors={fieldErrors}
          eventDays={days}
          lockedDayIndexes={lockedDayIndexes}
          onChangeEventDays={patchDays}
          onChangeTicketTypes={patchTicketTypes}
          ticketTypes={ticketTypes}
        />
      </div>

      <div hidden={!showWeighIns}>
        <AdminEventWeighInWindowsEditor
          canEdit={canEdit}
          errors={fieldErrors}
          eventDays={days}
          onChange={patchWindows}
          onPrefillFromDays={prefillWindowsFromDays}
          windows={windows}
        />
      </div>

      {error && showEventSave ? (
        <p className="admin-event-form__alert admin-event-form__alert--danger" role="alert">
          {error}
        </p>
      ) : null}

      {showEventSave ? (
        <div className="admin-event-sessions__actions">
          <Button
            type="button"
            className="btn--small"
            onClick={() => void handleSave()}
            disabled={!canEdit || !dirty || saving}
          >
            {saving ? t('admin.schedule.structureSaving') : t('admin.schedule.structureSave')}
          </Button>
        </div>
      ) : null}

      <div hidden={!showSessions}>
        <AdminEventSessionsEditor
          embedded
          canEdit={canEdit}
          eventSlug={eventSlug}
          scheduleState={{
            days: scheduleDays,
            saveSessions,
            sessions,
            status: scheduleStatus,
          }}
        />
      </div>
    </div>
  )
}
