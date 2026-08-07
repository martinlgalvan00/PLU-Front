import { useEffect, useState } from 'react'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useEventSchedule } from '../../hooks/useEventSchedule.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/** `datetime-local` necesita 'YYYY-MM-DDTHH:mm' local, no el ISO en UTC. */
function toDateTimeLocal(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function toFormSession(session) {
  return {
    id: session.id,
    dayIndex: session.dayIndex,
    name: session.name,
    platform: session.platform ?? '',
    weighInAt: toDateTimeLocal(session.weighInAt),
    startsAt: toDateTimeLocal(session.startsAt),
    assignedCount: session.assignedCount,
  }
}

/**
 * Editor de tandas de un evento — PLU ARG
 *
 * Una tanda es el grupo con el que un atleta entra a plataforma: pertenece a un
 * día, y lleva su horario de pesaje y su plataforma. Es el segundo nivel de la
 * grilla; el reparto de atletas se hace después, desde Inscripciones.
 *
 * Guarda por su cuenta y no contra el draft del evento: las tandas cuelgan de
 * los días, que recién existen una vez que el evento está guardado. Por eso el
 * bloque solo aparece para un evento ya creado.
 */
export default function AdminEventSessionsEditor({ canEdit = false, eventSlug }) {
  const { t } = useI18n()
  const { days, saveSessions, sessions, status } = useEventSchedule(eventSlug)
  const [draft, setDraft] = useState([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // El server es la fuente: al releer la grilla se descarta el borrador local,
  // salvo que haya ediciones sin guardar que se perderían sin avisar.
  useEffect(() => {
    if (dirty) return
    setDraft(sessions.map(toFormSession))
  }, [dirty, sessions])

  function patch(index, field, value) {
    setDirty(true)
    setDraft((current) =>
      current.map((session, position) =>
        position === index ? { ...session, [field]: value } : session,
      ),
    )
  }

  function addSession() {
    setDirty(true)
    setDraft((current) => [
      ...current,
      {
        id: undefined,
        dayIndex: days[0]?.dayIndex ?? 0,
        name: '',
        platform: '',
        weighInAt: '',
        startsAt: '',
        assignedCount: 0,
      },
    ])
  }

  function removeSession(index) {
    setDirty(true)
    setDraft((current) => current.filter((_, position) => position !== index))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveSessions(
        draft.map((session, index) => ({
          ...(session.id ? { id: session.id } : {}),
          dayIndex: Number(session.dayIndex),
          name: session.name.trim(),
          platform: session.platform.trim(),
          weighInAt: fromDateTimeLocal(session.weighInAt),
          startsAt: fromDateTimeLocal(session.startsAt),
          sortOrder: index,
        })),
      )
      setDirty(false)
    } catch (saveError) {
      setError(saveError?.message ?? t('admin.schedule.sessions.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const hasBlankName = draft.some((session) => !session.name.trim())

  if (status === 'loading') {
    return <p className="admin-event-form__section-note">{t('admin.schedule.sessions.loading')}</p>
  }

  if (status === 'error') {
    return (
      <p className="admin-event-form__alert admin-event-form__alert--danger" role="alert">
        {t('admin.schedule.loadError')}
      </p>
    )
  }

  if (days.length === 0) {
    return <p className="admin-event-form__section-note">{t('admin.schedule.sessions.needsDays')}</p>
  }

  return (
    <div className="admin-event-sessions">
      <div className="admin-event-sessions__intro">
        <span className="admin-event-sessions__icon" aria-hidden>
          <CalendarClock size={16} strokeWidth={1.8} />
        </span>
        <p>{t('admin.schedule.sessions.lead')}</p>
      </div>

      {draft.length === 0 ? (
        <p className="admin-event-form__section-note">{t('admin.schedule.sessions.empty')}</p>
      ) : (
        <ul className="admin-event-sessions__list">
          {draft.map((session, index) => (
            <li key={session.id ?? `new-${index}`} className="admin-event-sessions__row">
              <label className="admin-event-sessions__field admin-event-sessions__field--day">
                <span>{t('admin.schedule.dayField')}</span>
                <select
                  value={session.dayIndex}
                  onChange={(event) => patch(index, 'dayIndex', event.target.value)}
                  disabled={!canEdit}
                >
                  {days.map((day) => (
                    <option key={day.id} value={day.dayIndex}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.sessions.nameField')}</span>
                <input
                  type="text"
                  value={session.name}
                  maxLength={80}
                  placeholder={t('admin.schedule.sessions.namePlaceholder')}
                  onChange={(event) => patch(index, 'name', event.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.sessions.platformField')}</span>
                <input
                  type="text"
                  value={session.platform}
                  maxLength={80}
                  placeholder={t('admin.schedule.sessions.platformPlaceholder')}
                  onChange={(event) => patch(index, 'platform', event.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.sessions.weighInField')}</span>
                <input
                  type="datetime-local"
                  value={session.weighInAt}
                  onChange={(event) => patch(index, 'weighInAt', event.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.sessions.startsField')}</span>
                <input
                  type="datetime-local"
                  value={session.startsAt}
                  onChange={(event) => patch(index, 'startsAt', event.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <div className="admin-event-sessions__row-end">
                {session.assignedCount > 0 && (
                  <span className="admin-event-sessions__count">
                    {t('admin.schedule.sessions.assignedCount', { count: session.assignedCount })}
                  </span>
                )}
                <button
                  type="button"
                  className="admin-event-sessions__remove"
                  onClick={() => removeSession(index)}
                  disabled={!canEdit}
                  aria-label={t('admin.schedule.sessions.remove', {
                    name: session.name || String(index + 1),
                  })}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="admin-event-form__alert admin-event-form__alert--danger" role="alert">
          {error}
        </p>
      )}

      <div className="admin-event-sessions__actions">
        <Button type="button" variant="outline" className="btn--small" onClick={addSession} disabled={!canEdit}>
          <Plus size={15} aria-hidden />
          {t('admin.schedule.sessions.add')}
        </Button>
        <Button
          type="button"
          className="btn--small"
          onClick={handleSave}
          disabled={!canEdit || !dirty || saving || hasBlankName}
        >
          {saving ? t('admin.schedule.sessions.saving') : t('admin.schedule.sessions.save')}
        </Button>
        {hasBlankName && (
          <p className="admin-event-sessions__hint">{t('admin.schedule.sessions.nameRequired')}</p>
        )}
      </div>
    </div>
  )
}
