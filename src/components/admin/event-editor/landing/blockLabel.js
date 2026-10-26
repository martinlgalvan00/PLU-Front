import { isCoreBlockType } from '../../../../lib/eventLandingLayout.js'

/** "Portada", "Texto 2": los bloques propios llevan su número para distinguirlos. */
export function landingBlockLabel(block, t) {
  const name = t(`admin.eventEditor.landingBlockType_${block.type}`)
  return isCoreBlockType(block.type) ? name : `${name} ${block.id.split('-').at(-1)}`
}
