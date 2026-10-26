import { useCallback, useRef, useState } from 'react'

/** Cambios seguidos dentro de esta ventana (tipear un título) son un solo paso. */
const COALESCE_MS = 700
const MAX_STEPS = 60

/** Lo que la landing toca del borrador: la landing, el copy espejado y los módulos públicos. */
function snapshotOf(draft) {
  return {
    landing: draft.landing,
    publicCopy: draft.publicCopy,
    publicSurface: draft.publicSurface,
  }
}

/**
 * Deshacer / rehacer del editor visual. Envuelve `patchDraft`: antes de cada
 * cambio guarda cómo estaba la landing. Tipear varias letras seguidas es un
 * solo paso, no uno por tecla.
 *
 * Solo cubre lo que se edita en el editor visual; el resto del evento (fechas,
 * precios) no entra al historial ni se pisa al deshacer.
 *
 * @param {object} draft borrador del evento
 * @param {(next: object) => void} patchDraft
 */
export default function useLandingHistory(draft, patchDraft) {
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const lastPushRef = useRef(0)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const trackedPatch = useCallback(
    (next) => {
      const now = Date.now()
      if (now - lastPushRef.current > COALESCE_MS) {
        const before = snapshotOf(draftRef.current)
        setPast((steps) => [...steps, before].slice(-MAX_STEPS))
      }
      lastPushRef.current = now
      setFuture([])
      patchDraft(next)
    },
    [patchDraft],
  )

  const undo = useCallback(() => {
    if (past.length === 0) return
    const previous = past.at(-1)
    setPast((steps) => steps.slice(0, -1))
    setFuture((steps) => [snapshotOf(draftRef.current), ...steps])
    lastPushRef.current = 0
    patchDraft({ ...draftRef.current, ...previous })
  }, [past, patchDraft])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[0]
    setFuture((steps) => steps.slice(1))
    setPast((steps) => [...steps, snapshotOf(draftRef.current)])
    lastPushRef.current = 0
    patchDraft({ ...draftRef.current, ...next })
  }, [future, patchDraft])

  return {
    patchDraft: trackedPatch,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
