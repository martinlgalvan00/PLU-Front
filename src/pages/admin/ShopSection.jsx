import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Award,
  Copy,
  Edit3,
  GraduationCap,
  ImagePlus,
  Plus,
  Search,
  Shirt,
  Star,
  Trash2,
  Watch,
  X,
} from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import Button from '../../components/ui/Button.jsx'
import ShopCheckoutSettingsPanel from './ShopCheckoutSettingsPanel.jsx'
import ShopOrdersPanel from './ShopOrdersPanel.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  categorySupportsSizes,
  deleteAdminShopProduct,
  fetchAdminShopProducts,
  saveAdminShopProduct,
  SHOP_COURSE_MODALITIES,
  SHOP_MAX_IMAGES,
  SHOP_PRODUCT_CATEGORIES,
  SHOP_PRODUCT_DEFAULT,
  SHOP_PRODUCT_STATUS,
  toShopProductDraft,
  uploadShopProductImage,
} from '../../services/shopService.js'
import { money } from '../../lib/format.js'
import '../../styles/pages/admin-shop-catalog.css'

const STATUS_OPTIONS = [
  SHOP_PRODUCT_STATUS.draft,
  SHOP_PRODUCT_STATUS.published,
  SHOP_PRODUCT_STATUS.archived,
]
const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
/** Fotos que se comprimen y suben a la vez: más rápido que de a una, sin
 * saturar la memoria del navegador con ocho WebP en paralelo. */
const UPLOAD_CONCURRENCY = 3
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const CATEGORY_ICONS = {
  apparel: Shirt,
  accessories: Watch,
  exclusive: Award,
  course: GraduationCap,
}

function categoryIcon(category) {
  return CATEGORY_ICONS[category] ?? Shirt
}

function emptyDraft(overrides = {}) {
  return { ...SHOP_PRODUCT_DEFAULT, imagePaths: [], imageUrls: [], sizes: [], ...overrides }
}

/** Unidades en depósito: la suma de los talles, o el stock único. */
function productStock(product) {
  if (product.category === 'course') return null
  const sizes = product.sizes ?? []
  return sizes.length > 0
    ? sizes.reduce((total, size) => total + (Number(size.stock) || 0), 0)
    : Number(product.stock) || 0
}

function formatCourseDate(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Subida compartida: preview dropzone + galería. Comprime a WebP antes de Storage. */
function useShopImageUploader({ canEdit, draft, onChange, onError, t }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const remaining = SHOP_MAX_IMAGES - draft.imagePaths.length

  const uploadFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList ?? []).slice(0, Math.max(0, remaining))
      if (!canEdit || files.length === 0) return
      setUploading(true)
      onError('')
      try {
        // De a tandas y en orden: las que salen bien se conservan aunque otra
        // falle, y la portada sigue siendo la primera que se eligió.
        const uploaded = []
        let failure = null
        for (let index = 0; index < files.length; index += UPLOAD_CONCURRENCY) {
          const batch = files.slice(index, index + UPLOAD_CONCURRENCY)
          const results = await Promise.allSettled(batch.map((file) => uploadShopProductImage(file)))
          for (const result of results) {
            if (result.status === 'fulfilled') uploaded.push(result.value)
            else failure ??= result.reason
          }
        }
        if (uploaded.length > 0) {
          onChange('imagePaths', [...draft.imagePaths, ...uploaded.map((item) => item.path)])
          onChange('imageUrls', [...draft.imageUrls, ...uploaded.map((item) => item.url)])
        }
        if (failure) onError(failure?.message ?? t('admin.shop.saveError'))
      } finally {
        setUploading(false)
      }
    },
    [
      canEdit,
      draft.imagePaths,
      draft.imageUrls,
      onChange,
      onError,
      remaining,
      t,
    ],
  )

  function openPicker() {
    if (!canEdit || remaining <= 0 || uploading) return
    inputRef.current?.click()
  }

  function onInputChange(event) {
    const files = event.target.files
    event.target.value = ''
    void uploadFiles(files)
  }

  function onDragEnter(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!canEdit || remaining <= 0 || uploading) return
    setDragOver(true)
  }

  function onDragOver(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!canEdit || remaining <= 0 || uploading) return
    event.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  function onDragLeave(event) {
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.contains(event.relatedTarget)) return
    setDragOver(false)
  }

  function onDrop(event) {
    event.preventDefault()
    event.stopPropagation()
    setDragOver(false)
    if (!canEdit || remaining <= 0 || uploading) return
    void uploadFiles(event.dataTransfer.files)
  }

  return {
    inputRef,
    uploading,
    dragOver,
    remaining,
    openPicker,
    onInputChange,
    dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}

/** Fotos del producto: la primera es la portada. Suben directo a Storage. */
function ShopImagesField({
  canEdit,
  draft,
  onChange,
  t,
  uploading,
  remaining,
  onOpenPicker,
}) {
  const imagesLeadKey = `admin.shop.imagesLeadByCategory.${draft.category}`
  const imagesLeadRaw = t(imagesLeadKey, { max: SHOP_MAX_IMAGES })
  const imagesLead =
    imagesLeadRaw === imagesLeadKey
      ? t('admin.shop.imagesLead', { max: SHOP_MAX_IMAGES })
      : imagesLeadRaw

  function removeAt(index) {
    onChange(
      'imagePaths',
      draft.imagePaths.filter((_, i) => i !== index),
    )
    onChange(
      'imageUrls',
      draft.imageUrls.filter((_, i) => i !== index),
    )
  }

  function makeCover(index) {
    const reorder = (list) => [list[index], ...list.filter((_, i) => i !== index)]
    onChange('imagePaths', reorder(draft.imagePaths))
    onChange('imageUrls', reorder(draft.imageUrls))
  }

  return (
    <div className="admin-shop-media">
      <p className="admin-shop-media__lead">{imagesLead}</p>
      <ul className="admin-shop-media__list">
        {draft.imageUrls.map((url, index) => (
          <li key={draft.imagePaths[index] ?? url} className="admin-shop-media__item">
            <img src={url} alt="" />
            {index === 0 ? (
              <span className="admin-shop-media__cover">{t('admin.shop.cover')}</span>
            ) : canEdit ? (
              <button
                type="button"
                className="admin-shop-media__make-cover"
                onClick={() => makeCover(index)}
              >
                {t('admin.shop.makeCover')}
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="admin-shop-media__remove"
                aria-label={t('admin.shop.removeImage')}
                onClick={() => removeAt(index)}
              >
                <X size={12} strokeWidth={2.2} aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
        {canEdit && remaining > 0 ? (
          <li>
            <button
              type="button"
              className="admin-shop-media__add"
              disabled={uploading}
              onClick={onOpenPicker}
            >
              {uploading ? (
                <span className="plu-spinner" aria-hidden />
              ) : (
                <ImagePlus size={18} aria-hidden />
              )}
              <span>{uploading ? t('admin.shop.uploading') : t('admin.shop.addImage')}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}

/** Talles con su stock; sin talles el producto usa un stock único. */
function ShopSizesField({ canEdit, draft, onChange, t }) {
  const used = new Set(draft.sizes.map((size) => size.label.trim().toLowerCase()))

  function update(index, patch) {
    onChange(
      'sizes',
      draft.sizes.map((size, i) => (i === index ? { ...size, ...patch } : size)),
    )
  }

  function add(label) {
    onChange('sizes', [...draft.sizes, { label, stock: 0 }])
  }

  const missing = SIZE_PRESETS.filter((label) => !used.has(label.toLowerCase()))

  function addCurve() {
    onChange('sizes', [...draft.sizes, ...missing.map((label) => ({ label, stock: 0 }))])
  }

  return (
    <div className="admin-shop-sizes">
      <p className="admin-shop-media__lead">{t('admin.shop.sizesLead')}</p>
      {draft.sizes.length > 0 ? (
        <ul className="admin-shop-sizes__list">
          {draft.sizes.map((size, index) => (
            <li key={`${index}-${size.label}`} className="admin-shop-sizes__row">
              <input
                aria-label={t('admin.shop.sizeLabel')}
                className="admin-shop-sizes__label"
                value={size.label}
                maxLength={20}
                disabled={!canEdit}
                onChange={(event) => update(index, { label: event.target.value })}
              />
              <input
                aria-label={t('admin.shop.sizeStock')}
                className="admin-shop-sizes__stock"
                min="0"
                type="number"
                value={size.stock}
                disabled={!canEdit}
                onChange={(event) => update(index, { stock: event.target.value })}
              />
              {canEdit ? (
                <button
                  type="button"
                  className="admin-shop-sizes__remove"
                  aria-label={t('admin.shop.removeSize')}
                  onClick={() =>
                    onChange(
                      'sizes',
                      draft.sizes.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X size={13} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <div
          className="admin-shop-sizes__presets"
          role="group"
          aria-label={t('admin.shop.addSize')}
        >
          {missing.length > 1 ? (
            <button type="button" onClick={addCurve}>
              + {t('admin.shop.sizeCurve')}
            </button>
          ) : null}
          {missing.map((label) => (
            <button key={label} type="button" onClick={() => add(label)}>
              + {label}
            </button>
          ))}
          <button type="button" onClick={() => add('')}>
            + {t('admin.shop.sizeCustom')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function shopCopy(t, key, category, fallbackKey, vars) {
  const scoped = `${key}.${category}`
  const value = t(scoped, vars)
  if (value !== scoped) return value
  return fallbackKey ? t(fallbackKey, vars) : value
}

function ShopProductModal({
  canEdit,
  draft,
  error,
  events,
  saving,
  notice,
  confirmDiscard,
  onCancel,
  onChange,
  onDiscard,
  onError,
  onKeepEditing,
  onSubmit,
  onSubmitAnother,
  t,
  locale,
}) {
  const titleId = useId()
  const isEdit = Boolean(draft.id)
  const previewPrice = Number(draft.price)
  const hasPreviewMeta =
    Boolean(draft.title?.trim()) || (Number.isFinite(previewPrice) && previewPrice > 0)
  const isCourse = draft.category === 'course'
  const isExclusive = draft.category === 'exclusive'
  const supportsSizes = categorySupportsSizes(draft.category)
  const hasSizes = supportsSizes && draft.sizes.length > 0
  const coverUrl = draft.imageUrls[0] ?? ''
  const CategoryIcon = categoryIcon(draft.category)
  const modalTitle = shopCopy(
    t,
    isEdit ? 'admin.shop.editTitleByCategory' : 'admin.shop.createTitleByCategory',
    draft.category,
    isEdit ? 'admin.shop.editTitle' : 'admin.shop.createTitle',
  )
  const modalLead = shopCopy(
    t,
    'admin.shop.hintByCategory',
    draft.category,
    'admin.shop.hintText',
  )
  const previewEmpty = shopCopy(
    t,
    'admin.shop.previewEmptyByCategory',
    draft.category,
    'admin.shop.previewEmpty',
  )
  const titlePlaceholder = shopCopy(
    t,
    'admin.shop.placeholders.titleByCategory',
    draft.category,
    'admin.shop.placeholders.title',
  )
  const descriptionPlaceholder = shopCopy(
    t,
    'admin.shop.placeholders.descriptionByCategory',
    draft.category,
    'admin.shop.placeholders.description',
  )
  const images = useShopImageUploader({ canEdit, draft, onChange, onError, t })
  const canUploadImages = canEdit && images.remaining > 0 && !images.uploading
  const stageInteractive = canUploadImages && !coverUrl

  const panelRef = useRef(null)
  const cancelRef = useRef(onCancel)
  useEffect(() => {
    cancelRef.current = onCancel
  })

  // Foco: Tab no se escapa del diálogo y, al cerrar, vuelve a lo que lo abrió.
  useEffect(() => {
    const opener = document.activeElement
    function handleKey(event) {
      if (event.key === 'Escape') {
        cancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  function handleFormKeyDown(event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !saving) {
      event.preventDefault()
      event.currentTarget.requestSubmit()
    }
  }

  return createPortal(
    <div className="admin-shop-modal">
      <button
        type="button"
        className="admin-shop-modal__backdrop"
        aria-label={t('common.cancel')}
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        className="admin-shop-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-shop-modal__head">
          <div className="admin-shop-modal__head-copy">
            <span className="admin-shop-modal__eyebrow">
              <CategoryIcon size={12} strokeWidth={1.75} aria-hidden />
              {isEdit ? t('admin.shop.editMode') : t('admin.shop.createMode')}
            </span>
            <h2 id={titleId}>{modalTitle}</h2>
            <p className="admin-shop-modal__lead">{modalLead}</p>
          </div>
          <button
            type="button"
            className="admin-shop-modal__close"
            onClick={onCancel}
            aria-label={t('common.cancel')}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <form
          className="admin-shop-modal__form"
          onSubmit={onSubmit}
          onKeyDown={handleFormKeyDown}
        >
          <input
            ref={images.inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={images.onInputChange}
          />
          <div className="admin-shop-modal__layout">
            <aside className="admin-shop-modal__stage">
              <div
                className={`admin-shop-modal__preview${images.dragOver ? ' is-drag' : ''}${images.uploading ? ' is-uploading' : ''}${stageInteractive ? ' is-dropzone' : ''}`}
                aria-label={t('admin.shop.previewLabel')}
                {...(canUploadImages ? images.dropHandlers : {})}
                {...(stageInteractive
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      onClick: images.openPicker,
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          images.openPicker()
                        }
                      },
                    }
                  : {})}
              >
                {coverUrl ? (
                  <img src={coverUrl} alt="" />
                ) : (
                  <div className="admin-shop-modal__preview-empty">
                    <span className="admin-shop-modal__preview-icon" aria-hidden>
                      {images.uploading ? (
                        <span className="plu-spinner" />
                      ) : (
                        <ImagePlus size={22} strokeWidth={1.5} />
                      )}
                    </span>
                    <span className="admin-shop-modal__preview-label">
                      {images.uploading
                        ? t('admin.shop.uploading')
                        : t('admin.shop.previewDropLabel')}
                    </span>
                    <span className="admin-shop-modal__preview-hint">
                      {images.uploading ? t('admin.shop.compressingHint') : previewEmpty}
                    </span>
                  </div>
                )}
                {coverUrl && images.uploading ? (
                  <div className="admin-shop-modal__preview-busy" aria-live="polite">
                    <span className="plu-spinner" aria-hidden />
                    <span>{t('admin.shop.uploading')}</span>
                  </div>
                ) : null}
                {coverUrl && canUploadImages && !images.uploading ? (
                  <div className="admin-shop-modal__preview-drop-hint" aria-hidden>
                    {t('admin.shop.previewDropMore')}
                  </div>
                ) : null}
                {hasPreviewMeta ? (
                  <div className="admin-shop-modal__preview-meta">
                    <span className="admin-shop-modal__preview-title">
                      {draft.title?.trim() || modalTitle}
                    </span>
                    {Number.isFinite(previewPrice) && previewPrice > 0 ? (
                      <span className="admin-shop-modal__preview-price">
                        {money(previewPrice, locale)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>

            <div className="admin-shop-modal__fields">
              <fieldset className="admin-shop-modal__group">
                <legend>{t('admin.shop.groupFamily')}</legend>
                <div
                  className="admin-shop-modal__families"
                  role="group"
                  aria-label={t('admin.shop.fields.category')}
                >
                  <span className="admin-shop-modal__families-label">
                    {t('admin.shop.fields.category')}
                  </span>
                  <div className="admin-shop-modal__family-chips">
                    {SHOP_PRODUCT_CATEGORIES.map(([value]) => {
                      const ChipIcon = categoryIcon(value)
                      const active = draft.category === value
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`admin-shop-modal__family-chip${active ? ' is-active' : ''}`}
                          aria-pressed={active}
                          disabled={!canEdit}
                          onClick={() => onChange('category', value)}
                        >
                          <ChipIcon size={14} strokeWidth={1.75} aria-hidden />
                          {t(`admin.shop.categories.${value}`)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </fieldset>

              <fieldset className="admin-shop-modal__group">
                <legend>{t('admin.shop.groupCommerce')}</legend>
                <label>
                  <span>{t('admin.shop.fields.price')}</span>
                  <input
                    min="0"
                    type="number"
                    value={draft.price}
                    onChange={(event) => onChange('price', event.target.value)}
                    disabled={!canEdit}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-shop-modal__group">
                <legend>{t('admin.shop.groupIdentity')}</legend>
                <label>
                  <span>{t('admin.shop.fields.title')}</span>
                  <input
                    value={draft.title}
                    onChange={(event) => onChange('title', event.target.value)}
                    placeholder={titlePlaceholder}
                    disabled={!canEdit}
                    maxLength={120}
                    autoFocus
                  />
                </label>
                <label>
                  <span>{t('admin.shop.fields.description')}</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) => onChange('description', event.target.value)}
                    placeholder={descriptionPlaceholder}
                    disabled={!canEdit}
                    maxLength={4000}
                    rows={3}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-shop-modal__group">
                <legend>{t('admin.shop.groupMedia')}</legend>
                <ShopImagesField
                  canEdit={canEdit}
                  draft={draft}
                  onChange={onChange}
                  t={t}
                  uploading={images.uploading}
                  remaining={images.remaining}
                  onOpenPicker={images.openPicker}
                />
              </fieldset>

              {isCourse ? (
                <fieldset className="admin-shop-modal__group">
                  <legend>{t('admin.shop.groupCourse')}</legend>
                  <div className="admin-shop-modal__row">
                    <label>
                      <span>{t('admin.shop.fields.courseStartsAt')}</span>
                      <input
                        type="datetime-local"
                        value={draft.courseStartsAt}
                        onChange={(event) => onChange('courseStartsAt', event.target.value)}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      <span>{t('admin.shop.fields.courseModality')}</span>
                      <select
                        value={draft.courseModality}
                        onChange={(event) => onChange('courseModality', event.target.value)}
                        disabled={!canEdit}
                      >
                        {SHOP_COURSE_MODALITIES.map(([value]) => (
                          <option key={value} value={value}>
                            {t(`admin.shop.modality.${value}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="admin-shop-modal__row">
                    <label>
                      <span>{t('admin.shop.fields.courseLocation')}</span>
                      <input
                        value={draft.courseLocation}
                        onChange={(event) => onChange('courseLocation', event.target.value)}
                        maxLength={160}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      <span>{t('admin.shop.fields.courseCapacity')}</span>
                      <input
                        min="0"
                        type="number"
                        value={draft.courseCapacity}
                        onChange={(event) => onChange('courseCapacity', event.target.value)}
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                </fieldset>
              ) : (
                <fieldset className="admin-shop-modal__group">
                  <legend>
                    {supportsSizes ? t('admin.shop.groupSizes') : t('admin.shop.groupStock')}
                  </legend>
                  {supportsSizes ? (
                    <ShopSizesField canEdit={canEdit} draft={draft} onChange={onChange} t={t} />
                  ) : null}
                  {!hasSizes ? (
                    <label>
                      <span>{t('admin.shop.fields.stock')}</span>
                      <input
                        min="0"
                        type="number"
                        value={draft.stock}
                        onChange={(event) => onChange('stock', event.target.value)}
                        disabled={!canEdit}
                      />
                    </label>
                  ) : null}
                </fieldset>
              )}

              {isExclusive ? (
                <fieldset className="admin-shop-modal__group">
                  <legend>{t('admin.shop.groupEvent')}</legend>
                  <div className="admin-shop-modal__row">
                    <label>
                      <span>{t('admin.shop.fields.event')}</span>
                      <select
                        value={draft.eventId}
                        onChange={(event) => onChange('eventId', event.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">{t('admin.shop.fields.noEvent')}</option>
                        {events.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t('admin.shop.fields.editionNote')}</span>
                      <input
                        value={draft.editionNote}
                        onChange={(event) => onChange('editionNote', event.target.value)}
                        placeholder={t('admin.shop.placeholders.editionNote')}
                        maxLength={120}
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                </fieldset>
              ) : null}

              <fieldset className="admin-shop-modal__group admin-shop-modal__group--publish">
                <legend>{t('admin.shop.groupPublish')}</legend>
                <div className="admin-shop-modal__row">
                  <label>
                    <span>{t('admin.shop.fields.status')}</span>
                    <select
                      value={draft.status}
                      onChange={(event) => onChange('status', event.target.value)}
                      disabled={!canEdit}
                    >
                      {STATUS_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {t(`admin.shop.status.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t('admin.shop.fields.sortOrder')}</span>
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(event) => onChange('sortOrder', event.target.value)}
                      disabled={!canEdit}
                    />
                  </label>
                </div>
                <label
                  className={`admin-shop-modal__check${draft.featured ? ' is-on' : ''}${!canEdit ? ' is-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(draft.featured)}
                    onChange={(event) => onChange('featured', event.target.checked)}
                    disabled={!canEdit}
                  />
                  <span className="admin-shop-modal__check-copy">
                    <span className="admin-shop-modal__check-title">
                      {t('admin.shop.fields.featured')}
                    </span>
                    <span className="admin-shop-modal__check-hint">
                      {t('admin.shop.featuredBadge')}
                    </span>
                  </span>
                </label>
              </fieldset>

              <p className="admin-shop-modal__note">{t('admin.shop.noPaymentNote')}</p>
              {notice ? (
                <p className="admin-shop-modal__note" role="status">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p className="admin-shop-modal__error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <footer className="admin-shop-modal__footer">
            {confirmDiscard ? (
              <>
                <p className="admin-shop-modal__note" role="alert">
                  {t('admin.shop.discardLead')}
                </p>
                <Button type="button" variant="outline" onClick={onKeepEditing} autoFocus>
                  {t('admin.shop.discardKeep')}
                </Button>
                <Button type="button" variant="outline" onClick={onDiscard}>
                  {t('admin.shop.discardYes')}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t('common.cancel')}
                </Button>
                {!isEdit && canEdit ? (
                  <Button type="button" variant="outline" disabled={saving} onClick={onSubmitAnother}>
                    {t('admin.shop.saveAndAnother')}
                  </Button>
                ) : null}
                <Button type="submit" disabled={!canEdit || saving}>
                  {saving
                    ? t('admin.shop.saving')
                    : isEdit
                      ? t('admin.shop.save')
                      : t('admin.shop.create')}
                </Button>
              </>
            )}
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}

function ShopCatalogPanel({ canEdit, events = [] }) {
  const { locale, t } = useI18n()
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState(() => emptyDraft())
  const [error, setError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [notice, setNotice] = useState('')
  // Foto del borrador al abrir: sirve para saber si hay algo sin guardar.
  const snapshotRef = useRef('')
  const opening = useRef(false)

  const reload = useCallback(async () => {
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    try {
      setProducts(await fetchAdminShopProducts())
      setLoadError('')
      setStatus('ready')
    } catch (loadFailure) {
      setLoadError(loadFailure?.message ?? t('admin.shop.loadError'))
      setStatus('error')
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return products.filter((product) => {
      if (categoryFilter !== 'all' && product.category !== categoryFilter) return false
      if (!normalized) return true
      return [product.title, product.description, product.category, product.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    })
  }, [categoryFilter, products, query])

  const publishedCount = useMemo(
    () => products.filter((product) => product.status === SHOP_PRODUCT_STATUS.published).length,
    [products],
  )

  function openForm(nextDraft, nextNotice = '') {
    snapshotRef.current = JSON.stringify(nextDraft)
    setDraft(nextDraft)
    setError('')
    setNotice(nextNotice)
    setConfirmDiscard(false)
    setEditing(true)
  }

  function openCreate() {
    openForm(emptyDraft())
  }

  /** Guardar reescribe talles y stock completos, y el listado puede tener
   * horas encima mientras los pedidos descuentan unidades. Antes de editar o
   * duplicar se trae la versión vigente; si no se puede, se usa la del listado. */
  async function freshProduct(product) {
    try {
      const list = await fetchAdminShopProducts()
      setProducts(list)
      return list.find((item) => item.id === product.id) ?? product
    } catch {
      return product
    }
  }

  async function openEdit(product) {
    if (opening.current) return
    opening.current = true
    try {
      openForm(toShopProductDraft(await freshProduct(product)))
    } finally {
      opening.current = false
    }
  }

  /** Producto nuevo a partir de otro: mismas fotos, talles y datos, como
   * borrador y sin destacar. Un curso queda sin fecha: la edición siguiente
   * es otra fecha, no la misma. */
  async function openDuplicate(product) {
    if (opening.current) return
    opening.current = true
    const base = toShopProductDraft(await freshProduct(product))
    opening.current = false
    openForm({
      ...base,
      id: undefined,
      slug: undefined,
      title: `${base.title} ${t('admin.shop.copySuffix')}`.trim(),
      status: SHOP_PRODUCT_STATUS.draft,
      featured: false,
      courseStartsAt: '',
    })
  }

  function closeForm() {
    snapshotRef.current = ''
    setDraft(emptyDraft())
    setError('')
    setNotice('')
    setConfirmDiscard(false)
    setEditing(false)
  }

  /** Cerrar con cambios sin guardar pide confirmación: las fotos ya subidas y
   * lo tipeado se perderían con un clic en el fondo. */
  function requestClose() {
    if (!saving && JSON.stringify(draft) !== snapshotRef.current) {
      setConfirmDiscard(true)
      return
    }
    closeForm()
  }

  function updateField(field, value) {
    setConfirmDiscard(false)
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function validate() {
    if (!draft.title.trim()) return t('admin.shop.validationTitle')
    if (Number(draft.price) <= 0) return t('admin.shop.validationPrice')
    if (categorySupportsSizes(draft.category)) {
      const labels = draft.sizes.map((size) => size.label.trim().toLowerCase()).filter(Boolean)
      if (new Set(labels).size !== labels.length) return t('admin.shop.validationSizes')
    }
    if (draft.status === 'published') {
      if (draft.category === 'exclusive' && !draft.eventId) return t('admin.shop.validationEvent')
      if (draft.category === 'course' && (!draft.courseStartsAt || !draft.courseModality)) {
        return t('admin.shop.validationCourse')
      }
    }
    return ''
  }

  async function persist({ another = false } = {}) {
    if (saving) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveAdminShopProduct(draft)
      // El catálogo se refresca de fondo: no hace esperar al que sigue cargando.
      void reload()
      if (another) {
        openForm(
          emptyDraft({ category: draft.category }),
          t('admin.shop.savedAnother', { title: draft.title.trim() }),
        )
      } else {
        closeForm()
      }
    } catch (saveFailure) {
      setError(saveFailure?.message ?? t('admin.shop.saveError'))
      // 409: el producto cambió mientras se editaba. Se refresca el listado para
      // que al reabrirlo ya traiga la versión vigente.
      if (saveFailure?.status === 409) void reload()
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    void persist()
  }

  async function handleDelete(productId) {
    setConfirmDeleteId(null)
    try {
      await deleteAdminShopProduct(productId)
      if (draft.id === productId) closeForm()
      await reload()
    } catch (deleteFailure) {
      setLoadError(deleteFailure?.message ?? t('admin.shop.saveError'))
    }
  }

  const isEmpty = status === 'ready' && products.length === 0
  const catalogCountLabel =
    products.length === 1
      ? t('admin.shop.catalogCountOne')
      : t('admin.shop.catalogCount', { count: products.length })

  if (status === 'loading') {
    return (
      <section className="admin-shop">
        <p className="admin-shop__state" role="status">
          {t('admin.shop.loading')}
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="admin-shop">
        <div className="admin-shop__state admin-shop__state--error" role="alert">
          <p>{loadError || t('admin.shop.loadError')}</p>
          <Button variant="outline" onClick={() => void reload()}>
            {t('admin.shop.retry')}
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className={`admin-shop${isEmpty ? ' admin-shop--empty' : ''}`}>
      {isEmpty ? (
        <div className="admin-shop__debut">
          <div className="admin-shop__debut-copy">
            <span className="admin-shop__eyebrow">{t('admin.shop.eyebrow')}</span>
            <h1>{t('admin.shop.title')}</h1>
            <p className="admin-shop__debut-lead">{t('admin.shop.emptyLead')}</p>
            {canEdit ? (
              <Button className="admin-shop__cta" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {t('admin.shop.newProduct')}
              </Button>
            ) : null}
          </div>
          <aside className="admin-shop__debut-rail" aria-label={t('admin.shop.emptyRailLabel')}>
            {SHOP_PRODUCT_CATEGORIES.map(([value]) => (
              <div key={value} className="admin-shop__debut-slot">
                <span className="admin-shop__debut-slot-media" aria-hidden />
                <div className="admin-shop__debut-slot-copy">
                  <strong>{t(`admin.shop.categories.${value}`)}</strong>
                  <span>{t(`admin.shop.starterHints.${value}`)}</span>
                </div>
              </div>
            ))}
          </aside>
        </div>
      ) : (
        <>
          <header className="admin-shop__masthead">
            <div className="admin-shop__masthead-copy">
              <span className="admin-shop__eyebrow">{t('admin.shop.eyebrow')}</span>
              <h1>{t('admin.shop.title')}</h1>
              <p>{t('admin.shop.lead')}</p>
            </div>
            <div className="admin-shop__masthead-meta">
              <p className="admin-shop__pulse" aria-live="polite">
                <span>{catalogCountLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{t('admin.shop.publishedCount', { count: publishedCount })}</span>
              </p>
              {canEdit ? (
                <Button className="admin-shop__cta" onClick={openCreate}>
                  <Plus size={16} aria-hidden />
                  {t('admin.shop.newProduct')}
                </Button>
              ) : null}
            </div>
          </header>

          {loadError ? (
            <p className="admin-shop__banner" role="alert">
              {loadError}
            </p>
          ) : null}

          <div className="admin-shop__catalog">
            <div className="admin-shop__toolbar">
              <label className="admin-shop__search">
                <Search size={15} aria-hidden />
                <span className="visually-hidden">{t('admin.shop.search')}</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('admin.shop.searchPlaceholder')}
                />
              </label>
              <div
                className="admin-shop__filters"
                role="group"
                aria-label={t('admin.shop.filterCategory')}
              >
                <button
                  type="button"
                  className={`admin-shop__filter${categoryFilter === 'all' ? ' is-active' : ''}`}
                  aria-pressed={categoryFilter === 'all'}
                  onClick={() => setCategoryFilter('all')}
                >
                  {t('admin.shop.filterAll')}
                </button>
                {SHOP_PRODUCT_CATEGORIES.map(([value]) => (
                  <button
                    key={value}
                    type="button"
                    className={`admin-shop__filter${categoryFilter === value ? ' is-active' : ''}`}
                    aria-pressed={categoryFilter === value}
                    onClick={() => setCategoryFilter(value)}
                  >
                    {t(`admin.shop.categories.${value}`)}
                  </button>
                ))}
              </div>
            </div>

            {filteredProducts.length > 0 ? (
              <ul className="admin-shop__grid">
                {filteredProducts.map((product) => {
                  const stock = productStock(product)
                  const soldOut = stock === 0 && product.status === SHOP_PRODUCT_STATUS.published
                  return (
                    <li
                      key={product.id}
                      className={[
                        'admin-shop-tile',
                        product.featured ? 'is-featured' : '',
                        draft.id === product.id && editing ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <button
                        type="button"
                        className="admin-shop-tile__hit"
                        onClick={() => openEdit(product)}
                        disabled={!canEdit}
                        aria-label={t('admin.shop.editNamed', { title: product.title })}
                      >
                        <div className="admin-shop-tile__media" aria-hidden>
                          {product.imageUrls?.[0] ? (
                            <img src={product.imageUrls[0]} alt="" loading="lazy" />
                          ) : (
                            <Shirt size={28} strokeWidth={1.5} />
                          )}
                          {product.featured ? (
                            <span className="admin-shop-tile__star">
                              <Star size={11} aria-hidden />
                            </span>
                          ) : null}
                        </div>
                        <div className="admin-shop-tile__body">
                          <div className="admin-shop-tile__top">
                            <strong>{product.title}</strong>
                            <span
                              className={`admin-shop-tile__status admin-shop-tile__status--${product.status}`}
                            >
                              {t(`admin.shop.status.${product.status}`)}
                            </span>
                          </div>
                          <p className="admin-shop-tile__meta">
                            <span className="admin-shop-tile__price">
                              {money(product.price, locale)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{t(`admin.shop.categories.${product.category}`)}</span>
                            <span aria-hidden="true">·</span>
                            {product.category === 'course' ? (
                              <span>{formatCourseDate(product.courseStartsAt, locale) || '—'}</span>
                            ) : soldOut ? (
                              <span className="admin-shop-tile__soldout">
                                {t('admin.shop.soldOutBadge')}
                              </span>
                            ) : (
                              <span>{t('admin.shop.stockValue', { stock })}</span>
                            )}
                          </p>
                          {product.category === 'exclusive' && product.eventTitle ? (
                            <p className="admin-shop-tile__event">{product.eventTitle}</p>
                          ) : null}
                        </div>
                      </button>
                      <div className="admin-shop-tile__actions">
                        {confirmDeleteId === product.id ? (
                          <span className="admin-shop-tile__confirm">
                            <button type="button" onClick={() => void handleDelete(product.id)}>
                              {t('admin.shop.deleteYes')}
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteId(null)}>
                              {t('admin.shop.deleteNo')}
                            </button>
                          </span>
                        ) : (
                          <>
                            <AdminIconButton
                              disabled={!canEdit}
                              icon={Copy}
                              label={t('admin.shop.duplicate')}
                              onClick={() => openDuplicate(product)}
                              variant="ghost"
                            />
                            <AdminIconButton
                              disabled={!canEdit}
                              icon={Edit3}
                              label={t('admin.shop.edit')}
                              onClick={() => openEdit(product)}
                              variant="ghost"
                            />
                            <AdminIconButton
                              disabled={!canEdit}
                              icon={Trash2}
                              label={t('admin.shop.delete')}
                              onClick={() => setConfirmDeleteId(product.id)}
                              variant="danger"
                            />
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="admin-shop__empty-filter">
                <p>{t('admin.shop.emptyFilter')}</p>
              </div>
            )}
          </div>
        </>
      )}

      {editing ? (
        <ShopProductModal
          canEdit={canEdit}
          draft={draft}
          error={error}
          events={events}
          locale={locale}
          saving={saving}
          notice={notice}
          confirmDiscard={confirmDiscard}
          onCancel={requestClose}
          onChange={updateField}
          onDiscard={closeForm}
          onError={setError}
          onKeepEditing={() => setConfirmDiscard(false)}
          onSubmit={handleSubmit}
          onSubmitAnother={() => void persist({ another: true })}
          t={t}
        />
      ) : null}
    </section>
  )
}

const SHOP_TABS = ['catalog', 'orders', 'settings']

/**
 * Tienda del panel: catálogo, pedidos (acreditar, entregar, cancelar) y
 * configuración de cobro. Cada pestaña es independiente; el catálogo sigue
 * siendo la primera y la que abre por defecto.
 */
export default function ShopSection({ canEdit, events = [] }) {
  const { t } = useI18n()
  const [tab, setTab] = useState('catalog')

  return (
    <>
      <div className="admin-shop-tabs" role="tablist" aria-label={t('admin.shop.tabs.aria')}>
        {SHOP_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`admin-shop-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`admin-shop-panel-${value}`}
            onClick={() => setTab(value)}
          >
            {t(`admin.shop.tabs.${value}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`admin-shop-panel-${tab}`} aria-labelledby={`admin-shop-tab-${tab}`}>
        {tab === 'catalog' ? <ShopCatalogPanel canEdit={canEdit} events={events} /> : null}
        {tab === 'orders' ? <ShopOrdersPanel canEdit={canEdit} /> : null}
        {tab === 'settings' ? <ShopCheckoutSettingsPanel canEdit={canEdit} /> : null}
      </div>
    </>
  )
}
