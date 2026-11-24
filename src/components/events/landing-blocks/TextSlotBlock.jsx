import BlockShell from './BlockShell.jsx'

/**
 * Experiencia y Categorías: título y texto salen de `landing.slots`. Sin texto
 * cargado el bloque no existe (no se inventa copy).
 */
export default function TextSlotBlock({ block, ctx }) {
  const { landing } = ctx
  const prefix = block.type === 'experience' ? 'experience' : 'categories'
  const title = landing.slots[`${prefix}Title`]
  const body = landing.slots[`${prefix}Body`]
  if (!title && !body) return null
  return (
    <BlockShell id={block.id} type={block.type} title={title || undefined}>
      {body ? <p className="lb-prose">{body}</p> : null}
    </BlockShell>
  )
}
