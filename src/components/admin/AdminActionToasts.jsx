import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ADMIN_TOAST_EVENT } from '../../lib/adminToast.js'

const DISMISS_MS = 5000
const DISMISS_WITH_ACTION_MS = 8000
const MAX_VISIBLE = 3
let toastSeq = 0

/**
 * Stack de notificaciones operativas del panel: confirma el resultado de
 * acciones (aprobar, rechazar, guardar) que no tienen otra superficie de
 * feedback. Composición heredada del toast de sesión: superficie elevada,
 * filete superior y un único acento por variante (oro = éxito, rojo = error
 * real). Apilado abajo a la derecha, fuera de la zona de lectura.
 */
export default function AdminActionToasts() {
  const { t } = useI18n()
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  useEffect(() => {
    function onToast(event) {
      const variant = event?.detail?.variant === 'error' ? 'error' : 'success'
      const message = String(event?.detail?.message ?? '').trim()
      if (!message) return
      const action = event?.detail?.action
      const hasAction = Boolean(action?.label && typeof action.onClick === 'function')
      const id = ++toastSeq
      setToasts((current) =>
        [...current, { id, variant, message, action: hasAction ? action : null }].slice(
          -MAX_VISIBLE,
        ),
      )
      const delay = hasAction ? DISMISS_WITH_ACTION_MS : DISMISS_MS
      timersRef.current.set(
        id,
        window.setTimeout(() => dismiss(id), delay),
      )
    }

    window.addEventListener(ADMIN_TOAST_EVENT, onToast)
    return () => window.removeEventListener(ADMIN_TOAST_EVENT, onToast)
  }, [dismiss])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId))
      timers.clear()
    }
  }, [])

  // Pausa al leer: hover o foco congela el auto-cierre de ese toast.
  function pause(id) {
    const timerId = timersRef.current.get(id)
    if (timerId != null) {
      window.clearTimeout(timerId)
      timersRef.current.delete(id)
    }
  }

  function resume(id) {
    if (timersRef.current.has(id)) return
    timersRef.current.set(
      id,
      window.setTimeout(() => dismiss(id), DISMISS_MS),
    )
  }

  // El contenedor vive montado desde el arranque (vacío no pinta nada):
  // los ítems role="alert"/"status" deben insertarse en una región ya
  // existente para que los lectores de pantalla anuncien también el
  // primer toast de la sesión.
  return (
    <div className="admin-toasts">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`admin-toasts__item admin-toasts__item--${toast.variant}`}
          role={toast.variant === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => pause(toast.id)}
          onMouseLeave={() => resume(toast.id)}
          onFocus={() => pause(toast.id)}
          onBlur={() => resume(toast.id)}
        >
          <span className="admin-toasts__icon" aria-hidden="true">
            {toast.variant === 'error' ? (
              <TriangleAlert size={14} strokeWidth={2} />
            ) : (
              <Check size={14} strokeWidth={2.25} />
            )}
          </span>
          <p className="admin-toasts__message">{toast.message}</p>
          {toast.action ? (
            <button
              type="button"
              className="admin-toasts__action"
              onClick={() => {
                toast.action.onClick()
                dismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="admin-toasts__close"
            aria-label={t('admin.toasts.dismiss')}
            onClick={() => dismiss(toast.id)}
          >
            <X size={13} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
