import { isSafeLandingHref, LANDING_BLOCK_LIMITS } from '../../../../lib/eventLandingLayout.js'
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

      {(FIELDS[block.type] ?? []).map((field) => {
        const value = block.props?.[field.key] ?? ''
        const invalidHref = field.key === 'href' && value !== '' && !isSafeLandingHref(value)
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
            error={invalidHref ? t('admin.eventEditor.landingBlockHrefInvalid') : null}
          >
            {field.multiline ? (
              <textarea {...props} rows={3} />
            ) : (
              <input {...props} type="text" aria-invalid={invalidHref || undefined} />
            )}
          </FormField>
        )
      })}
    </>
  )
}
