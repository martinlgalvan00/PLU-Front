import { useCallback, useMemo, useRef } from 'react'
import { emptyEventLanding, normalizeEventLanding } from '../../../../lib/eventLanding.js'
import { patchDraftLanding, patchDraftLandingBlocks } from '../draftPatches.js'

function normalizedLanding(draft) {
  return normalizeEventLanding(draft.landing ?? emptyEventLanding('meet'), {
    publicCopy: draft.publicCopy,
    slug: draft.slug,
  })
}

/**
 * Estado de la landing dentro del borrador del evento: la landing normalizada y
 * los cambios que el editor le hace. La lógica de los parches vive en
 * `draftPatches.js` (funciones puras); esto solo la une con `patchDraft`.
 *
 * Los parches leen el borrador de ahora (`draftRef`), no el del render que creó
 * el callback: una subida de imagen que termina después, o un "Deshacer", no
 * pisa lo que se editó mientras tanto.
 *
 * @param {object} draft borrador del evento
 * @param {(next: object) => void} patchDraft
 */
export default function useLandingDraft(draft, patchDraft) {
  const { landing: rawLanding, publicCopy, slug } = draft
  const landing = useMemo(
    () => normalizedLanding({ landing: rawLanding, publicCopy, slug }),
    [rawLanding, publicCopy, slug],
  )
  const draftRef = useRef(draft)
  draftRef.current = draft

  const patchLanding = useCallback(
    (nextLanding) => patchDraft(patchDraftLanding(draftRef.current, nextLanding)),
    [patchDraft],
  )

  const patchCurrentLanding = useCallback(
    (update) => {
      const current = normalizedLanding(draftRef.current)
      patchDraft(patchDraftLanding(draftRef.current, update(current)))
    },
    [patchDraft],
  )

  const patchSlot = useCallback(
    (key, value) =>
      patchCurrentLanding((current) => ({ ...current, slots: { ...current.slots, [key]: value } })),
    [patchCurrentLanding],
  )

  const patchPalette = useCallback(
    (palette) =>
      patchCurrentLanding((current) => ({
        ...current,
        layout: { ...(current.layout ?? { blocks: [] }), palette },
      })),
    [patchCurrentLanding],
  )

  const patchMotion = useCallback(
    (motion) =>
      patchCurrentLanding((current) => ({
        ...current,
        layout: { ...(current.layout ?? { blocks: [] }), motion },
      })),
    [patchCurrentLanding],
  )

  const applyBlocks = useCallback(
    (blocks, surfaceChange = null) => {
      const current = draftRef.current
      patchDraft(patchDraftLandingBlocks(current, normalizedLanding(current), blocks, surfaceChange))
    },
    [patchDraft],
  )

  /** Los bloques de ahora, para cambios que se aplican después de un `await`. */
  const currentBlocks = useCallback(
    () => normalizedLanding(draftRef.current).layout?.blocks ?? [],
    [],
  )

  return { landing, patchLanding, patchSlot, patchPalette, patchMotion, applyBlocks, currentBlocks }
}
