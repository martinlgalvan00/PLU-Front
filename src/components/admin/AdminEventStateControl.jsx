import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Unlock,
  UserCheck,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  EVENT_QUICK_STATUS_VALUES,
  getEventRegistrationAvailability,
  isEventFull,
} from '../../services/eventAdminService.js'

function baselineFromEvent(event) {
  return {
    status: event?.status ?? 'proximamente',
    published: event?.published === true,
    requiresMembership: event?.requiresMembership !== false,
  }
}

function diffAgainstBaseline(draft, baseline) {
  const payload = {}
  for (const key of ['status', 'published', 'requiresMembership']) {
    if (draft[key] !== baseline[key]) payload[key] = draft[key]
  }
  return payload
}

/**
 * AdminEventStateControl — PLU ARG
 *
 * Habilitar, deshabilitar y cambiar el estado público de un evento sin abrir el
 * editor completo. Los chips y atajos mutan un draft local; el PATCH parcial
 * solo corre al tocar Guardar (Descartar vuelve al estado persistido).
 *
 * `agotado` no es una opción elegible: lo pone y lo saca la base según el cupo
 * (`sync_event_capacity_status`). Aparece como chip solo cuando el evento ya
 * está en ese estado, porque si no la fila quedaría sin ningún chip activo y
 * daría la impresión de que el estado se perdió.
 *
 * ── Acceso: solo afiliados o abierto ──
 * Son dos opciones excluyentes escritas como decisión, no como casilla, y cada
 * una dice su consecuencia real: el requisito no solo filtra la inscripción,
 * decide quién pasa la puerta el día del meet (`src/lib/gateAccess.js`).
 */
export default function AdminEventStateControl({
  canEdit = false,
  event,
  onDirtyChange,
  onSetState,
}) {
  const { locale, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange
  const baseline = useMemo(
    () => baselineFromEvent(event),
    [event?.published, event?.requiresMembership, event?.slug, event?.status],
  )
  const [draft, setDraft] = useState(baseline)

  useEffect(() => {
    setDraft(baseline)
    setNotice(null)
  }, [baseline])

  const pending = useMemo(() => diffAgainstBaseline(draft, baseline), [baseline, draft])
  const dirtyCount = Object.keys(pending).length
  const dirty = dirtyCount > 0

  useEffect(() => {
    onDirtyChangeRef.current?.(dirty)
  }, [dirty])

  const full = isEventFull(event)
  const registration = getEventRegistrationAvailability(event)
  const registered = Number(event?.registered) || 0

  const scheduledDate = useMemo(() => {
    if (!registration.opensAt) return ''
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(registration.opensAt)
  }, [locale, registration.opensAt])

  const effectiveRegistration = useMemo(
    () =>
      getEventRegistrationAvailability({
        ...event,
        status: draft.status,
        published: draft.published,
      }),
    [draft.published, draft.status, event],
  )

  const accessOptions = useMemo(
    () => [
      ['members', t('admin.eventState.accessMembers')],
      ['open', t('admin.eventState.accessOpen')],
    ],
    [t],
  )

  const statusOptions = useMemo(() => {
    const values = [...EVENT_QUICK_STATUS_VALUES]
    if (draft.status === 'agotado' && !values.includes('agotado')) {
      values.splice(values.indexOf('cupos_limitados') + 1, 0, 'agotado')
    }
    return translateFilterOptions(
      values.map((value) => [value, 'status']),
      t,
    )
  }, [draft.status, t])

  function successNoticeFor(payload) {
    const keys = Object.keys(payload)
    if (keys.length === 1) {
      const key = keys[0]
      if (key === 'status') return t('admin.eventState.statusSaved')
      if (key === 'published') {
        return payload.published
          ? t('admin.eventState.publishedSaved')
          : t('admin.eventState.unpublishedSaved')
      }
      return payload.requiresMembership
        ? t('admin.eventState.accessMembersSaved')
        : t('admin.eventState.accessOpenSaved')
    }
    return t('admin.eventState.changesSaved')
  }

  function patchDraft(partial) {
    if (!canEdit || busy) return
    setNotice(null)
    setDraft((current) => ({ ...current, ...partial }))
  }

  function handleDiscard() {
    if (busy) return
    setDraft(baseline)
    setNotice(null)
  }

  async function handleSave() {
    if (!canEdit || busy || dirtyCount === 0) return

    setBusy(true)
    setNotice(null)

    try {
      const result = await onSetState?.(event.slug, pending)
      if (result?.error) {
        setNotice({ tone: 'error', text: result.error })
        return
      }
      setNotice(
        result?.statusOverridden
          ? { tone: 'info', text: t('admin.eventState.overridden') }
          : { tone: 'success', text: successNoticeFor(pending) },
      )
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error?.message || t('admin.eventState.saveFailed'),
      })
    } finally {
      setBusy(false)
    }
  }

  function handleStatusChange(value) {
    if (value === draft.status) return
    patchDraft({ status: value })
  }

  function handleVisibilityToggle() {
    patchDraft({ published: !draft.published })
  }

  function handleOpenRegistrations() {
    patchDraft({ status: 'inscripcion_abierta', published: true })
  }

  function handleAccessChange(value) {
    const next = value === 'members'
    if (next === draft.requiresMembership) return
    patchDraft({ requiresMembership: next })
  }

  function handleSetUpcoming() {
    patchDraft({ status: 'proximamente', published: true })
  }

  const slots = Number(event?.slots) || 0
  const resultPrimary = (() => {
    if (effectiveRegistration.isLive) return t('admin.eventState.resultLive')
    if (effectiveRegistration.scheduled) {
      return t('admin.eventState.resultScheduled', { date: scheduledDate })
    }
    if (!draft.published) return t('admin.eventState.resultHidden')
    if (effectiveRegistration.full || draft.status === 'agotado') {
      return t('admin.eventState.resultFull')
    }
    if (effectiveRegistration.closedByWindow) return t('admin.eventState.resultWindowClosed')
    return t('admin.eventState.resultClosed')
  })()
  const resultCapacity = t('admin.eventState.resultCapacity', {
    registered,
    slots,
  })
  const resultAccess = draft.requiresMembership
    ? t('admin.eventState.accessMembers')
    : t('admin.eventState.accessOpen')

  return (
    <div className="admin-event-state" role="group" aria-label={t('admin.eventState.label')}>
      <p
        className={`admin-event-state__result${effectiveRegistration.isLive ? ' is-live' : ''}`}
        role="status"
      >
        <span className="admin-event-state__result-primary">{resultPrimary}</span>
        <span className="admin-event-state__result-sep" aria-hidden>
          ·
        </span>
        <span>{resultCapacity}</span>
        <span className="admin-event-state__result-sep" aria-hidden>
          ·
        </span>
        <span>{resultAccess}</span>
      </p>

      <div
        className="admin-event-state__workflow"
        aria-label={t('admin.eventState.registrationLabel')}
      >
        <span className="admin-event-state__workflow-label">
          {t('admin.eventState.registrationLabel')}
        </span>
        <div className="admin-event-state__workflow-actions">
          {effectiveRegistration.isLive ? (
            <span className="admin-event-state__registration-live" role="status">
              <CheckCircle2 size={14} aria-hidden />
              {t('admin.eventState.registrationLive')}
            </span>
          ) : (
            <button
              type="button"
              className="admin-event-state__registration-action admin-event-state__registration-action--open"
              disabled={!canEdit || busy || !registration.canOpen}
              onClick={handleOpenRegistrations}
              title={
                registration.scheduled
                  ? t('admin.eventState.scheduledTitle')
                  : registration.closedByWindow
                    ? t('admin.eventState.closedWindowTitle')
                    : registration.full
                      ? t('admin.eventState.fullTitle')
                      : undefined
              }
            >
              <Unlock size={14} aria-hidden />
              {t('admin.eventState.openRegistration')}
            </button>
          )}
          {registration.canSetUpcoming && draft.status !== 'proximamente' ? (
            <button
              type="button"
              className="admin-event-state__registration-action"
              disabled={!canEdit || busy}
              onClick={handleSetUpcoming}
            >
              <CalendarClock size={14} aria-hidden />
              {t('admin.eventState.setUpcoming')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-event-state__controls">
        <div className="admin-event-state__row">
          <span className="admin-event-state__row-label" id={`event-state-${event?.id ?? 'none'}-row`}>
            {t('admin.eventState.status')}
          </span>
          <AdminFilterChipGroup
            compact
            inline
            disabled={!canEdit || busy}
            id={`event-state-${event?.id ?? 'none'}`}
            ariaLabel={t('admin.eventState.status')}
            onChange={handleStatusChange}
            options={statusOptions}
            value={draft.status}
          />
        </div>

        <div className="admin-event-state__row admin-event-state__row--access">
          <span
            className="admin-event-state__row-label"
            id={`event-access-${event?.id ?? 'none'}-row`}
          >
            {t('admin.eventState.accessLabel')}
          </span>
          <div className="admin-event-state__access">
            <AdminFilterChipGroup
              compact
              inline
              disabled={!canEdit || busy}
              id={`event-access-${event?.id ?? 'none'}`}
              ariaLabel={t('admin.eventState.accessLabel')}
              onChange={handleAccessChange}
              options={accessOptions}
              value={draft.requiresMembership ? 'members' : 'open'}
            />

            <p
              className="admin-event-state__note admin-event-state__note--muted admin-event-state__note--caption"
              title={
                draft.requiresMembership
                  ? t('admin.eventState.accessMembersNote')
                  : t('admin.eventState.accessOpenNote')
              }
            >
              {draft.requiresMembership ? (
                <ShieldCheck size={12} aria-hidden />
              ) : (
                <Unlock size={12} aria-hidden />
              )}
              <span>
                {draft.requiresMembership
                  ? t('admin.eventState.accessMembersNote')
                  : t('admin.eventState.accessOpenNote')}
              </span>
            </p>

            {draft.requiresMembership && registered > 0 ? (
              <p className="admin-event-state__note admin-event-state__note--info">
                <UserCheck size={12} aria-hidden />
                <span>
                  {t('admin.eventState.accessMembersRegisteredNote', { count: registered })}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="admin-event-state__row admin-event-state__row--visibility">
          <span className="admin-event-state__row-label">{t('admin.eventState.visibilityLabel')}</span>
          <button
            type="button"
            className={[
              'admin-event-state__visibility',
              draft.published ? 'is-published' : 'is-hidden',
            ].join(' ')}
            aria-pressed={draft.published}
            disabled={!canEdit || busy}
            onClick={handleVisibilityToggle}
          >
            {busy ? (
              <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
            ) : draft.published ? (
              <Eye size={14} aria-hidden />
            ) : (
              <EyeOff size={14} aria-hidden />
            )}
            <span>
              {draft.published ? t('admin.eventState.published') : t('admin.eventState.hidden')}
            </span>
          </button>
        </div>
      </div>

      {dirty ? (
        <div className="admin-event-state__pending" role="status">
          <p className="admin-event-state__pending-hint">
            {dirtyCount === 1
              ? t('admin.eventState.pendingOne')
              : t('admin.eventState.pendingMany', { count: dirtyCount })}
          </p>
          <div className="admin-event-state__pending-actions">
            <button
              type="button"
              className="admin-event-state__pending-discard"
              disabled={busy}
              onClick={handleDiscard}
            >
              {t('admin.eventState.discard')}
            </button>
            <button
              type="button"
              className="admin-event-state__pending-save"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? t('admin.eventState.saving') : t('admin.eventState.save')}
            </button>
          </div>
        </div>
      ) : null}

      {draft.status === 'agotado' ? (
        <p className="admin-event-state__note admin-event-state__note--full">
          {t('admin.eventState.fullNote', {
            registered: event?.registered ?? 0,
            slots: event?.slots ?? 0,
          })}
        </p>
      ) : full ? (
        <p className="admin-event-state__note admin-event-state__note--full">
          {t('admin.eventState.atCapacityNote')}
        </p>
      ) : null}

      {registration.scheduled ? (
        <p className="admin-event-state__note admin-event-state__note--info" role="status">
          <LockKeyhole size={13} aria-hidden />
          {t('admin.eventState.scheduledNote', { date: scheduledDate })}
        </p>
      ) : null}

      {registration.closedByWindow ? (
        <p className="admin-event-state__note admin-event-state__note--info" role="status">
          <LockKeyhole size={13} aria-hidden />
          {t('admin.eventState.closedWindowNote')}
        </p>
      ) : null}

      {notice ? (
        <p
          className={`admin-event-state__note admin-event-state__note--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
