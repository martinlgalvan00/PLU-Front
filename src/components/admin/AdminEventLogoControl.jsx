import { Camera, Eraser, ImagePlus, Trash2 } from 'lucide-react'
import AdminEventMark from './AdminEventMark.jsx'
import useEventLogoUpload from '../../hooks/useEventLogoUpload.js'
import useImageDrop from '../../hooks/useImageDrop.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/pages/admin-event-logo.css'

/**
 * Carga del logo / foto del evento. Tres formas de subir, todas con el mismo
 * resultado inmediato (sin pasar por "Guardar"): elegir archivo, arrastrar y
 * soltar, o pegar desde el portapapeles. Un logo sobre fondo liso se sube ya
 * sin fondo (con "Restaurar fondo" en el aviso); sobre un logo ya subido, la
 * acción «Quitar fondo» aparece solo si tiene un fondo que quitar.
 *
 * variant:
 *  - `mark`: el logo de la cabecera de la ficha; al tocarlo abre el selector.
 *  - `field`: bloque propio dentro de Datos, con la ayuda y "Eliminar".
 */
export default function AdminEventLogoControl({
  canEdit = false,
  event,
  onSetEventLogo,
  variant = 'field',
}) {
  const { t } = useI18n()
  const { busy, canRemoveBackground, remove, removeBackgroundOfCurrent, upload } =
    useEventLogoUpload({ event, onSetEventLogo })
  const editable = canEdit && Boolean(onSetEventLogo)
  const { dragging, dropProps, inputProps, inputRef, openPicker } = useImageDrop({
    disabled: !editable || busy,
    onFile: (file) => void upload(file),
  })

  if (!editable) {
    return variant === 'mark' ? (
      <AdminEventMark event={event} size="md" className="admin-event-workspace__mark" />
    ) : null
  }

  const input = <input ref={inputRef} {...inputProps} />
  const stateClass = `${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`

  if (variant === 'mark') {
    return (
      <div className={`admin-event-logo admin-event-logo--mark${stateClass}`} {...dropProps}>
        <AdminEventMark event={event} size="md" className="admin-event-workspace__mark" />
        <button
          type="button"
          className="admin-event-logo__edit"
          aria-label={t('admin.eventLogo.editAria')}
          title={t('admin.eventLogo.editAria')}
          disabled={busy}
          onClick={openPicker}
        >
          {busy ? (
            <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
          ) : (
            <Camera size={16} aria-hidden />
          )}
        </button>
        {input}
      </div>
    )
  }

  return (
    <section
      className={`admin-event-logo admin-event-logo--field${stateClass}`}
      aria-label={t('admin.eventLogo.title')}
      tabIndex={0}
      {...dropProps}
    >
      <AdminEventMark event={event} size="lg" />
      <div className="admin-event-logo__copy">
        <h3 className="admin-event-logo__title">{t('admin.eventLogo.title')}</h3>
        <p className="admin-event-logo__hint">
          {dragging ? t('admin.eventLogo.dropHere') : t('admin.eventLogo.hint')}
        </p>
        <div className="admin-event-logo__actions">
          <button
            type="button"
            className="admin-event-logo__action"
            disabled={busy}
            onClick={openPicker}
          >
            {busy ? (
              <span className="plu-spinner plu-spinner--sm" aria-hidden="true" />
            ) : (
              <ImagePlus size={15} aria-hidden />
            )}
            {busy
              ? t('admin.eventLogo.uploading')
              : event.logoUrl
                ? t('admin.eventLogo.change')
                : t('admin.eventLogo.add')}
          </button>
          {canRemoveBackground && !busy ? (
            <button
              type="button"
              className="admin-event-logo__action"
              onClick={() => void removeBackgroundOfCurrent()}
            >
              <Eraser size={15} aria-hidden />
              {t('admin.eventLogo.removeBackground')}
            </button>
          ) : null}
          {event.logoUrl && !busy ? (
            <button
              type="button"
              className="admin-event-logo__action admin-event-logo__action--quiet"
              onClick={() => void remove()}
            >
              <Trash2 size={15} aria-hidden />
              {t('admin.eventLogo.remove')}
            </button>
          ) : null}
        </div>
      </div>
      {input}
    </section>
  )
}
