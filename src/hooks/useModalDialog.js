import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportamiento de un diálogo modal propio: foco inicial, foco atrapado con Tab,
 * cierre con Escape, scroll de la página bloqueado y foco devuelto a quien lo abrió.
 *
 * Uso: `ref={panelRef}` y `onKeyDown={onKeyDown}` en el contenedor del diálogo y
 * `ref={initialFocusRef}` en el control que recibe el foco al abrir (p. ej. "Cerrar").
 *
 * @param {{ onClose: () => void }} options
 */
export default function useModalDialog({ onClose }) {
  const panelRef = useRef(null)
  const initialFocusRef = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    initialFocusRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [])

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return

    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(
      (element) => element.getClientRects().length > 0,
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { panelRef, initialFocusRef, onKeyDown }
}
