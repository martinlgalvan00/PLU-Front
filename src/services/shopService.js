import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'
import { compressShopProductImage } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * Catálogo de la tienda. La fuente de verdad es el backend (`/api/shop`): lo
 * que se publica en el panel lo ve cualquier visitante, y se conserva entre
 * dispositivos. Este módulo solo habla con esa API y reúne las reglas de
 * presentación que comparten el panel y la tienda pública.
 */

export const SHOP_PRODUCT_STATUS = {
  draft: 'draft',
  published: 'published',
  archived: 'archived',
}

/** Familias de producto, en el orden en que se muestran. */
export const SHOP_PRODUCT_CATEGORIES = [
  ['apparel', 'Ropa y buzos'],
  ['accessories', 'Accesorios'],
  ['exclusive', 'Exclusiva de torneo'],
  ['course', 'Curso'],
]

export const SHOP_COURSE_MODALITIES = [
  ['presencial', 'Presencial'],
  ['online', 'Online'],
  ['hibrido', 'Híbrido'],
]

export const SHOP_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
export const SHOP_MAX_IMAGES = 8

export const SHOP_PRODUCT_DEFAULT = {
  title: '',
  category: 'apparel',
  description: '',
  price: 0,
  imagePaths: [],
  imageUrls: [],
  sizes: [],
  stock: 0,
  eventId: '',
  editionNote: '',
  courseStartsAt: '',
  courseModality: 'presencial',
  courseLocation: '',
  courseCapacity: '',
  status: SHOP_PRODUCT_STATUS.draft,
  featured: false,
  sortOrder: 0,
}

/** Las prendas llevan talles y las exclusivas pueden llevarlos; el resto no. */
export function categorySupportsSizes(category) {
  return category === 'apparel' || category === 'exclusive'
}

/** Cursos: inscripción, no stock. */
export function categoryHasStock(category) {
  return category !== 'course'
}

/** Pestaña pública a la que pertenece una categoría. */
export function shopTabForCategory(category) {
  return category === 'accessories' ? 'apparel' : category
}

/**
 * Convierte el borrador del formulario en el cuerpo que espera la API: números
 * como números, vacíos como `null` y solo los campos que corresponden a la
 * categoría (un curso no manda talles; una prenda no manda fecha de curso).
 */
export function toShopProductPayload(draft) {
  const category = draft.category
  const isCourse = category === 'course'
  const sizes = categorySupportsSizes(category)
    ? (draft.sizes ?? [])
        .map((size) => ({
          label: String(size.label ?? '').trim(),
          stock: Math.max(0, Math.round(Number(size.stock) || 0)),
        }))
        .filter((size) => size.label)
    : []
  const startsAt = draft.courseStartsAt ? new Date(draft.courseStartsAt) : null

  return {
    title: String(draft.title ?? '').trim(),
    category,
    description: String(draft.description ?? '').trim(),
    price: Math.max(0, Math.round(Number(draft.price) || 0)),
    imagePaths: draft.imagePaths ?? [],
    sizes,
    stock:
      categoryHasStock(category) && sizes.length === 0
        ? Math.max(0, Math.round(Number(draft.stock) || 0))
        : 0,
    eventId: category === 'exclusive' && draft.eventId ? draft.eventId : null,
    editionNote: category === 'exclusive' ? String(draft.editionNote ?? '').trim() || null : null,
    courseStartsAt:
      isCourse && startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toISOString() : null,
    courseModality: isCourse ? draft.courseModality || null : null,
    courseLocation: isCourse ? String(draft.courseLocation ?? '').trim() || null : null,
    courseCapacity:
      isCourse && draft.courseCapacity !== '' && draft.courseCapacity != null
        ? Math.max(0, Math.round(Number(draft.courseCapacity) || 0))
        : null,
    status: draft.status,
    featured: Boolean(draft.featured),
    sortOrder: Math.round(Number(draft.sortOrder) || 0),
    // Se manda tal cual lo devolvió el servidor (microsegundos): pasarlo por
    // `Date` lo redondearía a milisegundos y la comparación fallaría siempre.
    expectedUpdatedAt: draft.id && draft.updatedAt ? draft.updatedAt : null,
  }
}

/** Producto del backend → borrador editable (fecha local del input, vacíos como ''). */
export function toShopProductDraft(product) {
  const startsAt = product.courseStartsAt ? new Date(product.courseStartsAt) : null
  const pad = (value) => String(value).padStart(2, '0')
  const localStart =
    startsAt && !Number.isNaN(startsAt.getTime())
      ? `${startsAt.getFullYear()}-${pad(startsAt.getMonth() + 1)}-${pad(startsAt.getDate())}T${pad(startsAt.getHours())}:${pad(startsAt.getMinutes())}`
      : ''

  return {
    ...SHOP_PRODUCT_DEFAULT,
    ...product,
    eventId: product.eventId ?? '',
    editionNote: product.editionNote ?? '',
    courseStartsAt: localStart,
    courseModality: product.courseModality ?? 'presencial',
    courseLocation: product.courseLocation ?? '',
    courseCapacity: product.courseCapacity ?? '',
    imagePaths: product.imagePaths ?? [],
    imageUrls: product.imageUrls ?? [],
    sizes: (product.sizes ?? []).map((size) => ({ label: size.label, stock: size.stock ?? 0 })),
  }
}

/** Productos publicados agrupados por pestaña pública, en el orden del servidor. */
export function groupShopProductsByTab(products = []) {
  const groups = { apparel: [], exclusive: [], course: [] }
  products.forEach((product) => {
    const tab = shopTabForCategory(product.category)
    if (groups[tab]) groups[tab].push(product)
  })
  return groups
}

// ── API pública ──────────────────────────────────────────────────────────

export async function fetchPublicShopProducts() {
  const data = await apiGet('/api/shop/products')
  return Array.isArray(data?.products) ? data.products : []
}

// ── API del panel ────────────────────────────────────────────────────────

export async function fetchAdminShopProducts() {
  const data = await apiGet('/api/shop/admin/products')
  return Array.isArray(data?.products) ? data.products : []
}

export async function saveAdminShopProduct(draft) {
  const payload = toShopProductPayload(draft)
  const data = draft.id
    ? await apiPatch(`/api/shop/admin/products/${draft.id}`, payload)
    : await apiPost('/api/shop/admin/products', payload)
  return data.product
}

export async function deleteAdminShopProduct(productId) {
  return apiDelete(`/api/shop/admin/products/${productId}`)
}

export function validateShopImageFile(file) {
  if (!file) return { error: 'Seleccioná una imagen.' }
  if (!IMAGE_MIME_TYPES.has(file.type)) return { error: 'Usá una imagen JPG, PNG o WEBP.' }
  if (file.size > SHOP_IMAGE_MAX_BYTES) return { error: 'La imagen supera el límite de 5 MB.' }
  return { ok: true }
}

/**
 * Sube una foto de producto: la comprime en el navegador, pide al backend una
 * URL firmada y sube directo a Storage. Devuelve `{ path, url }`: la ruta es lo
 * que se guarda en el producto; la URL pública sirve para la vista previa.
 */
export async function uploadShopProductImage(file) {
  const validation = validateShopImageFile(file)
  if (validation.error) throw new ApiError(validation.error, { status: 400 })
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir la imagen.', {
      status: 503,
    })
  }

  const prepared = await compressShopProductImage(file)
  if (prepared.size > SHOP_IMAGE_MAX_BYTES) {
    throw new ApiError('La imagen sigue siendo demasiado pesada después de comprimirla.', {
      status: 400,
    })
  }
  const supabase = await getSupabaseClient()
  const upload = await apiPost('/api/shop/admin/images/upload-url', {
    fileName: prepared.name,
    contentType: prepared.type || 'image/webp',
    size: prepared.size,
  })
  const { error } = await supabase.storage
    .from('shop-products')
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: '31536000',
    })
  if (error) throw new ApiError(error.message || 'No se pudo subir la imagen.', { status: 502 })
  return { path: upload.path, url: upload.url }
}

// ------------------------------------------------------------------ pedidos
// Operación de pedidos y de la configuración de cobro (panel, requiere sesión).

export async function fetchAdminShopOrders(status = null) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const result = await apiGet(`/api/shop/admin/orders${query}`)
  return result.orders ?? []
}

const orderAction = (orderId, action, payload = {}) =>
  apiPost(`/api/shop/admin/orders/${orderId}/${action}`, payload).then((result) => result.order)

export const approveShopOrder = (orderId) => orderAction(orderId, 'approve')
export const cancelShopOrder = (orderId, reason = '') =>
  orderAction(orderId, 'cancel', reason ? { reason } : {})
export const fulfillShopOrder = (orderId) => orderAction(orderId, 'fulfill')
export const resolveShopOrderRefund = (orderId) => orderAction(orderId, 'resolve-refund')

export async function fetchShopOrderProofUrl(orderId) {
  const result = await apiGet(`/api/shop/admin/orders/${orderId}/proof-url`)
  return result.url
}

export async function fetchShopCheckoutSettings() {
  return apiGet('/api/shop/admin/checkout-settings')
}

export async function saveShopCheckoutSettings(settings) {
  return apiPatch('/api/shop/admin/checkout-settings', {
    mercadoPagoEnabled: Boolean(settings.mercadoPagoEnabled),
    bankTransferEnabled: Boolean(settings.bankTransferEnabled),
    cashEnabled: Boolean(settings.cashEnabled),
    mercadoPagoProfileId: settings.mercadoPagoProfileId || null,
    bankTransferProfileId: settings.bankTransferProfileId || null,
    cashInstructions: String(settings.cashInstructions ?? '').trim(),
    fulfillmentNote: String(settings.fulfillmentNote ?? '').trim(),
  })
}
