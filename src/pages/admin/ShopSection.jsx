import { useMemo, useState } from 'react'
import { Edit3, ImagePlus, PackagePlus, Plus, Shirt, Trash2 } from 'lucide-react'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  SHOP_PRODUCT_CATEGORIES,
  SHOP_PRODUCT_DEFAULT,
  SHOP_PRODUCT_STATUS,
} from '../../services/shopService.js'
import { money } from '../../lib/format.js'

const STATUS_OPTIONS = [
  [SHOP_PRODUCT_STATUS.draft, 'Borrador'],
  [SHOP_PRODUCT_STATUS.published, 'Publicado'],
  [SHOP_PRODUCT_STATUS.archived, 'Archivado'],
]

function emptyDraft() {
  return { ...SHOP_PRODUCT_DEFAULT }
}

export default function ShopSection({
  canEdit,
  products = [],
  onDeleteProduct,
  onSaveProduct,
}) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return products
    return products.filter((product) =>
      [product.title, product.description, product.category, product.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    )
  }, [products, query])

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

  const catalogCountLabel =
    products.length === 1
      ? t('admin.shop.catalogCountOne')
      : t('admin.shop.catalogCount', { count: products.length })

  return (
    <section className="admin-shop">
      <header className="admin-shop__head">
        <div className="admin-shop__head-copy">
          <span className="admin-shop__eyebrow">{t('admin.shop.eyebrow')}</span>
          <h2>{t('admin.shop.title')}</h2>
          <p>{t('admin.shop.lead')}</p>
        </div>
        {canEdit ? (
          <Button className="btn--small admin-shop__cta" onClick={openCreate}>
            <Plus size={15} aria-hidden />
            {t('admin.shop.newProduct')}
          </Button>
        ) : null}
      </header>

      <div className="admin-shop__layout">
        <div className="admin-shop__catalog">
          <div className="admin-shop__catalog-toolbar">
            <label className="admin-shop__search">
              <span>{t('admin.shop.search')}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('admin.shop.searchPlaceholder')}
              />
            </label>
            <p className="admin-shop__catalog-count">{catalogCountLabel}</p>
          </div>

          {filteredProducts.length > 0 ? (
            <ul className="admin-shop__list">
              {filteredProducts.map((product) => (
                <li key={product.id} className={`admin-shop-product${product.featured ? ' is-featured' : ''}`}>
                  <div className="admin-shop-product__media" aria-hidden>
                    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Shirt size={22} />}
                  </div>
                  <div className="admin-shop-product__body">
                    <div className="admin-shop-product__title-row">
                      <strong>{product.title}</strong>
                      <span className={`admin-shop-product__status admin-shop-product__status--${product.status}`}>
                        {t(`admin.shop.status.${product.status}`)}
                      </span>
                      {product.featured ? (
                        <span className="admin-shop-product__featured">{t('admin.shop.featuredBadge')}</span>
                      ) : null}
                    </div>
                    <p>{product.description || t('admin.shop.noDescription')}</p>
                    <div className="admin-shop-product__meta">
                      <span className="admin-shop-product__price">{money(product.price, locale)}</span>
                      <span>{t('admin.shop.stockValue', { stock: product.stock })}</span>
                      <span className="admin-shop-product__category">
                        {t(`admin.shop.categories.${product.category}`)}
                      </span>
                    </div>
                  </div>
                  <div className="admin-shop-product__actions">
                    <button type="button" onClick={() => openEdit(product)} disabled={!canEdit}>
                      <Edit3 size={15} aria-hidden />
                      {t('admin.shop.edit')}
                    </button>
                    <button type="button" onClick={() => handleDelete(product.id)} disabled={!canEdit}>
                      <Trash2 size={15} aria-hidden />
                      {t('admin.shop.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="admin-shop__empty">
              <Shirt size={28} aria-hidden />
              <p>{t('admin.shop.empty')}</p>
              <small>{t('admin.shop.emptyHint')}</small>
              {canEdit ? (
                <Button className="btn--small" onClick={openCreate}>
                  <Plus size={14} aria-hidden />
                  {t('admin.shop.newProduct')}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {editing ? (
          <form className="admin-shop-form" onSubmit={handleSubmit}>
            <div className="admin-shop-form__head">
              <span>{draft.id ? t('admin.shop.editMode') : t('admin.shop.createMode')}</span>
              <h3>{draft.id ? t('admin.shop.editTitle') : t('admin.shop.createTitle')}</h3>
            </div>

            <div className="admin-shop-form__preview" aria-label={t('admin.shop.previewLabel')}>
              {draft.imageUrl ? (
                <img src={draft.imageUrl} alt="" />
              ) : (
                <div className="admin-shop-form__preview-empty">
                  <ImagePlus size={22} aria-hidden />
                  <span>{t('admin.shop.previewEmpty')}</span>
                </div>
              )}
            </div>

            <label>
              <span>{t('admin.shop.fields.title')}</span>
              <input
                value={draft.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder={t('admin.shop.placeholders.title')}
                disabled={!canEdit}
              />
            </label>

            <label>
              <span>{t('admin.shop.fields.description')}</span>
              <textarea
                value={draft.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder={t('admin.shop.placeholders.description')}
                disabled={!canEdit}
              />
            </label>

            <div className="admin-shop-form__grid">
              <label>
                <span>{t('admin.shop.fields.category')}</span>
                <select
                  value={draft.category}
                  onChange={(event) => updateField('category', event.target.value)}
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
                  onChange={(event) => updateField('status', event.target.value)}
                  disabled={!canEdit}
                >
                  {STATUS_OPTIONS.map(([value]) => (
                    <option key={value} value={value}>
                      {t(`admin.shop.status.${value}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>{t('admin.shop.fields.price')}</span>
                <input
                  min="0"
                  type="number"
                  value={draft.price}
                  onChange={(event) => updateField('price', event.target.value)}
                  disabled={!canEdit}
                />
              </label>

              <label>
                <span>{t('admin.shop.fields.stock')}</span>
                <input
                  min="0"
                  type="number"
                  value={draft.stock}
                  onChange={(event) => updateField('stock', event.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>

            <label>
              <span>{t('admin.shop.fields.imageUrl')}</span>
              <input
                type="url"
                value={draft.imageUrl}
                onChange={(event) => updateField('imageUrl', event.target.value)}
                placeholder={t('admin.shop.placeholders.imageUrl')}
                disabled={!canEdit}
              />
            </label>

            <label className="admin-shop-form__check">
              <input
                type="checkbox"
                checked={Boolean(draft.featured)}
                onChange={(event) => updateField('featured', event.target.checked)}
                disabled={!canEdit}
              />
              <span>{t('admin.shop.fields.featured')}</span>
            </label>

            {error ? <p className="admin-shop-form__error">{error}</p> : null}

            <div className="admin-shop-form__actions">
              <Button type="submit" disabled={!canEdit}>
                {draft.id ? t('admin.shop.save') : t('admin.shop.create')}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <aside className="admin-shop__hint">
            <PackagePlus size={26} aria-hidden />
            <h3>{t('admin.shop.hintTitle')}</h3>
            <p>{t('admin.shop.hintText')}</p>
            {canEdit ? (
              <Button className="btn--small" onClick={openCreate}>
                <Plus size={14} aria-hidden />
                {t('admin.shop.newProduct')}
              </Button>
            ) : null}
          </aside>
        )}
      </div>
    </section>
  )
}
