import { STORAGE_KEY } from '../lib/constants.js'
import { normalizeStoredData } from '../lib/storage.js'

const LEGACY_STORAGE_KEY = 'maximal-plu-arg-demo'

/**
 * La orden en curso vive aparte, y en `sessionStorage`.
 *
 * Por qué no puede estar en `localStorage` con el resto: `createdOrder` lleva
 * `orderAccessToken`, que es un token portador de esa orden de pago -- lo usa el
 * retorno de Mercado Pago para conciliar (ver App.jsx). En `localStorage`
 * quedaba escrito sin vencimiento, legible por cualquier script de la página y
 * compartido entre todas las pestañas y sesiones del navegador: en una
 * computadora de la mesa de acreditación sobrevivía a la persona que compró.
 *
 * `sessionStorage` es lo que corresponde para algo que sólo tiene que durar lo
 * que dura la compra: sobrevive al redirect de vuelta de Mercado Pago -- es una
 * navegación top-level en la misma pestaña -- y se va al cerrarla.
 *
 * Si el retorno cae en otra pestaña (un link del mail) no hay token, y eso ya
 * estaba previsto: `orderAccessToken` viaja opcional y la conciliación tiene su
 * propio camino sin él.
 */
const CURRENT_ORDER_KEY = 'plu:current-order'

export function readStorage() {
  try {
    const saved =
      window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY)
    const data = saved ? normalizeStoredData(JSON.parse(saved)) : null
    const createdOrder = readCurrentOrder()
    if (!data) return createdOrder ? { createdOrder } : null
    return { ...data, createdOrder }
  } catch {
    return null
  }
}

export function writeStorage(data) {
  const { createdOrder, ...persistent } = data ?? {}
  writeCurrentOrder(createdOrder ?? null)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent))
    return true
  } catch {
    return false
  }
}

export function readCurrentOrder() {
  try {
    const raw = window.sessionStorage?.getItem(CURRENT_ORDER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeCurrentOrder(order) {
  try {
    if (order) window.sessionStorage?.setItem(CURRENT_ORDER_KEY, JSON.stringify(order))
    else window.sessionStorage?.removeItem(CURRENT_ORDER_KEY)
    return true
  } catch {
    // Modo privado estricto: sin almacenamiento, la compra sigue -- el token
    // vive en memoria mientras la pestaña no navegue.
    return false
  }
}

export function clearStorage() {
  window.localStorage.removeItem(STORAGE_KEY)
  writeCurrentOrder(null)
}

/**
 * Limpieza de lo que quedó escrito por versiones anteriores. El token de una
 * orden vieja no debería seguir en el disco de nadie sólo porque su navegador no
 * volvió a pasar por el checkout.
 */
export function purgeLegacyCreatedOrder() {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !('createdOrder' in parsed)) continue
      delete parsed.createdOrder
      window.localStorage.setItem(key, JSON.stringify(parsed))
    } catch {
      // Un blob ilegible no bloquea el arranque: lo reemplaza el próximo write.
    }
  }
}
