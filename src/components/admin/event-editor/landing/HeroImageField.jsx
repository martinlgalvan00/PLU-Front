/**
 * Imagen de la portada: vista previa, subida y quitar. La ruta se guarda en
 * `landing.slots.heroImagePath` al guardar el evento (la subida solo emite el archivo).
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
  return (
    <div className="admin-event-form__landing-hero">
      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingHeroHint')}</p>
      {previewUrl ? (
        <div className="admin-event-form__landing-hero-preview">
          <img alt="" height={180} src={previewUrl} width={320} />
          <button
            type="button"
            className="admin-event-form__text-btn"
            disabled={!canEdit || uploading}
            onClick={onRemove}
          >
            {t('admin.eventEditor.landingHeroRemove')}
          </button>
        </div>
      ) : null}
      <label className="admin-event-form__file">
        <span>{t('admin.eventEditor.landingHeroUpload')}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={!canEdit || uploading || !hasSlug}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onUpload(file)
          }}
        />
      </label>
      {!hasSlug ? (
        <p className="admin-event-form__section-note">
          {t('admin.eventEditor.landingHeroNeedsSlug')}
        </p>
      ) : null}
    </div>
  )
}
