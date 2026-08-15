export const ADMIN_TOAST_EVENT = 'plu:admin-toast'

/**
 * Bus de notificaciones operativas del panel. Mismo patrón que
 * `sessionNotice.js`: un CustomEvent permite avisar desde secciones, diálogos
 * o servicios sin acoplarlos al árbol de React ni drillear callbacks.
 *
 * El mensaje viaja ya traducido: quien dispara tiene el `t` a mano.
 */
function emitToast(variant, message, action) {
  const text = String(message ?? '').trim()
  if (!text) return
  const detail = { variant, message: text }
  if (action?.label && typeof action.onClick === 'function') {
    detail.action = { label: action.label, onClick: action.onClick }
  }
  window.dispatchEvent(new CustomEvent(ADMIN_TOAST_EVENT, { detail }))
}

/**
 * `action`: { label, onClick } opcional -- ej. "Deshacer" al descartar un
 * ítem de la cola. El toast se queda más tiempo en pantalla cuando trae una
 * acción, para dar tiempo real a hacer click.
 */
export function notifySuccess(message, action) {
  emitToast('success', message, action)
}

export function notifyError(message) {
  emitToast('error', message)
}
