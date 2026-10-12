import { useRef, useState } from 'react'
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import AdminEventMark from './AdminEventMark.jsx'
import useEventLogoUpload, { firstImageFile } from '../../hooks/useEventLogoUpload.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/pages/admin-event-logo.css'

/**
 * Carga del logo / foto del evento. Tres formas de subir, todas con el mismo
 * resultado inmediato (sin pasar por "Guardar"): elegir archivo, arrastrar y
 * soltar, o pegar desde el portapapeles.
 *
 * variant:
 *  - `mark`: el logo de la cabecera de la ficha; al tocarlo abre el selector.
 *  - `field`: bloque propio dentro de Datos, con la ayuda y "Quitar".
 */
export default function AdminEventLogoControl({
  canEdit = false,
  event,
  onSetEventLogo,
  variant = 'field',
}) {
  const { t } = useI18n()
  const { busy, upload, remove } = useEventLogoUpload({ event, onSetEventLogo })
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const editable = canEdit && Boolean(onSetEventLogo)

  if (!editable) {
    return variant === 'mark' ? (
      <AdminEventMark event={event} size="md" className="admin-event-workspace__mark" />
    ) : null
  }

  function openPicker() {
    inputRef.current?.click()
  }

  function handleFile(file) {
    if (file) void upload(file)
  }

  const hasFiles = (dragEvent) => [...(dragEvent.dataTransfer?.types ?? [])].includes('Files')

  const dropProps = {
    onDragEnter: (dragEvent) => {
      if (!hasFiles(dragEvent)) return
      dragEvent.preventDefault()
      setDragging(true)
    },
    onDragOver: (dragEvent) => {
      if (hasFiles(dragEvent)) dragEvent.preventDefault()
    },
    onDragLeave: (dragEvent) => {
      if (!dragEvent.currentTarget.contains(dragEvent.relatedTarget)) setDragging(false)
    },
    onDrop: (dragEvent) => {
      dragEvent.preventDefault()
      setDragging(false)
      handleFile(firstImageFile(dragEvent.dataTransfer))
    },
    onPaste: (pasteEvent) => {
      const file = firstImageFile(pasteEvent.clipboardData)
      if (!file) return
      pasteEvent.preventDefault()
      handleFile(file)
    },
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(changeEvent) => {
        handleFile(changeEvent.target.files?.[0] ?? null)
        changeEvent.target.value = ''
      }}
    />
  )

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
