import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  addCustomBlock,
  CORE_BLOCK_TYPES,
  CUSTOM_BLOCK_TYPES,
  imageUrlKey,
  isCoreBlockType,
  LANDING_BLOCK_LIMITS,
  moveBlock,
  nextCustomBlockId,
  patchBlockProps,
  removeBlock,
  setBlockVisible,
} from '../../../../lib/eventLandingLayout.js'
import { dropDelta } from '../../../../lib/landingStudioLayout.js'
import BlockRow from './BlockRow.jsx'
import CustomBlockFields from './CustomBlockFields.jsx'
import { SlotFields } from './SlotFields.jsx'

/** "Portada", "Texto 2": los bloques propios llevan su número para distinguirlos. */
function blockLabel(block, t) {
  const name = t(`admin.eventEditor.landingBlockType_${block.type}`)
  return isCoreBlockType(block.type) ? name : `${name} ${block.id.split('-').at(-1)}`
}

/**
 * Lista de bloques del Constructor: ordenar (arrastrando, con botones o con las
 * flechas sobre la manija), mostrar u ocultar, editar el contenido de cada uno y
 * agregar bloques propios. Los integrados no se borran, se ocultan: así siempre
 * se pueden recuperar.
 *
 * `onChangeBlocks(blocks, surfaceChange?)` recibe la lista nueva y, cuando el
 * bloque tiene un módulo público, el cambio de su switch para guardarlos juntos.
 *
 * En el editor visual llegan además `selectedId` / `onSelectBlock`: la fila
 * elegida se marca, y un bloque nuevo se inserta debajo de ella en vez de al
 * final, como en un editor de páginas.
 */
export default function BlocksEditor({
  t,
  canEdit,
  blocks,
  landing,
  err,
  patchSlot,
  onChangeBlocks,
  onImageUpload,
  imageUploading = false,
  hasSlug = true,
  heroSlot = null,
  /** Los bloques de ahora (ver `useLandingDraft`): la subida termina después. */
  getCurrentBlocks = null,
  selectedId = null,
  revealToken = 0,
  onSelectBlock = null,
}) {
  const atLimit = blocks.length >= LANDING_BLOCK_LIMITS.maxBlocks
  const [dragId, setDragId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  function addBlock(type) {
    const id = nextCustomBlockId(blocks, type)
    let next = addCustomBlock(blocks, type)
    const anchor = selectedId ? next.findIndex((block) => block.id === selectedId) : -1
    if (anchor !== -1) next = moveBlock(next, id, anchor + 1 - (next.length - 1))
    onChangeBlocks(next)
    onSelectBlock?.(id, 'add')
  }

  function dragFor(block) {
    return {
      dragging: dragId === block.id,
      dropBefore: dropTarget?.id === block.id && !dropTarget.after,
      dropAfter: dropTarget?.id === block.id && dropTarget.after,
      onDragStart(event) {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', block.id)
        setDragId(block.id)
      },
      onDragOver(event, row) {
        if (!dragId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const rect = row.getBoundingClientRect()
        // Nada se suelta antes de la portada: siempre va primera.
        const after = block.type === 'hero' || event.clientY > rect.top + rect.height / 2
        if (dropTarget?.id !== block.id || dropTarget.after !== after) {
          setDropTarget({ id: block.id, after })
        }
      },
      onDrop(event) {
        event.preventDefault()
        if (dragId && dropTarget) {
          const delta = dropDelta(blocks, dragId, dropTarget.id, dropTarget.after)
          if (delta) onChangeBlocks(moveBlock(blocks, dragId, delta))
        }
        setDragId(null)
        setDropTarget(null)
      },
      onDragEnd() {
        setDragId(null)
        setDropTarget(null)
      },
    }
  }

  function toggleVisible(block, visible) {
    const surfaceKey = isCoreBlockType(block.type) ? CORE_BLOCK_TYPES[block.type].surfaceKey : null
    onChangeBlocks(
      setBlockVisible(blocks, block.id, visible),
      surfaceKey ? { key: surfaceKey, visible } : null,
    )
  }

  async function uploadImage(block, file, pathKey = 'path') {
    const uploaded = await onImageUpload?.(file)
    if (uploaded?.path) {
      // Lo que se editó durante la subida (textos, orden, visibilidad) se conserva.
      const latest = getCurrentBlocks ? getCurrentBlocks() : blocks
      onChangeBlocks(
        patchBlockProps(latest, block.id, {
          [pathKey]: uploaded.path,
          [imageUrlKey(pathKey)]: uploaded.url ?? '',
        }),
      )
    }
  }

  function renderContent(block, index) {
    if (!isCoreBlockType(block.type)) {
      return (
        <CustomBlockFields
          block={block}
          blockIndex={index}
          canEdit={canEdit}
          hasSlug={hasSlug}
          imageUploading={imageUploading}
          t={t}
          onPatch={(patch) => onChangeBlocks(patchBlockProps(blocks, block.id, patch))}
          onUploadImage={(file, pathKey) => uploadImage(block, file, pathKey)}
        />
      )
    }
    const { fields } = CORE_BLOCK_TYPES[block.type]
    if (fields.length === 0 && block.type !== 'hero') return null
    return (
      <>
        <SlotFields
          canEdit={canEdit}
          err={err}
          keys={fields}
          landing={landing}
          patchSlot={patchSlot}
          t={t}
        />
        {block.type === 'hero' ? heroSlot : null}
      </>
    )
  }

  return (
    <fieldset className="admin-landing-blocks">
      <legend>{t('admin.eventEditor.landingBlocksLegend')}</legend>
      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingBlocksHint')}</p>

      <ol className="admin-landing-blocks__list">
        {blocks.map((block, index) => (
          <BlockRow
            key={block.id}
            block={block}
            canEdit={canEdit}
            canMoveDown={index < blocks.length - 1}
            // La portada siempre va primera: el primer bloque movible no puede subir.
            canMoveUp={index > 1}
            custom={!isCoreBlockType(block.type)}
            label={blockLabel(block, t)}
            locked={isCoreBlockType(block.type) && CORE_BLOCK_TYPES[block.type].locked}
            t={t}
            onMove={(delta) => onChangeBlocks(moveBlock(blocks, block.id, delta))}
            onRemove={() => onChangeBlocks(removeBlock(blocks, block.id))}
            onToggle={(visible) => toggleVisible(block, visible)}
            drag={canEdit ? dragFor(block) : null}
            selected={selectedId === block.id}
            reveal={selectedId === block.id ? revealToken : 0}
            onSelect={onSelectBlock ? () => onSelectBlock(block.id, 'panel') : undefined}
          >
            {renderContent(block, index)}
          </BlockRow>
        ))}
      </ol>

      <div
        className="admin-landing-blocks__add"
        role="group"
        aria-label={t('admin.eventEditor.landingBlockAdd')}
      >
        {Object.keys(CUSTOM_BLOCK_TYPES).map((type) => (
          <button
            key={type}
            type="button"
            className="admin-landing-blocks__add-btn"
            disabled={!canEdit || atLimit}
            onClick={() => addBlock(type)}
          >
            <Plus size={14} aria-hidden />
            {t(`admin.eventEditor.landingBlockAdd_${type}`)}
          </button>
        ))}
      </div>
      {atLimit ? (
        <p className="admin-event-form__section-note" role="status">
          {t('admin.eventEditor.landingBlockLimit', { max: LANDING_BLOCK_LIMITS.maxBlocks })}
        </p>
      ) : null}
    </fieldset>
  )
}
