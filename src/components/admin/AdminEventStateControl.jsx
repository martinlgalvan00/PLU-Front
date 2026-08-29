import { useMemo, useState } from 'react'
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

/**
 * AdminEventStateControl — PLU ARG
 *
 * Habilitar, deshabilitar y cambiar el estado público de un evento sin abrir el
 * editor completo. Cada decisión se guarda al toque (un click = un PATCH
 * parcial): la operación diaria no debería pedir "Guardar" aparte.
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
export default function AdminEventStateControl({ canEdit = false, event, onSetState }) {
  const { locale, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  /** Vista previa optimista mientras viaja el PATCH; se limpia al resolver. */
  const [optimistic, setOptimistic] = useState(null)

  const full = isEventFull(event)
  const published = event?.published === true
  const status = event?.status ?? 'proximamente'
  const registration = getEventRegistrationAvailability(event)

  const scheduledDate = useMemo(() => {
    if (!registration.opensAt) return ''
    return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(registration.opensAt)
  }, [locale, registration.opensAt])

  const requiresMembership = event?.requiresMembership !== false
  const registered = Number(event?.registered) || 0

  const effectiveStatus = optimistic?.status ?? status
  const effectivePublished = optimistic?.published ?? published
  const effectiveRequiresMembership = optimistic?.requiresMembership ?? requiresMembership
  const effectiveRegistration = useMemo(
    () =>
      getEventRegistrationAvailability({
        ...event,
        status: effectiveStatus,
        published: effectivePublished,
      }),
    [event, effectiveStatus, effectivePublished],
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
    if (effectiveStatus === 'agotado' && !values.includes('agotado')) {
      values.splice(values.indexOf('cupos_limitados') + 1, 0, 'agotado')
    }
    return translateFilterOptions(
      values.map((value) => [value, 'status']),
      t,
    )
  }, [effectiveStatus, t])

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

  async function commit(changes) {
    if (!canEdit || busy) return

    const baseline = { status, published, requiresMembership }
    const payload = {}
    for (const [key, value] of Object.entries(changes)) {
      if (value !== baseline[key]) payload[key] = value
    }
    if (Object.keys(payload).length === 0) return

    setBusy(true)
    setNotice(null)
    setOptimistic({
      status: payload.status ?? status,
      published: payload.published ?? published,
      requiresMembership: payload.requiresMembership ?? requiresMembership,
    })

    try {
      const result = await onSetState?.(event.slug, payload)
      if (result?.error) {
        setOptimistic(null)
        setNotice({ tone: 'error', text: result.error })
        return
      }
      setNotice(
        result?.statusOverridden
          ? { tone: 'info', text: t('admin.eventState.overridden') }
          : { tone: 'success', text: successNoticeFor(payload) },
      )
      setOptimistic(null)
    } catch (error) {
      setOptimistic(null)
      setNotice({
        tone: 'error',
        text: error?.message || t('admin.eventState.saveFailed'),
      })
    } finally {
      setBusy(false)
    }
  }

  function handleStatusChange(value) {
    if (value === effectiveStatus) return
    void commit({ status: value })
  }

  function handleVisibilityToggle() {
    void commit({ published: !effectivePublished })
  }

  function handleOpenRegistrations() {
    void commit({ status: 'inscripcion_abierta', published: true })
  }

  function handleAccessChange(value) {
    const next = value === 'members'
    if (next === effectiveRequiresMembership) return
    void commit({ requiresMembership: next })
  }

  function handleSetUpcoming() {
    void commit({ status: 'proximamente', published: true })
  }

  return (
    <div className="admin-event-state" role="group" aria-label={t('admin.eventState.label')}>
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
          {registration.canSetUpcoming && effectiveStatus !== 'proximamente' ? (
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
            value={effectiveStatus}
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
              value={effectiveRequiresMembership ? 'members' : 'open'}
            />

            <p
              className="admin-event-state__note admin-event-state__note--muted admin-event-state__note--caption"
              title={
                effectiveRequiresMembership
                  ? t('admin.eventState.accessMembersNote')
                  : t('admin.eventState.accessOpenNote')
              }
            >
              {effectiveRequiresMembership ? (
                <ShieldCheck size={12} aria-hidden />
              ) : (
                <Unlock size={12} aria-hidden />
              )}
              <span>
                {effectiveRequiresMembership
                  ? t('admin.eventState.accessMembersNote')
                  : t('admin.eventState.accessOpenNote')}
              </span>
            </p>

            {effectiveRequiresMembership && registered > 0 ? (
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
              effectivePublished ? 'is-published' : 'is-hidden',
            ].join(' ')}
            aria-pressed={effectivePublished}
            disabled={!canEdit || busy}
            onClick={handleVisibilityToggle}
          >
            {busy ? (
              <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
            ) : effectivePublished ? (
              <Eye size={14} aria-hidden />
            ) : (
              <EyeOff size={14} aria-hidden />
            )}
            <span>
              {effectivePublished ? t('admin.eventState.published') : t('admin.eventState.hidden')}
            </span>
          </button>
        </div>
      </div>

      {effectiveStatus === 'agotado' ? (
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
