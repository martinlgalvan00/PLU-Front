import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, EyeOff, GripVertical, Trash2 } from 'lucide-react'
import {
  CORE_BLOCK_TYPES,
  isCoreBlockType,
  moveBlock,
  removeBlock,
  setBlockVisible,
} from '../../../../lib/eventLandingLayout.js'
import { dropDelta } from '../../../../lib/landingStudioLayout.js'
import { landingBlockLabel } from './blockLabel.js'

const BLOCK_SELECTOR = '[id^="bloque-"]'

function blockIdOf(node) {
  return node.id.slice('bloque-'.length)
}

/** Posición de un nodo dentro del documento del iframe (no del viewport). */
function documentRect(node) {
  const rect = node.getBoundingClientRect()
  const view = node.ownerDocument.defaultView
  return {
    top: rect.top + (view?.scrollY ?? 0),
    bottom: rect.bottom + (view?.scrollY ?? 0),
    left: rect.left + (view?.scrollX ?? 0),
    right: rect.right + (view?.scrollX ?? 0),
  }
}

/**
 * Editar sobre la página: sobre el bloque elegido en la vista previa, una barra
 * con la manija para arrastrarlo y los botones para subir, bajar, ocultar y
 * quitar. Se dibuja DENTRO del iframe (el documento de la vista previa), así
 * que queda pegada al bloque al scrollear. Con la escala del escenario se
 * compensa el tamaño para que los botones no queden diminutos.
 *
 * Arrastrar usa la misma cuenta que la lista del panel (`dropDelta` +
 * `moveBlock`): la portada queda siempre primera.
 */
export default function PreviewBlockToolbar({ doc, blocks, selectedId, scale = 1, t, onChange }) {
  const [rect, setRect] = useState(null)
  const [drop, setDrop] = useState(null)
  const dragRef = useRef(null)
  const block = blocks.find((item) => item.id === selectedId) ?? null

  const measure = useCallback(() => {
    const node = doc?.getElementById(`bloque-${selectedId}`)
    setRect(node ? documentRect(node) : null)
  }, [doc, selectedId])

  useLayoutEffect(() => {
    measure()
  }, [measure, blocks])

  useEffect(() => {
    const view = doc?.defaultView
    if (!view) return undefined
    view.addEventListener('resize', measure)
    const observer =
      typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(measure) : null
    observer?.observe(doc.body)
    // La vista previa se redibuja con prioridad baja (useDeferredValue): al
    // mover un bloque, el DOM cambia después de este render. Se vuelve a medir
    // cuando la página cambia de verdad.
    const mutations =
      typeof view.MutationObserver === 'function' ? new view.MutationObserver(measure) : null
    mutations?.observe(doc.body, { childList: true, subtree: true })
    return () => {
      view.removeEventListener('resize', measure)
      observer?.disconnect()
      mutations?.disconnect()
    }
  }, [doc, measure])

  if (!doc || !block || !rect || block.type === 'hero') return null

  const name = landingBlockLabel(block, t)
  const locked = isCoreBlockType(block.type) && CORE_BLOCK_TYPES[block.type].locked
  // Subir y bajar se cuentan sobre lo que se ve: saltar un bloque oculto no
  // cambiaría nada en la página.
  const shown = blocks.filter((item) => item.visible !== false)
  const shownIndex = shown.findIndex((item) => item.id === block.id)
  const previous = shownIndex > 1 ? shown[shownIndex - 1] : null
  const next = shownIndex > 0 && shownIndex < shown.length - 1 ? shown[shownIndex + 1] : null

  function moveNextTo(target, after) {
    const delta = dropDelta(blocks, block.id, target.id, after)
    if (delta !== 0) onChange(moveBlock(blocks, block.id, delta))
  }

  function hide() {
    const surfaceKey = isCoreBlockType(block.type) ? CORE_BLOCK_TYPES[block.type].surfaceKey : null
    onChange(
      setBlockVisible(blocks, block.id, false),
      surfaceKey ? { key: surfaceKey, visible: false } : null,
    )
  }

  /** Dónde caería el bloque: antes o después del bloque más cercano al puntero. */
  function dropTargetAt(clientY) {
    const nodes = [...doc.querySelectorAll(BLOCK_SELECTOR)].filter((node) => {
      const id = blockIdOf(node)
      return id !== block.id && id !== 'hero' && blocks.some((item) => item.id === id)
    })
    if (nodes.length === 0) return null
    for (const node of nodes) {
      const box = node.getBoundingClientRect()
      if (clientY < box.top + box.height / 2) {
        return { id: blockIdOf(node), after: false, top: documentRect(node).top }
      }
    }
    const last = nodes.at(-1)
    return { id: blockIdOf(last), after: true, top: documentRect(last).bottom }
  }

  function startDrag(pointerEvent) {
    pointerEvent.preventDefault()
    const view = doc.defaultView
    dragRef.current = null
    const move = (moveEvent) => {
      const target = dropTargetAt(moveEvent.clientY)
      dragRef.current = target
      setDrop(target)
    }
    const end = () => {
      view.removeEventListener('pointermove', move)
      view.removeEventListener('pointerup', end)
      view.removeEventListener('pointercancel', end)
      const target = dragRef.current
      dragRef.current = null
      setDrop(null)
      if (!target) return
      const delta = dropDelta(blocks, block.id, target.id, target.after)
      if (delta !== 0) onChange(moveBlock(blocks, block.id, delta))
    }
    view.addEventListener('pointermove', move)
    view.addEventListener('pointerup', end)
    view.addEventListener('pointercancel', end)
  }

  return (
    <>
      <div
        className="studio-block-toolbar"
        role="toolbar"
        aria-label={t('admin.eventEditor.landingPreviewToolbar', { name })}
        style={{
          top: rect.top + 8,
          left: rect.right - 8,
          transform: `translateX(-100%) scale(${1 / scale})`,
        }}
      >
        <button
          type="button"
          className="studio-block-toolbar__grip"
          aria-label={t('admin.eventEditor.landingPreviewDrag', { name })}
          title={t('admin.eventEditor.landingPreviewDrag', { name })}
          onPointerDown={startDrag}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t('admin.eventEditor.landingBlockMoveUp', { name })}
          title={t('admin.eventEditor.landingBlockMoveUp', { name })}
          disabled={!previous}
          onClick={() => moveNextTo(previous, false)}
        >
          <ArrowUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t('admin.eventEditor.landingBlockMoveDown', { name })}
          title={t('admin.eventEditor.landingBlockMoveDown', { name })}
          disabled={!next}
          onClick={() => moveNextTo(next, true)}
        >
          <ArrowDown size={16} aria-hidden />
        </button>
        {locked ? null : (
          <button
            type="button"
            aria-label={t('admin.eventEditor.landingPreviewHide', { name })}
            title={t('admin.eventEditor.landingPreviewHide', { name })}
            onClick={hide}
          >
            <EyeOff size={16} aria-hidden />
          </button>
        )}
        {isCoreBlockType(block.type) ? null : (
          <button
            type="button"
            aria-label={t('admin.eventEditor.landingBlockRemove', { name })}
            title={t('admin.eventEditor.landingBlockRemove', { name })}
            onClick={() => onChange(removeBlock(blocks, block.id))}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        )}
      </div>
      {drop ? (
        <div className="studio-block-drop" style={{ top: drop.top - 2 }} aria-hidden />
      ) : null}
    </>
  )
}
