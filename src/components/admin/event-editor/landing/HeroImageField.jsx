import { ImagePlus, Trash2 } from 'lucide-react'
import useImageDrop from '../../../../hooks/useImageDrop.js'

/**
 * Imagen de la portada: vista previa, subida y quitar. La ruta se guarda en
 * `landing.slots.heroImagePath` al guardar el evento (la subida solo emite el archivo).
 *
 * Las tres formas de traer la foto que ya tiene el logo del evento (elegir,
 * arrastrar o pegar), en vez del `input type="file"` nativo, que se veía con el
 * "Choose File" del navegador en medio del panel.
 */
export default function HeroImageField({
  t,
  canEdit,
  hasSlug,
  previewUrl,
  uploading,
  onUpload,
  onRemove,
}) {
  const disabled = !canEdit || uploading || !hasSlug
  const { dragging, dropProps, inputProps, inputRef, openPicker } = useImageDrop({
    disabled,
    onFile: onUpload,
  })
  const text = (key) => t(`admin.eventEditor.${key}`)

  return (
    <div
      className={`admin-landing-hero${dragging ? ' is-dragging' : ''}${uploading ? ' is-busy' : ''}`}
      {...dropProps}
    >
      <div className="admin-landing-hero__frame" aria-hidden={!previewUrl || undefined}>
        {previewUrl ? (
          <img alt="" height={180} src={previewUrl} width={320} />
        ) : (
          <ImagePlus size={20} aria-hidden />
        )}
        {uploading ? <span className="plu-spinner plu-spinner--sm" aria-hidden="true" /> : null}
      </div>
      <div className="admin-landing-hero__copy">
        <p className="admin-landing-hero__hint">
          {dragging ? text('landingHeroDrop') : text('landingHeroHint')}
        </p>
        <div className="admin-landing-hero__actions">
          <button
            type="button"
            className="admin-landing-hero__button"
            disabled={disabled}
            aria-busy={uploading || undefined}
            onClick={openPicker}
          >
            <ImagePlus size={14} aria-hidden />
            {uploading
              ? text('landingHeroUploading')
              : previewUrl
                ? text('landingHeroReplace')
                : text('landingHeroUpload')}
          </button>
          {previewUrl ? (
            <button
              type="button"
              className="admin-landing-hero__remove"
              disabled={!canEdit || uploading}
              onClick={onRemove}
            >
              <Trash2 size={14} aria-hidden />
              {text('landingHeroRemove')}
            </button>
          ) : null}
        </div>
        {!hasSlug ? <p className="admin-landing-hero__hint">{text('landingHeroNeedsSlug')}</p> : null}
      </div>
      <input ref={inputRef} {...inputProps} />
    </div>
  )
}
