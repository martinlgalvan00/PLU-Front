import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Info, TriangleAlert, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { ADMIN_TOAST_EVENT } from '../../lib/adminToast.js'

const VARIANTS = new Set(['success', 'info', 'warning', 'error'])
// Un error o un aviso se leen enteros antes de actuar: duran más que un "listo".
const DISMISS_MS = { success: 5000, info: 6000, warning: 9000, error: 9000 }
const DISMISS_WITH_ACTION_MS = 9000
// Lo que dura la salida en CSS (`admin-toast-out`); con movimiento reducido no hay salida.
const EXIT_MS = 180
const MAX_VISIBLE = 3
let toastSeq = 0

const ICONS = { success: Check, info: Info, warning: TriangleAlert, error: TriangleAlert }

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

/**
 * Stack de notificaciones operativas del panel: confirma el resultado de
 * acciones (aprobar, rechazar, guardar) que no tienen otra superficie de
 * feedback. Composición heredada del toast de sesión: superficie elevada,
 * filete superior y un único acento por variante (neutro = hecho, celeste =
 * información, ámbar = aviso, rojo = error real). Apilado abajo a la derecha,
 * fuera de la zona de lectura.
 *
 * El auto-cierre se pausa al pasar el mouse o tomar el foco y retoma con el
 * tiempo que le quedaba (antes volvía a 5 s, también en los que traen
 * "Deshacer"). La barra inferior muestra ese tiempo.
 */
export default function AdminActionToasts() {
  const { t } = useI18n()
  const [toasts, setToasts] = useState([])
  // id → { timerId, deadline, remaining }
  const timersRef = useRef(new Map())

  const remove = useCallback((id) => {
    timersRef.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const dismiss = useCallback(
    (id) => {
      const timer = timersRef.current.get(id)
      if (timer?.timerId != null) window.clearTimeout(timer.timerId)
      if (prefersReducedMotion()) {
        remove(id)
        return
      }
      setToasts((current) =>
        current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)),
      )
      timersRef.current.set(id, { timerId: window.setTimeout(() => remove(id), EXIT_MS) })
    },
    [remove],
  )

  const schedule = useCallback(
    (id, ms) => {
      timersRef.current.set(id, {
        timerId: window.setTimeout(() => dismiss(id), ms),
        deadline: Date.now() + ms,
        remaining: ms,
      })
    },
    [dismiss],
  )

  useEffect(() => {
    function onToast(event) {
      const requested = event?.detail?.variant
      const variant = VARIANTS.has(requested) ? requested : 'success'
      const message = String(event?.detail?.message ?? '').trim()
      if (!message) return
      const action = event?.detail?.action
      const hasAction = Boolean(action?.label && typeof action.onClick === 'function')
      const id = ++toastSeq
      const duration = hasAction ? DISMISS_WITH_ACTION_MS : DISMISS_MS[variant]
      setToasts((current) =>
        [
          ...current,
          { id, variant, message, duration, action: hasAction ? action : null },
        ].slice(-MAX_VISIBLE),
      )
      schedule(id, duration)
    }

    window.addEventListener(ADMIN_TOAST_EVENT, onToast)
    return () => window.removeEventListener(ADMIN_TOAST_EVENT, onToast)
  }, [schedule])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer.timerId))
      timers.clear()
    }
  }, [])

  // Pausa al leer: hover o foco congela el auto-cierre de ese toast.
  function pause(id) {
    const timer = timersRef.current.get(id)
    if (!timer?.deadline) return
    window.clearTimeout(timer.timerId)
    timersRef.current.set(id, {
      timerId: null,
      deadline: null,
      remaining: Math.max(1000, timer.deadline - Date.now()),
    })
  }

  function resume(id) {
    const timer = timersRef.current.get(id)
    if (!timer || timer.deadline || timer.remaining == null) return
    schedule(id, timer.remaining)
  }

  // El contenedor vive montado desde el arranque (vacío no pinta nada):
  // los ítems role="alert"/"status" deben insertarse en una región ya
  // existente para que los lectores de pantalla anuncien también el
  // primer toast de la sesión.
  return (
    <div className="admin-toasts">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant]
        return (
          <div
            key={toast.id}
            className={`admin-toasts__item admin-toasts__item--${toast.variant}`}
            data-leaving={toast.leaving || undefined}
            role={toast.variant === 'error' ? 'alert' : 'status'}
            style={{ '--toast-duration': `${toast.duration}ms` }}
            onMouseEnter={() => pause(toast.id)}
            onMouseLeave={() => resume(toast.id)}
            onFocus={() => pause(toast.id)}
            onBlur={() => resume(toast.id)}
          >
            <span className="admin-toasts__icon" aria-hidden="true">
              <Icon size={14} strokeWidth={toast.variant === 'success' ? 2.25 : 2} />
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
            <span className="admin-toasts__timer" aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}
