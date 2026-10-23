import { useCallback, useMemo } from 'react'
import { emptyEventLanding, normalizeEventLanding } from '../../../../lib/eventLanding.js'
import { patchDraftLanding, patchDraftLandingBlocks } from '../draftPatches.js'

/**
 * Estado de la landing dentro del borrador del evento: la landing normalizada y
 * los cambios que el editor le hace. La lógica de los parches vive en
 * `draftPatches.js` (funciones puras); esto solo la une con `patchDraft`.
 *
 * @param {object} draft borrador del evento
 * @param {(next: object) => void} patchDraft
 */
export default function useLandingDraft(draft, patchDraft) {
  const { landing: rawLanding, publicCopy, slug } = draft
  const landing = useMemo(
    () => normalizeEventLanding(rawLanding ?? emptyEventLanding('meet'), { publicCopy, slug }),
    [rawLanding, publicCopy, slug],
  )

  const patchLanding = useCallback(
    (nextLanding) => patchDraft(patchDraftLanding(draft, nextLanding)),
    [draft, patchDraft],
  )

  const patchSlot = useCallback(
    (key, value) => patchLanding({ ...landing, slots: { ...landing.slots, [key]: value } }),
    [landing, patchLanding],
  )

  const patchPalette = useCallback(
    (palette) =>
      patchLanding({ ...landing, layout: { ...(landing.layout ?? { blocks: [] }), palette } }),
    [landing, patchLanding],
  )

  const patchMotion = useCallback(
    (motion) =>
      patchLanding({ ...landing, layout: { ...(landing.layout ?? { blocks: [] }), motion } }),
    [landing, patchLanding],
  )

  const applyBlocks = useCallback(
    (blocks, surfaceChange = null) =>
      patchDraft(patchDraftLandingBlocks(draft, landing, blocks, surfaceChange)),
    [draft, landing, patchDraft],
  )

  return { landing, patchLanding, patchSlot, patchPalette, patchMotion, applyBlocks }
}
