/**
 * Carrito de la tienda: reglas puras (sin React, sin red). El carrito vive en el
 * navegador solo como comodidad; el servidor recalcula precio y stock al crear
 * el pedido, así que nada de lo que se guarda acá es una promesa de precio.
 */

export const SHOP_CART_STORAGE_KEY = 'plu.shop.cart.v1'
export const SHOP_CART_MAX_LINES = 20
export const SHOP_CART_MAX_QUANTITY = 10

export function cartLineKey(productId, sizeLabel) {
  return `${productId}::${sizeLabel ?? ''}`
}

/** Un curso es una inscripción personal: siempre de a una persona. */
const maxQuantityFor = (category) => (category === 'course' ? 1 : SHOP_CART_MAX_QUANTITY)

const clampQuantity = (category, quantity) =>
  Math.min(Math.max(Math.trunc(Number(quantity) || 0), 0), maxQuantityFor(category))

/** Foto del producto en el momento de agregarlo (para mostrar el carrito sin red). */
function snapshotOf(product, sizeLabel, quantity) {
  return {
    key: cartLineKey(product.id, sizeLabel),
    productId: product.id,
    sizeLabel: sizeLabel ?? null,
    quantity: clampQuantity(product.category, quantity),
    title: product.title,
    category: product.category,
    price: Number(product.price) || 0,
    imageUrl: product.imageUrls?.[0] ?? null,
    courseStartsAt: product.course?.startsAt ?? null,
  }
}

export function addToCart(lines, product, { sizeLabel = null, quantity = 1 } = {}) {
  const key = cartLineKey(product.id, sizeLabel)
  const existing = lines.find((line) => line.key === key)
  if (existing) {
    return lines.map((line) =>
      line.key === key
        ? { ...line, quantity: clampQuantity(line.category, line.quantity + quantity) }
        : line,
    )
  }
  if (lines.length >= SHOP_CART_MAX_LINES) return lines
  return [...lines, snapshotOf(product, sizeLabel, quantity)]
}

export function setLineQuantity(lines, key, quantity) {
  return lines
    .map((line) =>
      line.key === key ? { ...line, quantity: clampQuantity(line.category, quantity) } : line,
    )
    .filter((line) => line.quantity > 0)
}

export const removeLine = (lines, key) => lines.filter((line) => line.key !== key)

export const cartCount = (lines) => lines.reduce((sum, line) => sum + line.quantity, 0)

export const cartTotal = (lines) => lines.reduce((sum, line) => sum + line.price * line.quantity, 0)

/** Lo único que viaja al servidor: producto, talle y cantidad. Nunca el precio. */
export const toOrderItems = (lines) =>
  lines.map((line) => ({
    productId: line.productId,
    sizeLabel: line.sizeLabel,
    quantity: line.quantity,
  }))

/**
 * Cruza el carrito con el catálogo vigente: actualiza título y precio, y saca lo
 * que ya no se puede comprar. `notes` explica cada cambio para no sorprender a
 * nadie con un total distinto al de la última vez.
 */
export function reconcileCart(lines, products) {
  const byId = new Map(products.map((product) => [product.id, product]))
  const notes = []
  const next = []

  for (const line of lines) {
    const product = byId.get(line.productId)
    if (!product || !product.inStock) {
      notes.push({ type: 'unavailable', title: line.title })
      continue
    }
    if (line.sizeLabel) {
      const size = (product.sizes ?? []).find((entry) => entry.label === line.sizeLabel)
      if (!size?.inStock) {
        notes.push({ type: 'unavailable', title: line.title, sizeLabel: line.sizeLabel })
        continue
      }
    }
    const price = Number(product.price) || 0
    if (price !== line.price) {
      notes.push({ type: 'price', title: product.title, from: line.price, to: price })
    }
    next.push({
      ...line,
      title: product.title,
      price,
      imageUrl: product.imageUrls?.[0] ?? line.imageUrl,
      courseStartsAt: product.course?.startsAt ?? line.courseStartsAt,
      quantity: clampQuantity(product.category, line.quantity),
    })
  }
  return { lines: next, notes }
}

function sanitizeLine(raw) {
  if (!raw || typeof raw !== 'object') return null
  const productId = typeof raw.productId === 'string' ? raw.productId : ''
  const category = typeof raw.category === 'string' ? raw.category : ''
  const quantity = clampQuantity(category, raw.quantity)
  if (!productId || !category || quantity < 1) return null
  const sizeLabel = typeof raw.sizeLabel === 'string' && raw.sizeLabel ? raw.sizeLabel : null
  return {
    key: cartLineKey(productId, sizeLabel),
    productId,
    sizeLabel,
    quantity,
    title: String(raw.title ?? '').slice(0, 120),
    category,
    price: Math.max(Number(raw.price) || 0, 0),
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : null,
    courseStartsAt: typeof raw.courseStartsAt === 'string' ? raw.courseStartsAt : null,
  }
}

/** Lee el carrito guardado; ante cualquier dato roto devuelve un carrito vacío. */
export function loadCart(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(SHOP_CART_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    const lines = []
    for (const raw of parsed.slice(0, SHOP_CART_MAX_LINES)) {
      const line = sanitizeLine(raw)
      if (!line || seen.has(line.key)) continue
      seen.add(line.key)
      lines.push(line)
    }
    return lines
  } catch {
    return []
  }
}

export function saveCart(storage, lines) {
  try {
    if (lines.length === 0) storage?.removeItem(SHOP_CART_STORAGE_KEY)
    else storage?.setItem(SHOP_CART_STORAGE_KEY, JSON.stringify(lines))
  } catch {
    // Sin almacenamiento (modo privado, cuota) el carrito sigue en memoria.
  }
}
