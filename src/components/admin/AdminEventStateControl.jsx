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
 * editor completo. El editor reescribe el evento entero -- días, tipos de
 * entrada, beneficios --, así que usarlo para apagar un evento diez minutos era
 * pagar un precio que la operación no tiene por qué pagar.
 *
 * `agotado` no es una opción elegible: lo pone y lo saca la base según el cupo
 * (`sync_event_capacity_status`). Aparece como chip solo cuando el evento ya
 * está en ese estado, porque si no la fila quedaría sin ningún chip activo y
 * daría la impresión de que el estado se perdió.
 *
 * ── Acceso: solo afiliados o abierto ──
 * Habilitar o deshabilitar un meet como "solo afiliados" era lo único de la
 * operación diaria que obligaba a abrir el editor completo, entrar a la tercera
 * pestaña, encontrar un checkbox cuya etiqueta era una afirmación
 * ("Requiere afiliación activa") y guardar el evento entero — con el efecto
 * colateral de recrear días, tandas y tipos de entrada de un evento que
 * posiblemente ya tenía atletas asignados a una grilla.
 *
 * Acá son dos opciones excluyentes y escritas como decisión, no como casilla,
 * y cada una dice su consecuencia real: el requisito no solo filtra la
 * inscripción, decide quién pasa la puerta el día del meet
 * (`src/lib/gateAccess.js`). Con inscriptos ya cargados eso puede dejar gente
 * afuera, así que el control lo advierte antes y no después.
 */
export default function AdminEventStateControl({ canEdit = false, event, onSetState }) {
  const { locale, t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

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

  const accessOptions = useMemo(
    () => [
      ['members', t('admin.eventState.accessMembers')],
      ['open', t('admin.eventState.accessOpen')],
    ],
    [t],
  )

  const statusOptions = useMemo(() => {
    const values = [...EVENT_QUICK_STATUS_VALUES]
    if (status === 'agotado' && !values.includes('agotado')) {
      values.splice(values.indexOf('cupos_limitados') + 1, 0, 'agotado')
    }
    return translateFilterOptions(
      values.map((value) => [value, 'status']),
      t,
    )
  }, [status, t])

  async function apply(changes, { successKey }) {
    if (!canEdit || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await onSetState?.(event.slug, changes)
      if (result?.error) {
        setNotice({ tone: 'error', text: result.error })
        return
      }
      // La base puede corregir el estado pedido: reabrir un evento lleno lo
      // devuelve a `agotado`. Decirlo evita que el operador crea que el cambio
      // no se guardó y lo repita tres veces.
      setNotice(
        result?.statusOverridden
          ? { tone: 'info', text: t('admin.eventState.overridden') }
          : { tone: 'success', text: t(successKey) },
      )
    } finally {
      setBusy(false)
    }
  }

  function handleStatusChange(value) {
    if (value === status) return
    void apply({ status: value }, { successKey: 'admin.eventState.statusSaved' })
  }

  function handleVisibilityToggle() {
    void apply(
      { published: !published },
      {
        successKey: published
          ? 'admin.eventState.unpublishedSaved'
          : 'admin.eventState.publishedSaved',
      },
    )
  }

  function handleOpenRegistrations() {
    void apply(
      { status: 'inscripcion_abierta', published: true },
      { successKey: 'admin.eventState.registrationOpened' },
    )
  }

  function handleAccessChange(value) {
    const next = value === 'members'
    if (next === requiresMembership) return
    void apply(
      { requiresMembership: next },
      {
        successKey: next
          ? 'admin.eventState.accessMembersSaved'
          : 'admin.eventState.accessOpenSaved',
      },
    )
  }

  function handleSetUpcoming() {
    void apply(
      { status: 'proximamente', published: true },
      { successKey: 'admin.eventState.upcomingSaved' },
    )
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
          {registration.isLive ? (
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
          {registration.canSetUpcoming ? (
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
        {/* Compacto visual: la operación diaria sigue siendo writable, pero
            sin chips con borde/pill. El CSS del shell mantiene 36px+. */}
        <AdminFilterChipGroup
          compact
          inline
          disabled={!canEdit || busy}
          id={`event-state-${event?.id ?? 'none'}`}
          label={t('admin.eventState.status')}
          onChange={handleStatusChange}
          options={statusOptions}
          value={status}
        />

        {/* Acceso al meet. Va junto al estado y no en el editor porque es la
            misma clase de decisión: se toma el día que se toma y no debería
            costar una reescritura del evento.

            Las notas van pegadas al control, no al final de la banda: puestas
            abajo quedaban después del botón de publicación y se leían como
            comentarios de la visibilidad, que es otra decisión. */}
        <div className="admin-event-state__access">
          <AdminFilterChipGroup
            compact
            inline
            disabled={!canEdit || busy}
            id={`event-access-${event?.id ?? 'none'}`}
            label={t('admin.eventState.accessLabel')}
            onChange={handleAccessChange}
            options={accessOptions}
            value={requiresMembership ? 'members' : 'open'}
          />

          {/* La consecuencia del acceso elegido, escrita entera. El requisito de
              afiliación no es una etiqueta del evento: define quién puede
              inscribirse y quién pasa la puerta, y eso no se deduce de un chip
              activo. */}
          <p className="admin-event-state__note admin-event-state__note--muted">
            {requiresMembership ? (
              <ShieldCheck size={13} aria-hidden />
            ) : (
              <Unlock size={13} aria-hidden />
            )}
            {requiresMembership
              ? t('admin.eventState.accessMembersNote')
              : t('admin.eventState.accessOpenNote')}
          </p>

          {/* Con gente ya inscripta, el requisito puede dejar a alguien afuera
              el día del meet. Se dice antes de que pase, no cuando el atleta
              está parado en la puerta. */}
          {requiresMembership && registered > 0 ? (
            <p className="admin-event-state__note admin-event-state__note--info">
              <UserCheck size={13} aria-hidden />
              {t('admin.eventState.accessMembersRegisteredNote', { count: registered })}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          className={[
            'admin-event-state__visibility',
            published ? 'is-published' : 'is-hidden',
          ].join(' ')}
          aria-pressed={published}
          disabled={!canEdit || busy}
          onClick={handleVisibilityToggle}
        >
          {busy ? (
            <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
          ) : published ? (
            <Eye size={14} aria-hidden />
          ) : (
            <EyeOff size={14} aria-hidden />
          )}
          <span>{published ? t('admin.eventState.published') : t('admin.eventState.hidden')}</span>
        </button>
      </div>

      {/* Por qué el evento dejó de tomar inscripciones, y qué hacer si no era
          la intención. Sin esta línea, `agotado` parece un estado que alguien
          eligió mal. */}
      {status === 'agotado' ? (
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
