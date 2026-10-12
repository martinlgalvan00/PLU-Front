import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

const MENU_GAP = 6
const VIEWPORT_MARGIN = 8

/**
 * Menú de desbordamiento de una fila de Usuarios.
 *
 * Va en un portal con posición fija: la tabla tiene su propio contenedor de
 * scroll horizontal y un menú absoluto quedaba recortado en las últimas filas.
 * Abre hacia abajo y, si no hay lugar, hacia arriba.
 *
 * Teclado: Enter/Espacio/↓ abren y enfocan el primer ítem; ↑/↓/Home/End mueven
 * el foco; Esc cierra y devuelve el foco al disparador; Tab cierra.
 *
 * `items`: `{ key, label, icon, onSelect, tone?: 'danger', confirmLabel?, disabled? }`.
 * Con `confirmLabel` el ítem pide un segundo clic (la acción destructiva no se
 * ejecuta con un solo toque): el primero cambia la etiqueta, el segundo ejecuta.
 */
export default function UsersRowMenu({ label, items, disabled = false }) {
  const menuId = useId()
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [armedKey, setArmedKey] = useState(null)
  const [position, setPosition] = useState(null)

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    setArmedKey(null)
    setPosition(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const anchor = trigger.getBoundingClientRect()
    const height = menu.offsetHeight
    const width = menu.offsetWidth
    const below = window.innerHeight - anchor.bottom - MENU_GAP - VIEWPORT_MARGIN
    const flip = below < height && anchor.top > below
    const top = flip ? anchor.top - MENU_GAP - height : anchor.bottom + MENU_GAP
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.right - width),
      window.innerWidth - width - VIEWPORT_MARGIN,
    )
    setPosition({ top: Math.max(VIEWPORT_MARGIN, top), left })
  }, [open, armedKey])

  // El foco entra al menú recién cuando ya está posicionado: mientras está
  // oculto (visibility: hidden) el navegador no deja enfocar nada.
  const placed = position !== null
  useEffect(() => {
    if (!open || !placed) return
    menuRef.current
      ?.querySelector('[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true })
  }, [open, placed])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) {
        return
      }
      close()
    }
    function handleDismiss() {
      close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleDismiss)
    window.addEventListener('scroll', handleDismiss, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleDismiss)
      window.removeEventListener('scroll', handleDismiss, true)
    }
  }, [open, close])

  function moveFocus(direction) {
    const nodes = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])]
    if (nodes.length === 0) return
    const index = nodes.indexOf(document.activeElement)
    let next = 0
    if (direction === 'first') next = 0
    else if (direction === 'last') next = nodes.length - 1
    else if (direction === 'next') next = index < 0 ? 0 : (index + 1) % nodes.length
    else next = index <= 0 ? nodes.length - 1 : index - 1
    nodes[next].focus()
  }

  function handleMenuKeyDown(event) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close(true)
        break
      case 'ArrowDown':
        event.preventDefault()
        moveFocus('next')
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus('prev')
        break
      case 'Home':
        event.preventDefault()
        moveFocus('first')
        break
      case 'End':
        event.preventDefault()
        moveFocus('last')
        break
      case 'Tab':
        close()
        break
      default:
    }
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault()
      setOpen(true)
    }
  }

  function handleSelect(item) {
    if (item.confirmLabel && armedKey !== item.key) {
      setArmedKey(item.key)
      return
    }
    close(true)
    item.onSelect()
  }

  if (!items || items.length === 0) return null

  const dangerStart = items.findIndex((item) => item.tone === 'danger')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-users__icon-btn${open ? ' is-open' : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={handleTriggerKeyDown}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="admin-users__menu"
              role="menu"
              aria-label={label}
              style={
                position
                  ? { top: position.top, left: position.left }
                  : { top: 0, left: 0, visibility: 'hidden' }
              }
              onKeyDown={handleMenuKeyDown}
            >
              {items.map((item, index) => {
                const Icon = item.icon
                const armed = armedKey === item.key
                return (
                  <div key={item.key} role="none">
                    {index === dangerStart && index > 0 ? (
                      <div className="admin-users__menu-rule" role="separator" />
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className={[
                        'admin-users__menu-item',
                        item.tone === 'danger' ? 'is-danger' : '',
                        armed ? 'is-armed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={item.disabled}
                      onClick={() => handleSelect(item)}
                    >
                      {Icon ? <Icon size={15} aria-hidden /> : null}
                      <span>{armed ? item.confirmLabel : item.label}</span>
                    </button>
                  </div>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
