import { ApiError, apiGet, apiPost, apiRequest } from '../lib/api.js'
import { compressPaymentProofFile } from '../lib/compressImageFile.js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js'

/**
 * Pedidos de la tienda. Este módulo solo habla con `/api/shop`: el precio, el
 * stock y la acreditación del pago los resuelve el servidor. Nada de lo que se
 * hace acá confirma un pago.
 */

export const SHOP_PROOF_BUCKET = 'shop-payment-proofs'
export const SHOP_PROOF_MAX_BYTES = 2 * 1024 * 1024
const PROOF_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

export const SHOP_PAYMENT_METHODS = ['mercado_pago', 'bank_transfer', 'cash_on_site']

// ------------------------------------------------------------------ tokens
// El token de un pedido es la única llave del comprador (no tiene cuenta). Se
// guarda en el navegador para poder volver al pedido; nunca se manda por URL
// de consulta, solo en el fragmento (`#t=`) de los links de correo.
const ORDERS_STORAGE_KEY = 'plu.shop.orders.v1'
const MAX_REMEMBERED_ORDERS = 10

function readOrderTokens() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDERS_STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function rememberShopOrder(orderId, accessToken) {
  try {
    const tokens = { ...readOrderTokens(), [orderId]: accessToken }
    const trimmed = Object.fromEntries(Object.entries(tokens).slice(-MAX_REMEMBERED_ORDERS))
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Sin almacenamiento el pedido igual se ve en esta sesión.
  }
}

export function recallShopOrderToken(orderId) {
  const token = readOrderTokens()[orderId]
  return typeof token === 'string' ? token : null
}

export function forgetShopOrder(orderId) {
  try {
    const { [orderId]: _removed, ...rest } = readOrderTokens()
    window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // ignorado
  }
}

// ---------------------------------------------------------------------- API
export async function fetchShopCheckout() {
  return apiGet('/api/shop/checkout')
}

export async function createShopOrder({ items, buyer, paymentMethod }) {
  const result = await apiPost('/api/shop/orders', { items, buyer, paymentMethod })
  rememberShopOrder(result.order.id, result.accessToken)
  return result
}

export async function fetchShopOrder(orderId, accessToken) {
  const result = await apiRequest(`/api/shop/orders/${orderId}`, {
    headers: { 'X-Order-Access-Token': accessToken },
  })
  return result.order
}

export async function startShopPayment(orderId, accessToken) {
  return apiPost(`/api/shop/orders/${orderId}/pay`, { accessToken })
}

/**
 * Al volver de Mercado Pago le pide al servidor que verifique el pago con el
 * proveedor. El `paymentId` de la URL es solo una pista: el servidor lo valida
 * contra el pedido y es quien acredita.
 */
export async function reconcileShopOrder(orderId, accessToken, paymentId = null) {
  return apiPost(`/api/shop/orders/${orderId}/reconcile`, {
    accessToken,
    ...(paymentId ? { paymentId: String(paymentId) } : {}),
  })
}

export function validateShopProofFile(file) {
  if (!file) return { error: 'Elegí un archivo.' }
  if (!PROOF_MIME_TYPES.has(file.type)) return { error: 'Subí una imagen JPG, PNG, WEBP o un PDF.' }
  return { ok: true }
}

export async function uploadShopOrderProof(orderId, accessToken, file) {
  const validation = validateShopProofFile(file)
  if (validation.error) throw new ApiError(validation.error, { status: 400 })
  if (!isSupabaseConfigured) {
    throw new ApiError('Supabase no está configurado. No se puede subir el comprobante.', {
      status: 503,
    })
  }

  const prepared = file.type === 'application/pdf' ? file : await compressPaymentProofFile(file)
  if (prepared.size > SHOP_PROOF_MAX_BYTES) {
    throw new ApiError('El comprobante pesa más de 2 MB.', { status: 400 })
  }
  const supabase = await getSupabaseClient()
  const upload = await apiPost(`/api/shop/orders/${orderId}/proof-upload`, {
    accessToken,
    fileName: prepared.name,
    contentType: prepared.type,
    size: prepared.size,
  })
  const { error } = await supabase.storage
    .from(SHOP_PROOF_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, prepared, {
      contentType: prepared.type,
      cacheControl: '3600',
    })
  if (error) {
    throw new ApiError(error.message || 'No se pudo subir el comprobante.', { status: 502 })
  }
  const registered = await apiPost(`/api/shop/orders/${orderId}/proof`, {
    accessToken,
    proofPath: upload.path,
  })
  return registered.order
}

/** Estado "terminal": el pedido ya no cambia solo. */
export const isShopOrderClosed = (order) =>
  order?.status === 'cancelado' || order?.status === 'vencido'
