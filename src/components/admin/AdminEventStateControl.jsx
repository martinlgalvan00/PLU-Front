import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock,
  Eye,
  EyeOff,
  LockKeyhole,
  Unlock,
  UserCheck,
} from 'lucide-react'
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
 * Las tres decisiones de estado de un evento —en qué estado está, quién puede
 * inscribirse y si se ve en el sitio— escritas como tres campos del mismo
 * formulario: etiqueta, opciones excluyentes y la consecuencia debajo. Mutan
 * un draft local; el PATCH parcial corre al tocar Guardar, o —en el workspace
 * (`deferSave`)— al “Guardar cambios” genérico del editor.
 *
 * Antes cada fila hablaba un idioma distinto (chips de filtro para el estado,
 * subrayados tipo pestaña para el acceso, un toggle para el sitio) y las tres
 * se leían como navegación; la consecuencia del acceso, además, vivía en un
 * `title`: la información que decide el cambio no se veía.
 *
 * `agotado` no es una opción elegible: lo pone y lo saca la base según el cupo
 * (`sync_event_capacity_status`). Aparece como opción solo cuando el evento ya
 * está en ese estado, porque si no la fila quedaría sin ninguna activa y daría
 * la impresión de que el estado se perdió.
 *
 * ── Acceso: solo afiliados o abierto ──
 * El requisito no solo filtra la inscripción: decide quién pasa la puerta el
 * día del meet (`src/lib/gateAccess.js`), así que su consecuencia se escribe
 * siempre, no al pasar el mouse.
 */
export default function AdminEventStateControl({
  canEdit = false,
  /**
   * En el workspace el PATCH lo dispara el “Guardar cambios” del editor.
   * Acá no se muestra la barra Descartar/Guardar: los chips sólo mutan draft.
   */
  deferSave = false,
  event,
  onDirtyChange,
  onEditWindow,
  onPendingChange,
  onRegisterDiscard,
  onSetState,
}) {
  const { locale, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange
  const onPendingChangeRef = useRef(onPendingChange)
  onPendingChangeRef.current = onPendingChange
  const onRegisterDiscardRef = useRef(onRegisterDiscard)
  onRegisterDiscardRef.current = onRegisterDiscard
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
    onPendingChangeRef.current?.(pending)
  }, [dirty, pending])

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

  const handleDiscardRef = useRef(handleDiscard)
  handleDiscardRef.current = handleDiscard

  useEffect(() => {
    onRegisterDiscardRef.current?.(() => handleDiscardRef.current?.())
    return () => onRegisterDiscardRef.current?.(null)
  }, [])

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
    if (!draft.published) return t('admin.eventState.resultHidden')
    if (effectiveRegistration.full || draft.status === 'agotado') {
      return t('admin.eventState.resultFull')
    }
    if (effectiveRegistration.scheduled) {
      return t('admin.eventState.resultScheduled', { date: scheduledDate })
    }
    if (
      effectiveRegistration.closedByWindow &&
      draft.status !== 'cerrado' &&
      draft.status !== 'finalizado'
    ) {
      return t('admin.eventState.resultWindowClosed')
    }
    return t(`status.${draft.status}`)
  })()
  const resultCapacity = t('admin.eventState.resultCapacity', {
    registered,
    slots,
  })
  const resultAccess = draft.requiresMembership
    ? t('admin.eventState.accessMembers')
    : t('admin.eventState.accessOpen')


  const baseId = `event-state-${event?.id ?? 'none'}`
  const statusLabelId = `${baseId}-status-label`
  const accessLabelId = `${baseId}-access-label`
  const siteLabelId = `${baseId}-site-label`
  const accessNote = draft.requiresMembership
    ? t('admin.eventState.accessMembersNote')
    : t('admin.eventState.accessOpenNote')
  const siteNote = draft.published
    ? t('admin.eventState.publishedNote')
    : t('admin.eventState.hiddenNote')

  /**
   * Las tres decisiones se escriben igual: una etiqueta, opciones excluyentes
   * y la consecuencia debajo. Antes cada fila hablaba un idioma distinto
   * —chips de filtro, subrayados tipo pestaña, un toggle— y la consecuencia
   * del acceso vivía en un `title`, es decir, no se veía.
   */
  function renderOptions({ labelledBy, options }) {
    // Un radiogroup se recorre con flechas y entra al tab una sola vez: sin
    // esto el grupo declaraba el rol sin cumplir su contrato de teclado, y con
    // cinco estados el tabulador pasaba cinco veces por la misma decisión.
    const activeIndex = Math.max(
      0,
      options.findIndex((option) => option.selected),
    )

    function handleKeyDown(keyEvent, index) {
      const step =
        keyEvent.key === 'ArrowRight' || keyEvent.key === 'ArrowDown'
          ? 1
          : keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowUp'
            ? -1
            : 0
      let next = null
      if (step !== 0) next = (index + step + options.length) % options.length
      else if (keyEvent.key === 'Home') next = 0
      else if (keyEvent.key === 'End') next = options.length - 1
      if (next === null || next === index) return
      keyEvent.preventDefault()
      keyEvent.currentTarget.parentElement?.children[next]?.focus()
      options[next].onSelect()
    }

    return (
      <div className="admin-event-state__options" role="radiogroup" aria-labelledby={labelledBy}>
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.selected}
            className={`admin-event-state__option${option.selected ? ' is-active' : ''}`}
            disabled={!canEdit || busy}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={option.onSelect}
            onKeyDown={(keyEvent) => handleKeyDown(keyEvent, index)}
          >
            {option.icon ? <option.icon size={14} aria-hidden /> : null}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <section className="admin-event-state" aria-label={t('admin.eventState.label')}>
      <header className="admin-event-state__head">
        <h4>{t('admin.eventState.sectionTitle')}</h4>
        <p>{t('admin.eventState.sectionLead')}</p>
      </header>

      <div className="admin-event-state__fields">
        <div className="admin-event-state__field">
          <span className="admin-event-state__field-label" id={statusLabelId}>
            {t('admin.eventState.status')}
          </span>
          {renderOptions({
            labelledBy: statusLabelId,
            options: statusOptions.map(([value, label]) => ({
              id: value,
              label,
              selected: draft.status === value,
              onSelect: () => handleStatusChange(value),
            })),
          })}
        </div>

        <div className="admin-event-state__field">
          <span className="admin-event-state__field-label" id={accessLabelId}>
            {t('admin.eventState.accessLabel')}
          </span>
          {renderOptions({
            labelledBy: accessLabelId,
            options: [
              {
                id: 'members',
                label: t('admin.eventState.accessMembers'),
                selected: draft.requiresMembership,
                onSelect: () => handleAccessChange('members'),
              },
              {
                id: 'open',
                label: t('admin.eventState.accessOpen'),
                selected: !draft.requiresMembership,
                onSelect: () => handleAccessChange('open'),
              },
            ],
          })}
          <p className="admin-event-state__field-note">{accessNote}</p>
          {draft.requiresMembership && registered > 0 ? (
            <p className="admin-event-state__note admin-event-state__note--info">
              <UserCheck size={13} aria-hidden />
              <span>
                {t('admin.eventState.accessMembersRegisteredNote', { count: registered })}
              </span>
            </p>
          ) : null}
        </div>

        <div className="admin-event-state__field">
          <span className="admin-event-state__field-label" id={siteLabelId}>
            {t('admin.eventState.visibilityLabel')}
          </span>
          {renderOptions({
            labelledBy: siteLabelId,
            options: [
              {
                id: 'published',
                icon: Eye,
                label: t('admin.eventState.published'),
                selected: draft.published,
                onSelect: () => patchDraft({ published: true }),
              },
              {
                id: 'hidden',
                icon: EyeOff,
                label: t('admin.eventState.hidden'),
                selected: !draft.published,
                onSelect: () => patchDraft({ published: false }),
              },
            ],
          })}
          <p className="admin-event-state__field-note">{siteNote}</p>
        </div>
      </div>

      {/* Cómo queda el evento con las tres decisiones de arriba, y el único
          atajo que cambia dos a la vez (habilitar publica y abre). */}
      <div className="admin-event-state__result-bar">
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
          <span className="admin-event-state__result-access">{resultAccess}</span>
        </p>

        <div className="admin-event-state__result-actions">
          {effectiveRegistration.isLive ? null : (
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
          {(registration.scheduled || registration.closedByWindow) && onEditWindow ? (
            <button
              type="button"
              className="admin-event-state__registration-action"
              disabled={!canEdit || busy}
              onClick={() => onEditWindow(event)}
            >
              <CalendarClock size={14} aria-hidden />
              {t('admin.eventState.editWindowAction')}
            </button>
          ) : null}
        </div>
      </div>

      {dirty && !deferSave ? (
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
    </section>
  )
}
