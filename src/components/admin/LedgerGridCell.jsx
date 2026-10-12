import { useEffect, useRef, useState } from 'react'
import { moveLedgerFocus } from '../../lib/ledgerGridNav.js'

/**
 * Celda de la grilla del libro de caja, con el comportamiento de una planilla:
 *
 *  - Se enfoca como celda (flechas, Tab, Inicio/Fin las resuelve la grilla).
 *  - Enter, F2, doble clic —o tipear un carácter, que reemplaza el contenido—
 *    abren la edición. Un clic sobre una celda que ya tenía el foco también.
 *  - Enter confirma y baja a la celda de abajo; Tab confirma y pasa a la
 *    siguiente; Escape descarta. Al salir con el mouse, confirma si es válido.
 *
 * `editable` en false (cobros aprobados, que salen del ledger de pagos) deja la
 * celda navegable pero de solo lectura. `onCommit(value)` resuelve `true` si
 * quedó guardado; el optimismo y el revertir viven en el padre.
 *
 * `validate(value)` devuelve un mensaje de error o null.
 */
export default function LedgerGridCell({
  children,
  column,
  editable = false,
  type = 'text',
  value = '',
  label,
  text = '',
  list,
  maxLength,
  min,
  align,
  validate,
  onCommit,
}) {
  const cellRef = useRef(null)
  const inputRef = useRef(null)
  const wasFocusedOnPress = useRef(false)
  const typedRef = useRef(false)
  // Confirmar o descartar con el teclado desmonta el input: ese blur no es un
  // "me fui con el mouse" y no debe volver a confirmar.
  const closingRef = useRef(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    // Si se abrió tipeando, el cursor queda al final; si no, se selecciona todo.
    // `setSelectionRange` no existe en inputs number/date (lanza): en esos el
    // cursor ya queda al final al enfocar.
    if (typedRef.current) {
      if (input.type === 'text') {
        const end = input.value.length
        input.setSelectionRange(end, end)
      }
    } else {
      input.select()
    }
  }, [editing])

  function startEditing(initial, { typed = false } = {}) {
    if (!editable || pending) return
    typedRef.current = typed
    closingRef.current = false
    setError('')
    setDraft(initial ?? String(value ?? ''))
    setEditing(true)
  }

  function stopEditing({ refocus = true } = {}) {
    closingRef.current = true
    setEditing(false)
    setError('')
    if (refocus) window.requestAnimationFrame(() => cellRef.current?.focus())
  }

  async function commit(nextValue) {
    const message = validate?.(nextValue) ?? null
    if (message) {
      setError(message)
      return false
    }
    if (String(nextValue) === String(value ?? '')) {
      stopEditing({ refocus: false })
      return true
    }
    closingRef.current = true
    setEditing(false)
    setPending(true)
    try {
      return await onCommit?.(nextValue)
    } finally {
      setPending(false)
    }
  }

  function handleCellKeyDown(event) {
    if (!editable || event.target !== cellRef.current) return
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      startEditing()
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      startEditing(event.key, { typed: true })
    }
  }

  async function handleInputKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      stopEditing()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const cell = cellRef.current
      const saved = await commit(draft)
      if (saved && !moveLedgerFocus(cell, { rowStep: 1 })) cell?.focus()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      const cell = cellRef.current
      const colStep = event.shiftKey ? -1 : 1
      const saved = await commit(draft)
      if (saved && !moveLedgerFocus(cell, { colStep })) cell?.focus()
    }
  }

  function handleBlur() {
    // El foco se fue con el mouse: confirmar si es válido, descartar si no.
    if (!editing || closingRef.current) return
    // Cambiar de ventana o de pestaña también dispara blur, pero el foco de la
    // página sigue en el input: no es "salí de la celda", la edición se queda.
    if (!document.hasFocus()) return
    const message = validate?.(draft) ?? null
    if (message) {
      stopEditing({ refocus: false })
      return
    }
    void commit(draft)
  }

  const className = [
    'ledger-cell',
    editable ? 'ledger-cell--editable' : 'ledger-cell--readonly',
    align === 'end' ? 'ledger-cell--end' : '',
    pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (editing) {
    return (
      <div ref={cellRef} className={`${className} is-editing`} data-ledger-cell data-column={column} tabIndex={-1}>
        <input
          ref={inputRef}
          className="ledger-cell__input"
          type={type}
          value={draft}
          list={list}
          maxLength={maxLength}
          min={min}
          step={type === 'number' ? 1 : undefined}
          inputMode={type === 'number' ? 'numeric' : undefined}
          autoComplete="off"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${column}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => void handleInputKeyDown(event)}
          onBlur={handleBlur}
        />
        {error ? (
          <span id={`${column}-error`} className="ledger-cell__error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      ref={cellRef}
      className={className}
      data-ledger-cell
      data-column={column}
      tabIndex={0}
      role={editable ? 'button' : undefined}
      aria-label={editable ? `${label}: ${text}` : undefined}
      aria-busy={pending || undefined}
      onKeyDown={handleCellKeyDown}
      onPointerDown={() => {
        wasFocusedOnPress.current = document.activeElement === cellRef.current
      }}
      onClick={() => {
        if (wasFocusedOnPress.current) startEditing()
      }}
      onDoubleClick={() => startEditing()}
    >
      {children}
    </div>
  )
}
