import { useEffect, useRef } from 'react'

const MODAL_FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Portal focus-trap + Escape + scroll-lock + devolución de foco, compartido
 * por los diálogos del panel admin. Mismo patrón que
 * `src/components/checkout/usePaymentModal.js` para el checkout público.
 *
 * `active` sirve para componentes que quedan montados siempre y alternan su
 * propia visibilidad (ej. un drawer con `AnimatePresence`): con `active:
 * false` no se enganchan los listeners ni el scroll-lock.
 */
export function useAdminModal(onClose, { active = true } = {}) {
  const panelRef = useRef(null)
  const stateRef = useRef({ onClose })
  stateRef.current = { onClose }

  useEffect(() => {
    if (!active) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector(MODAL_FOCUSABLE)?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        stateRef.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll(MODAL_FOCUSABLE) ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [active])

  return panelRef
}
