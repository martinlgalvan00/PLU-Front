import { useEffect, useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Edit3, ImagePlus, Plus, Search, Shirt, Trash2, X } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  SHOP_PRODUCT_CATEGORIES,
  SHOP_PRODUCT_DEFAULT,
  SHOP_PRODUCT_STATUS,
} from '../../services/shopService.js'
import { money } from '../../lib/format.js'

const STATUS_OPTIONS = [
  SHOP_PRODUCT_STATUS.draft,
  SHOP_PRODUCT_STATUS.published,
  SHOP_PRODUCT_STATUS.archived,
]

function emptyDraft(overrides = {}) {
  return { ...SHOP_PRODUCT_DEFAULT, ...overrides }
}

function ShopProductModal({ canEdit, draft, error, onCancel, onChange, onSubmit, t, locale }) {
  const titleId = useId()
  const isEdit = Boolean(draft.id)
  const previewPrice = Number(draft.price)
  const hasPreviewMeta =
    Boolean(draft.title?.trim()) || (Number.isFinite(previewPrice) && previewPrice > 0)

  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onCancel()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
    }
  }, [onCancel])

  return createPortal(
    <div className="admin-shop-modal">
      <button
        type="button"
        className="admin-shop-modal__backdrop"
        aria-label={t('common.cancel')}
        onClick={onCancel}
      />
      <div
        className="admin-shop-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-shop-modal__head">
          <div className="admin-shop-modal__head-copy">
            <span className="admin-shop-modal__eyebrow">
              <Shirt size={12} strokeWidth={1.75} aria-hidden />
              {isEdit ? t('admin.shop.editMode') : t('admin.shop.createMode')}
            </span>
            <h2 id={titleId}>{isEdit ? t('admin.shop.editTitle') : t('admin.shop.createTitle')}</h2>
            <p className="admin-shop-modal__lead">{t('admin.shop.hintText')}</p>
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

        <form className="admin-shop-modal__form" onSubmit={onSubmit}>
          <div className="admin-shop-modal__layout">
            <aside className="admin-shop-modal__stage">
              <div className="admin-shop-modal__preview" aria-label={t('admin.shop.previewLabel')}>
                {draft.imageUrl ? (
                  <img src={draft.imageUrl} alt="" />
                ) : (
                  <div className="admin-shop-modal__preview-empty">
                    <span className="admin-shop-modal__preview-icon" aria-hidden>
                      <ImagePlus size={22} strokeWidth={1.5} />
                    </span>
                    {!hasPreviewMeta ? (
                      <>
                        <span className="admin-shop-modal__preview-label">
                          {t('admin.shop.previewLabel')}
                        </span>
                        <span className="admin-shop-modal__preview-hint">
                          {t('admin.shop.previewEmpty')}
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
                {hasPreviewMeta ? (
                  <div className="admin-shop-modal__preview-meta">
                    <span className="admin-shop-modal__preview-title">
                      {draft.title?.trim() || t('admin.shop.createTitle')}
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
                <legend>{t('admin.shop.groupIdentity')}</legend>
                <label>
                  <span>{t('admin.shop.fields.title')}</span>
                  <input
                    value={draft.title}
                    onChange={(event) => onChange('title', event.target.value)}
                    placeholder={t('admin.shop.placeholders.title')}
                    disabled={!canEdit}
                    autoFocus
                  />
                </label>

                <label>
                  <span>{t('admin.shop.fields.description')}</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) => onChange('description', event.target.value)}
                    placeholder={t('admin.shop.placeholders.description')}
                    disabled={!canEdit}
                    rows={3}
                  />
                </label>

                <label>
                  <span>{t('admin.shop.fields.imageUrl')}</span>
                  <input
                    type="url"
                    value={draft.imageUrl}
                    onChange={(event) => onChange('imageUrl', event.target.value)}
                    placeholder={t('admin.shop.placeholders.imageUrl')}
                    disabled={!canEdit}
                  />
                </label>
              </fieldset>

              <fieldset className="admin-shop-modal__group">
                <legend>{t('admin.shop.groupCommerce')}</legend>
                <div className="admin-shop-modal__row">
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
                </div>

                <div className="admin-shop-modal__row">
                  <label>
                    <span>{t('admin.shop.fields.category')}</span>
                    <select
                      value={draft.category}
                      onChange={(event) => onChange('category', event.target.value)}
                      disabled={!canEdit}
                    >
                      {SHOP_PRODUCT_CATEGORIES.map(([value]) => (
                        <option key={value} value={value}>
                          {t(`admin.shop.categories.${value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
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
                </div>
              </fieldset>

              <fieldset className="admin-shop-modal__group admin-shop-modal__group--publish">
                <legend>{t('admin.shop.groupPublish')}</legend>
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

              {error ? <p className="admin-shop-modal__error">{error}</p> : null}
            </div>
          </div>

          <footer className="admin-shop-modal__footer">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canEdit}>
              {isEdit ? t('admin.shop.save') : t('admin.shop.create')}
            </Button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export default function ShopSection({ canEdit, products = [], onDeleteProduct, onSaveProduct }) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => emptyDraft())
  const [error, setError] = useState('')

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

  function openCreate() {
    setDraft(emptyDraft())
    setError('')
    setEditing(true)
  }

  function openEdit(product) {
    setDraft(product)
    setError('')
    setEditing(true)
  }

  function closeForm() {
    setDraft(emptyDraft())
    setError('')
    setEditing(false)
  }

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!draft.title.trim()) {
      setError(t('admin.shop.validationTitle'))
      return
    }
    if (Number(draft.price) <= 0) {
      setError(t('admin.shop.validationPrice'))
      return
    }
    const result = onSaveProduct?.(draft)
    if (result?.error) {
      setError(result.error)
      return
    }
    closeForm()
  }

  function handleDelete(productId) {
    onDeleteProduct?.(productId)
    if (draft.id === productId) closeForm()
  }

  const isEmpty = products.length === 0
  const catalogCountLabel =
    products.length === 1
      ? t('admin.shop.catalogCountOne')
      : t('admin.shop.catalogCount', { count: products.length })

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
                {filteredProducts.map((product) => (
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
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" />
                        ) : (
                          <Shirt size={28} strokeWidth={1.5} />
                        )}
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
                          <span>{t('admin.shop.stockValue', { stock: product.stock })}</span>
                        </p>
                      </div>
                    </button>
                    <div className="admin-shop-tile__actions">
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
                        onClick={() => handleDelete(product.id)}
                        variant="danger"
                      />
                    </div>
                  </li>
                ))}
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
          locale={locale}
          onCancel={closeForm}
          onChange={updateField}
          onSubmit={handleSubmit}
          t={t}
        />
      ) : null}
    </section>
  )
}
