import { useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { EVENT_QUICK_STATUS_VALUES, isEventFull } from '../../services/eventAdminService.js'

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
 */
export default function AdminEventStateControl({ canEdit = false, event, onSetState }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const full = isEventFull(event)
  const published = event?.published === true
  const status = event?.status ?? 'proximamente'

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

  return (
    <div className="admin-event-state" role="group" aria-label={t('admin.eventState.label')}>
      <div className="admin-event-state__controls">
        {/* Sin `compact` a propósito: la variante compacta del panel es una
            tira de pestañas de 34px pensada para filtrar. Acá cada chip
            escribe en la base, así que va la variante con borde y check —
            target táctil de 44px para la tablet de la sede. */}
        <AdminFilterChipGroup
          inline
          disabled={!canEdit || busy}
          id={`event-state-${event?.id ?? 'none'}`}
          label={t('admin.eventState.status')}
          onChange={handleStatusChange}
          options={statusOptions}
          value={status}
        />

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
            <Loader2 className="admin-event-state__spinner" size={14} aria-hidden />
          ) : published ? (
            <Eye size={14} aria-hidden />
          ) : (
            <EyeOff size={14} aria-hidden />
          )}
          <span>
            {published ? t('admin.eventState.published') : t('admin.eventState.hidden')}
          </span>
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
