import {
  customBlockImageKeys,
  imageUrlKey,
  isSafeLandingHref,
  isSafeLandingVideoUrl,
  LANDING_BLOCK_LIMITS,
} from '../../../../lib/eventLandingLayout.js'
import { FormField } from '../parts.jsx'

const L = LANDING_BLOCK_LIMITS

/** Campos de texto de cada bloque propio, en el orden en que se editan. */
const FIELDS = {
  text: [
    { key: 'eyebrow', labelKey: 'landingBlockEyebrow', max: L.eyebrow },
    { key: 'title', labelKey: 'landingBlockTitle', max: L.title },
    { key: 'body', labelKey: 'landingBlockBody', max: L.body, multiline: true },
  ],
  image: [
    { key: 'alt', labelKey: 'landingBlockAlt', max: L.alt },
    { key: 'caption', labelKey: 'landingBlockCaption', max: L.caption },
  ],
  cta: [
    { key: 'title', labelKey: 'landingBlockTitle', max: L.title },
    { key: 'body', labelKey: 'landingBlockBody', max: L.body, multiline: true },
    { key: 'label', labelKey: 'landingBlockLabel', max: L.label },
    { key: 'href', labelKey: 'landingBlockHref', max: L.href },
  ],
  gallery: [
    { key: 'title', labelKey: 'landingBlockTitle', max: L.title },
    { key: 'caption', labelKey: 'landingBlockCaption', max: L.caption },
  ],
  sponsors: [{ key: 'title', labelKey: 'landingBlockTitle', max: L.title }],
  video: [
    { key: 'title', labelKey: 'landingBlockTitle', max: L.title },
    { key: 'body', labelKey: 'landingBlockBody', max: L.body, multiline: true },
    { key: 'video', labelKey: 'landingBlockVideo', max: L.video },
  ],
  map: [
    { key: 'title', labelKey: 'landingBlockTitle', max: L.title },
    { key: 'body', labelKey: 'landingBlockAddress', max: L.body, multiline: true },
    { key: 'href', labelKey: 'landingBlockMapHref', max: L.href },
  ],
}

/** Por qué no se acepta lo tipeado, si no se acepta. */
function fieldError(field, value, t) {
  if (!value) return null
  if (field.key === 'href' && !isSafeLandingHref(value)) {
    return t('admin.eventEditor.landingBlockHrefInvalid')
  }
  if (field.key === 'video' && !isSafeLandingVideoUrl(value)) {
    return t('admin.eventEditor.landingBlockVideoInvalid')
  }
  return null
}

/**
 * Galería y sponsors: un lugar por foto o logo. Cada uno se sube o se quita por
 * separado; el orden de los lugares es el de la página.
 */
function ImageSlots({ t, canEdit, busy, hasSlug, block, onUpload, onRemove }) {
  const keys = customBlockImageKeys(block.type)
  const itemKey = block.type === 'sponsors' ? 'landingBlockLogo' : 'landingBlockPhoto'
  return (
    <div className="admin-landing-slots">
      <p className="admin-landing-slots__label">
        {t(
          `admin.eventEditor.${block.type === 'sponsors' ? 'landingBlockLogos' : 'landingBlockPhotos'}`,
        )}
      </p>
      <ul className="admin-landing-slots__grid">
        {keys.map((pathKey, index) => {
          const url = block.props?.[imageUrlKey(pathKey)]
          const name = t(`admin.eventEditor.${itemKey}`, { n: index + 1 })
          return (
            <li key={pathKey} className="admin-landing-slots__slot">
              {url ? (
                <>
                  <img alt="" src={url} />
                  <button
                    type="button"
                    className="admin-event-form__text-btn"
                    aria-label={t('admin.eventEditor.landingBlockImageRemoveNamed', { name })}
                    disabled={!canEdit || busy}
                    onClick={() => onRemove(pathKey)}
                  >
                    {t('admin.eventEditor.landingBlockImageRemove')}
                  </button>
                </>
              ) : (
                <label className="admin-landing-slots__upload">
                  <span>{name}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={t('admin.eventEditor.landingBlockImageUploadNamed', { name })}
                    disabled={!canEdit || busy || !hasSlug}
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) onUpload(file, pathKey)
                    }}
                  />
                </label>
              )}
            </li>
          )
        })}
      </ul>
      {!hasSlug ? (
        <p className="admin-event-form__section-note">
          {t('admin.eventEditor.landingHeroNeedsSlug')}
        </p>
      ) : null}
    </div>
  )
}

function ImagePicker({ t, canEdit, busy, hasSlug, url, onUpload, onRemove }) {
  return (
    <div className="admin-event-form__landing-hero">
      {url ? (
        <div className="admin-event-form__landing-hero-preview">
          <img alt="" height={120} src={url} width={214} />
          <button
            type="button"
            className="admin-event-form__text-btn"
            disabled={!canEdit || busy}
            onClick={onRemove}
          >
            {t('admin.eventEditor.landingBlockImageRemove')}
          </button>
        </div>
      ) : null}
      <label className="admin-event-form__file">
        <span>{t('admin.eventEditor.landingBlockImageUpload')}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={!canEdit || busy || !hasSlug}
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

/**
 * Contenido de un bloque propio (texto, imagen o botón). Lo tipeado se guarda
 * tal cual: el link inválido se marca acá y se descarta recién al guardar.
 */
export default function CustomBlockFields({
  t,
  canEdit,
  block,
  blockIndex,
  hasSlug,
  imageUploading,
  onPatch,
  onUploadImage,
}) {
  return (
    <>
      {block.type === 'image' ? (
        <ImagePicker
          busy={imageUploading}
          canEdit={canEdit}
          hasSlug={hasSlug}
          t={t}
          url={block.props?.url}
          onRemove={() => onPatch({ path: '', url: '' })}
          onUpload={onUploadImage}
        />
      ) : null}

      {block.type === 'gallery' || block.type === 'sponsors' ? (
        <ImageSlots
          block={block}
          busy={imageUploading}
          canEdit={canEdit}
          hasSlug={hasSlug}
          t={t}
          onRemove={(pathKey) => onPatch({ [pathKey]: '', [imageUrlKey(pathKey)]: '' })}
          onUpload={onUploadImage}
        />
      ) : null}

      {(FIELDS[block.type] ?? []).map((field) => {
        const value = block.props?.[field.key] ?? ''
        const error = fieldError(field, value, t)
        const props = {
          id: `event-landing-block-${block.id}-${field.key}`,
          'data-field': `landing.layout.blocks.${blockIndex}.props.${field.key}`,
          maxLength: field.max,
          value,
          disabled: !canEdit,
          onChange: (event) => onPatch({ [field.key]: event.target.value }),
        }
        return (
          <FormField
            key={field.key}
            htmlFor={props.id}
            label={t(`admin.eventEditor.${field.labelKey}`)}
            error={error}
          >
            {field.multiline ? (
              <textarea {...props} rows={3} />
            ) : (
              <input {...props} type="text" aria-invalid={Boolean(error) || undefined} />
            )}
          </FormField>
        )
      })}
    </>
  )
}
