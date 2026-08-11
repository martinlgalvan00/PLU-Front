import { useCallback, useEffect, useState } from 'react'
import {
  assignRegistrationSchedule,
  autofillEventDay,
  fetchEventBoard,
  saveEventSessions,
} from '../services/eventRegistrationApi.js'

/**
 * useEventBoard — PLU ARG
 *
 * Estado del tablero de armado de grilla: días, tandas con su roster y la
 * bolsa de inscriptos sin ubicar.
 *
 * Toda escritura devuelve el tablero recalculado por el backend y se pisa el
 * local con ese. No hay actualización optimista a propósito: dos personas de
 * la organización repartiendo al mismo tiempo es un escenario real, y mover
 * una fila de lugar en el cliente sin confirmar dejaría dos tableros
 * distintos abiertos sobre el mismo torneo.
 */
export function useEventBoard(eventSlug, { enabled = true } = {}) {
  const [board, setBoard] = useState(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!eventSlug) {
      setBoard(null)
      setStatus('idle')
      return
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    try {
      setBoard(await fetchEventBoard(eventSlug))
      setStatus('ready')
      setError(null)
    } catch (loadError) {
      setStatus('error')
      setError(loadError?.message ?? null)
    }
  }, [eventSlug])

  useEffect(() => {
    if (!enabled) {
      setBoard(null)
      setStatus('idle')
      return undefined
    }
    let active = true
    void (async () => {
      await load()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [enabled, load])

  /** Mueve un lote a un día/tanda. Con ambos en null vuelven a "sin ubicar". */
  const assign = useCallback(
    async ({ registrationIds, dayIndex = null, sessionId = null }) => {
      if (!eventSlug || registrationIds.length === 0) return null
      setBusy(true)
      setError(null)
      try {
        const result = await assignRegistrationSchedule(eventSlug, {
          registrationIds,
          dayIndex,
          sessionId,
        })
        // La asignación devuelve el resumen de cupos, no el tablero: se relee
        // para traer los rosters actualizados.
        await load()
        return result
      } catch (assignError) {
        setError(assignError?.message ?? 'No se pudo asignar.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [eventSlug, load],
  )

  /**
   * Edición inline de tandas desde el board. El RPC reemplaza el set completo
   * (lo que no viene en el payload se borra), así que el caller tiene que
   * mandar TODAS las tandas de todos los días, no solo la editada.
   */
  const saveSessions = useCallback(
    async (sessions) => {
      if (!eventSlug) return false
      setBusy(true)
      setError(null)
      try {
        await saveEventSessions(eventSlug, sessions)
        await load()
        return true
      } catch (saveError) {
        setError(saveError?.message ?? 'No se pudieron guardar las tandas.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [eventSlug, load],
  )

  const autofill = useCallback(
    async ({ dayIndex, maxPerSession }) => {
      if (!eventSlug) return null
      setBusy(true)
      setError(null)
      try {
        const result = await autofillEventDay(eventSlug, { dayIndex, maxPerSession })
        setBoard(result.board)
        setStatus('ready')
        return result
      } catch (autofillError) {
        setError(autofillError?.message ?? 'No se pudo repartir.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [eventSlug],
  )

  return {
    board,
    status,
    busy,
    error,
    reload: load,
    assign,
    saveSessions,
    autofill,
    days: board?.days ?? [],
    unassigned: board?.unassigned ?? [],
    totals: board?.totals ?? { registered: 0, assigned: 0, unassigned: 0 },
  }
}
