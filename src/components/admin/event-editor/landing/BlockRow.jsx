import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Trash2 } from 'lucide-react'
import ToggleRow from './ToggleRow.jsx'

function IconButton({ label, disabled, danger = false, onClick, children }) {
  return (
    <button
      type="button"
      className={`admin-landing-blocks__icon${danger ? ' admin-landing-blocks__icon--danger' : ''}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * Una fila de la lista de bloques: interruptor (la portada, en cambio, va fija),
 * subir / bajar, eliminar si es propio y el contenido plegable.
 *
 * Reordenar: arrastrando la manija o, con teclado, con las flechas sobre ella
 * (además de los botones). La manija es lo único arrastrable (la fila entera se
 * ve como imagen del arrastre): así seleccionar texto en un campo nunca
 * arrastra el bloque. Chrome decide qué se arrastra al apretar el mouse, por
 * eso la manija es `draggable` desde el principio.
 *
 * En el editor visual la fila además se selecciona (`selected`) y, cuando el
 * pedido viene de la vista previa (`reveal` cambia), se abre, se desplaza a la
 * vista y enfoca su primer campo.
 */
export default function BlockRow({
  t,
  canEdit,
  block,
  label,
  locked,
  custom,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
  onRemove,
  selected = false,
  reveal = 0,
  onSelect,
  drag = null,
  children,
}) {
  const rowRef = useRef(null)
  const detailsRef = useRef(null)

  useEffect(() => {
    if (!reveal || !rowRef.current) return
    if (detailsRef.current) detailsRef.current.open = true
    rowRef.current.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    const body = '.admin-event-form__landing-details-body'
    const field = rowRef.current.querySelector(
      `${body} input:not([type="checkbox"]):not([type="file"]), ${body} textarea`,
    )
    ;(field ?? rowRef.current.querySelector('summary, button'))?.focus({ preventScroll: true })
  }, [reveal])

  function handleKeyDown(event) {
    if (event.key === 'ArrowUp' && canMoveUp) {
      event.preventDefault()
      onMove(-1)
    } else if (event.key === 'ArrowDown' && canMoveDown) {
      event.preventDefault()
      onMove(1)
    }
  }

  const draggable = Boolean(drag) && canEdit && !locked
  const className = [
    'admin-landing-blocks__item',
    block.visible ? '' : 'is-hidden',
    selected ? 'is-selected' : '',
    drag?.dragging ? 'is-dragging' : '',
    drag?.dropBefore ? 'is-drop-before' : '',
    drag?.dropAfter ? 'is-drop-after' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li
      ref={rowRef}
      className={className}
      data-block={block.id}
      onDragOver={drag ? (event) => drag.onDragOver(event, rowRef.current) : undefined}
      onDrop={drag ? drag.onDrop : undefined}
      onFocusCapture={onSelect ? () => onSelect() : undefined}
    >
      <div className="admin-landing-blocks__head">
        {drag && !locked ? (
          <button
            type="button"
            className="admin-landing-blocks__grip"
            aria-label={t('admin.eventEditor.landingBlockDrag', { name: label })}
            disabled={!canEdit}
            draggable={draggable}
            onDragEnd={drag.onDragEnd}
            onDragStart={(event) => {
              const row = rowRef.current
              if (row && event.dataTransfer.setDragImage) {
                const grip = event.currentTarget.getBoundingClientRect()
                const box = row.getBoundingClientRect()
                event.dataTransfer.setDragImage(
                  row,
                  grip.left - box.left + 12,
                  grip.top - box.top + 12,
                )
              }
              drag.onDragStart(event)
            }}
            onKeyDown={handleKeyDown}
          >
            <GripVertical size={15} aria-hidden />
          </button>
        ) : null}
        {locked ? (
          <div className="admin-landing-blocks__locked">
            <strong>{label}</strong>
            <small>{t('admin.eventEditor.landingBlockLocked')}</small>
          </div>
        ) : (
          <>
            <ToggleRow
              checked={block.visible}
              className="admin-landing-blocks__toggle"
              disabled={!canEdit}
              hint={t(`admin.eventEditor.landingBlockHint_${block.type}`)}
              title={label}
              onChange={onToggle}
            />
            <div className="admin-landing-blocks__actions">
              <IconButton
                disabled={!canEdit || !canMoveUp}
                label={t('admin.eventEditor.landingBlockMoveUp', { name: label })}
                onClick={() => onMove(-1)}
              >
                <ArrowUp size={15} aria-hidden />
              </IconButton>
              <IconButton
                disabled={!canEdit || !canMoveDown}
                label={t('admin.eventEditor.landingBlockMoveDown', { name: label })}
                onClick={() => onMove(1)}
              >
                <ArrowDown size={15} aria-hidden />
              </IconButton>
              {custom ? (
                <IconButton
                  danger
                  disabled={!canEdit}
                  label={t('admin.eventEditor.landingBlockRemove', { name: label })}
                  onClick={onRemove}
                >
                  <Trash2 size={15} aria-hidden />
                </IconButton>
              ) : null}
            </div>
          </>
        )}
      </div>

      {children ? (
        <details
          ref={detailsRef}
          className="admin-event-form__landing-details"
          open={locked || custom ? true : undefined}
        >
          <summary>
            <span>{t('admin.eventEditor.landingSectionContent')}</span>
            <ChevronDown size={14} aria-hidden />
          </summary>
          <div className="admin-event-form__landing-details-body">{children}</div>
        </details>
      ) : null}
    </li>
  )
}
