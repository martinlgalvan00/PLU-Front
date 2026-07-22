export const SHOP_PRODUCT_STATUS = {
  draft: 'draft',
  published: 'published',
  archived: 'archived',
}

export const SHOP_PRODUCT_CATEGORIES = [
  ['apparel', 'Prendas'],
  ['merch', 'Merch'],
  ['accessories', 'Accesorios'],
  ['equipment', 'Equipamiento'],
]

export const SHOP_PRODUCT_DEFAULT = {
  title: '',
  category: 'apparel',
  description: '',
  price: 0,
  stock: 0,
  imageUrl: '',
  status: SHOP_PRODUCT_STATUS.published,
  featured: false,
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeShopProduct(product = {}) {
  const title = String(product.title ?? '').trim()
  const status = Object.values(SHOP_PRODUCT_STATUS).includes(product.status)
    ? product.status
    : SHOP_PRODUCT_STATUS.draft

  return {
    id: product.id ?? `prod-${Date.now()}`,
    title,
    slug: product.slug ?? slugify(title),
    category: product.category ?? SHOP_PRODUCT_DEFAULT.category,
    description: String(product.description ?? '').trim(),
    price: Math.max(0, Number(product.price) || 0),
    stock: Math.max(0, Number(product.stock) || 0),
    imageUrl: String(product.imageUrl ?? '').trim(),
    status,
    featured: Boolean(product.featured),
    createdAt: product.createdAt ?? new Date().toISOString(),
    updatedAt: product.updatedAt ?? product.createdAt ?? new Date().toISOString(),
  }
}

export function getInitialShopProducts(storedProducts) {
  if (!Array.isArray(storedProducts)) return []
  return storedProducts.map(normalizeShopProduct).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function upsertShopProduct(products, payload) {
  const now = new Date().toISOString()
  const product = normalizeShopProduct({
    ...payload,
    slug: slugify(payload.title),
    updatedAt: now,
    createdAt: payload.createdAt ?? now,
  })

  if (payload.id) {
    return products.map((item) => (item.id === payload.id ? { ...item, ...product, id: item.id } : item))
  }

  return [{ ...product, id: `prod-${Date.now()}` }, ...products]
}

export function deleteShopProduct(products, productId) {
  return products.filter((product) => product.id !== productId)
}

export function getPublishedShopProducts(products = []) {
  return products
    .filter((product) => product.status === SHOP_PRODUCT_STATUS.published)
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.localeCompare(a.createdAt))
}
