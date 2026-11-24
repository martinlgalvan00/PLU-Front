import EventPublicMaterials from '../../ui/EventPublicMaterials.jsx'
import BlockShell from './BlockShell.jsx'

/** Formulario externo e inscriptos recientes. La grilla tiene su propio bloque. */
export default function MaterialsBlock({ block, ctx }) {
  return (
    <BlockShell id={block.id} type="materials">
      <EventPublicMaterials event={ctx.event} includeSchedule={false} />
    </BlockShell>
  )
}
