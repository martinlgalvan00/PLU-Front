import { useState } from 'react'
import { CalendarClock, Eye, EyeOff, LockKeyhole, Unlock } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { resolveEventPublishConfirmChecks } from '../../lib/eventPublishChecks.js'
import usePlatformPaymentChannels from '../../hooks/usePlatformPaymentChannels.js'

/** Estados en los que la inscripción está abierta (o a punto de llenarse). */
const OPEN_STATUSES = new Set(['inscripcion_abierta', 'cupos_limitados'])
/** Estados desde los que tiene sentido abrir: el resto los pone la base o el calendario. */
const OPENABLE_STATUSES = new Set(['proximamente', 'cerrado'])

/**
 * AdminEventQuickActions — PLU ARG
 *
 * Las tres cosas que el equipo hace más seguido con un evento -- publicarlo,
 * abrir o cerrar la inscripción y mover la fecha -- a un clic desde cualquier
 * pestaña, sin pasar por Datos > Estado y acceso.
 *
 * No agrega ninguna regla: llama al mismo `onSetEventState(slug, payload)` que
 * el control de estado (PATCH parcial de `status` / `published`). La fecha no
 * se edita acá: lleva al campo de inicio del formulario de Datos, donde viven
 * las validaciones de ventana y cupo.
 *
 * Cada cambio confirma con un toast y un "Deshacer" que repone el estado
 * anterior; en lugar de un diálogo de confirmación que frena a quien opera.
 */
export default function AdminEventQuickActions({
  event,
  canEdit = false,
  onSetEventState,
  onEditDate,
  hasUnsavedState = () => false,
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const platformChannels = usePlatformPaymentChannels()

  if (!canEdit || !event || !onSetEventState) return null

  const status = event.status ?? 'proximamente'
  const published = event.published === true
  const registrationsOpen = OPEN_STATUSES.has(status)
  const canToggleRegistrations = registrationsOpen || OPENABLE_STATUSES.has(status)

  async function apply(payload, previous, successText) {
    if (busy) return
    if (hasUnsavedState()) {
      notifyError(t('admin.eventQuick.unsavedState'))
      return
    }
    setBusy(true)
    try {
      const result = await onSetEventState(event.slug, payload)
      if (result?.error) {
        notifyError(result.error)
        return
      }
      notifySuccess(successText, {
        label: t('admin.eventQuick.undo'),
        onClick: () => {
          void onSetEventState(event.slug, previous).then((undone) => {
            if (undone?.error) notifyError(undone.error)
          })
        },
      })
    } catch (error) {
      notifyError(error?.message || t('admin.eventState.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  function toggleRegistrations() {
    if (registrationsOpen) {
      void apply({ status: 'cerrado' }, { status }, t('admin.eventQuick.registrationsClosed'))
      return
    }
    if (!published && !confirmPublish()) return
    void apply(
      { status: 'inscripcion_abierta', published: true },
      { status, published },
      t('admin.eventQuick.registrationsOpened'),
    )
  }

  /**
   * Publicar es lo que ve el público. Si el evento quedaría sin un medio de
   * cobro posible se avisa antes, con el motivo; es un aviso y no un bloqueo
   * porque hay eventos que se anuncian antes de abrir ventas.
   */
  function confirmPublish() {
    const checks = resolveEventPublishConfirmChecks(event, platformChannels.platform)
    if (checks.length === 0) return true
    const lines = checks.map((code) => `• ${t(`admin.eventEditor.publishChecks.codes.${code}`)}`)
    return window.confirm(
      `${t('admin.eventEditor.publishChecks.intro')}\n\n${lines.join('\n')}\n\n${t('admin.eventEditor.publishChecks.confirmOutro')}`,
    )
  }

  function togglePublished() {
    if (!published && !confirmPublish()) return
    void apply(
      { published: !published },
      { published },
      published ? t('admin.eventState.unpublishedSaved') : t('admin.eventState.publishedSaved'),
    )
  }

  return (
    <div
      className="admin-event-bar"
      role="group"
      aria-label={t('admin.eventQuick.label')}
    >
      {canToggleRegistrations ? (
        <button
          type="button"
          className={`admin-event-bar__btn${
            registrationsOpen ? '' : ' admin-event-bar__btn--primary'
          }`}
          disabled={busy}
          onClick={toggleRegistrations}
        >
          {registrationsOpen ? (
            <LockKeyhole size={14} aria-hidden />
          ) : (
            <Unlock size={14} aria-hidden />
          )}
          {registrationsOpen
            ? t('admin.eventQuick.closeRegistrations')
            : t('admin.eventQuick.openRegistrations')}
        </button>
      ) : null}

      <button
        type="button"
        className="admin-event-bar__btn"
        disabled={busy}
        aria-pressed={published}
        onClick={togglePublished}
      >
        {published ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
        {published ? t('admin.eventQuick.unpublish') : t('admin.eventQuick.publish')}
      </button>

      {onEditDate ? (
        <button
          type="button"
          className="admin-event-bar__btn admin-event-bar__btn--quiet"
          disabled={busy}
          onClick={onEditDate}
        >
          <CalendarClock size={14} aria-hidden />
          {t('admin.eventQuick.changeDate')}
        </button>
      ) : null}
    </div>
  )
}
