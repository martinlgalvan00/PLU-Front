import { useCallback, useEffect, useState } from 'react'
import {
  batchesFromLocations,
  locationIndex,
  nextSessionName,
  resolvePlacementBatches,
  sessionsPayloadFromBoard,
} from '../services/eventBoardPlanner.js'
import {
  assignRegistrationSchedule,
  autofillEventDay,
  fetchEventBoard,
  saveEventPlatforms,
  saveEventSessions,
  setEventSchedulePublic,
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
  const [loadedAt, setLoadedAt] = useState(null)

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

  // Cuándo se trajo el tablero que se está mostrando: la vista previa lo dice.
  useEffect(() => {
    setLoadedAt(board ? Date.now() : null)
  }, [board])

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
   * Reparto sugerido de un día. Solo ubica a los que todavía no tienen día:
   * nunca mueve a alguien que la organización ya puso a mano. El botón del
   * board llama esto; `applyPlan` es el preview de varias tandas nuevas.
   */
  const autofill = useCallback(
    async ({ dayIndex, maxPerSession }) => {
      if (!eventSlug) return null
      setBusy(true)
      setError(null)
      try {
        const result = await autofillEventDay(eventSlug, { dayIndex, maxPerSession })
        if (result?.board) {
          setBoard(result.board)
          setStatus('ready')
        } else {
          await load()
        }
        return result
      } catch (autofillError) {
        setError(autofillError?.message ?? 'No se pudo repartir.')
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

  /**
   * Define cuántos tablados tiene el evento y cómo se llaman. Manda el set
   * completo: lo que falta se quita y sus tandas quedan "sin tablado".
   */
  const savePlatforms = useCallback(
    async (platforms) => {
      if (!eventSlug) return false
      setBusy(true)
      setError(null)
      try {
        await saveEventPlatforms(eventSlug, platforms)
        await load()
        return true
      } catch (saveError) {
        setError(saveError?.message ?? 'No se pudieron guardar los tablados.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [eventSlug, load],
  )

  /**
   * Publica o retira la grilla del sitio oficial. Se relee el tablero: el
   * estado que manda es el del servidor, no el del interruptor.
   */
  const setSchedulePublic = useCallback(
    async (isPublic) => {
      if (!eventSlug) return false
      setBusy(true)
      setError(null)
      try {
        await setEventSchedulePublic(eventSlug, isPublic)
        await load()
        return true
      } catch (publishError) {
        setError(publishError?.message ?? 'No se pudo cambiar la visibilidad de la grilla.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [eventSlug, load],
  )

  /**
   * Alta de una tanda desde el tablero, en un día y (si hay) un tablado. El
   * nombre sale de la siguiente letra libre. Devuelve el nombre creado.
   */
  const addSession = useCallback(
    async ({ dayIndex, platformId = null }) => {
      if (!eventSlug) return null
      const days = board?.days ?? []
      const name = nextSessionName(
        days.flatMap((day) => (day.sessions ?? []).map((session) => session.name)),
      )
      const platform = (board?.platforms ?? []).find((item) => item.id === platformId)
      setBusy(true)
      setError(null)
      try {
        await saveEventSessions(
          eventSlug,
          sessionsPayloadFromBoard(days, {
            extra: [{ dayIndex, name, platform: platform?.name ?? '', platformId }],
          }),
        )
        await load()
        return name
      } catch (saveError) {
        setError(saveError?.message ?? 'No se pudo crear la tanda.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [board?.days, board?.platforms, eventSlug, load],
  )

  /** Quita una tanda. El RPC la rechaza si todavía tiene atletas asignados. */
  const removeSession = useCallback(
    async (sessionId) => {
      if (!eventSlug) return false
      setBusy(true)
      setError(null)
      try {
        await saveEventSessions(
          eventSlug,
          sessionsPayloadFromBoard(board?.days ?? [], { omitIds: [sessionId] }),
        )
        await load()
        return true
      } catch (saveError) {
        setError(saveError?.message ?? 'No se pudo quitar la tanda.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [board?.days, eventSlug, load],
  )

  /**
   * Aplica un plan: asegura los tablados, crea las tandas nuevas (set completo)
   * y asigna por lote. Un solo ciclo de busy; el tablero se relee al final.
   *
   * Parte siempre de un tablero recién leído y no del estado local: dos
   * operadores pueden estar armando a la vez, y los ids de tandas y tablados
   * nuevos solo existen después de persistirlos.
   *
   * Devuelve la foto previa de cada atleta movido y los nombres de las tandas
   * creadas: es todo lo que `restore` necesita para deshacer.
   */
  const applyPlan = useCallback(
    async (plan, { platformDraft = null } = {}) => {
      if (!eventSlug || !plan) return null
      setBusy(true)
      setError(null)
      try {
        let latest = await fetchEventBoard(eventSlug)

        if (platformDraft && platformsDiffer(latest.platforms, platformDraft)) {
          await saveEventPlatforms(eventSlug, platformDraft)
          latest = await fetchEventBoard(eventSlug)
        }

        const newSessions = plan.newSessions.map((session) => ({
          ...session,
          platformId: resolvePlatformId(session, latest.platforms),
        }))
        const index = locationIndex(latest)
        const previous = plan.placements.map((placement) => [
          placement.registrationId,
          index.get(placement.registrationId) ?? { dayIndex: null, sessionId: null },
        ])

        if (newSessions.length > 0) {
          await saveEventSessions(
            eventSlug,
            sessionsPayloadFromBoard(latest.days, { extra: newSessions }),
          )
          latest = await fetchEventBoard(eventSlug)
        }

        const { batches, unresolved } = resolvePlacementBatches(latest, plan)
        let updated = 0
        let requested = 0
        for (const batch of batches) {
          const result = await assignRegistrationSchedule(eventSlug, {
            registrationIds: batch.registrationIds,
            dayIndex: batch.dayIndex,
            sessionId: batch.sessionId,
          })
          updated += result.updated
          requested += result.requested
        }

        setBoard(await fetchEventBoard(eventSlug))
        setStatus('ready')
        return {
          updated,
          requested: requested + unresolved.length,
          leftover: plan.leftover.length + unresolved.length,
          undo: { previous, removeSessionNames: newSessions.map((session) => session.name) },
        }
      } catch (applyError) {
        setError(applyError?.message ?? 'No se pudo aplicar el reparto.')
        try {
          setBoard(await fetchEventBoard(eventSlug))
          setStatus('ready')
        } catch {
          setStatus('error')
        }
        return null
      } finally {
        setBusy(false)
      }
    },
    [eventSlug],
  )

  /**
   * Deshace un reparto: devuelve a cada atleta a donde estaba y quita las tandas
   * que ese reparto creó -- solo las que quedaron vacías, así no se pierde lo que
   * otro operador haya movido ahí mientras tanto. Los tablados no se revierten.
   */
  const restore = useCallback(
    async ({ previous, removeSessionNames = [] }) => {
      if (!eventSlug || !previous?.length) return null
      setBusy(true)
      setError(null)
      try {
        let restored = 0
        for (const batch of batchesFromLocations(previous)) {
          const result = await assignRegistrationSchedule(eventSlug, batch)
          restored += result.updated
        }

        let removed = 0
        if (removeSessionNames.length > 0) {
          const latest = await fetchEventBoard(eventSlug)
          const names = new Set(removeSessionNames)
          const omitIds = latest.days.flatMap((day) =>
            day.sessions
              .filter((session) => names.has(session.name) && session.athletes.length === 0)
              .map((session) => session.id),
          )
          if (omitIds.length > 0) {
            await saveEventSessions(eventSlug, sessionsPayloadFromBoard(latest.days, { omitIds }))
            removed = omitIds.length
          }
        }

        await load()
        return { restored, removed }
      } catch (restoreError) {
        setError(restoreError?.message ?? 'No se pudo deshacer.')
        await load()
        return null
      } finally {
        setBusy(false)
      }
    },
    [eventSlug, load],
  )

  /** Quita las tandas sin atletas (por ejemplo, las que sobran después de rehacer la grilla). */
  const pruneEmptySessions = useCallback(async () => {
    if (!eventSlug) return null
    setBusy(true)
    setError(null)
    try {
      const latest = await fetchEventBoard(eventSlug)
      const omitIds = latest.days.flatMap((day) =>
        day.sessions.filter((session) => session.athletes.length === 0).map((session) => session.id),
      )
      if (omitIds.length > 0) {
        await saveEventSessions(eventSlug, sessionsPayloadFromBoard(latest.days, { omitIds }))
      }
      await load()
      return omitIds.length
    } catch (pruneError) {
      setError(pruneError?.message ?? 'No se pudieron quitar las tandas vacías.')
      return null
    } finally {
      setBusy(false)
    }
  }, [eventSlug, load])

  return {
    board,
    status,
    busy,
    error,
    reload: load,
    loadedAt,
    assign,
    autofill,
    saveSessions,
    savePlatforms,
    setSchedulePublic,
    addSession,
    removeSession,
    applyPlan,
    restore,
    pruneEmptySessions,
    platforms: board?.platforms ?? [],
    schedulePublic: board?.schedulePublic ?? false,
    days: board?.days ?? [],
    unassigned: board?.unassigned ?? [],
    totals: board?.totals ?? { registered: 0, assigned: 0, unassigned: 0 },
  }
}

/** ¿El borrador de tablados (con o sin id) es distinto de los que ya existen? */
function platformsDiffer(existing, draft) {
  if (existing.length !== draft.length) return true
  return draft.some(
    (entry, index) =>
      (entry.id && entry.id !== existing[index].id) || entry.name !== existing[index].name,
  )
}

/**
 * Id real del tablado de una tanda del plan. El asistente puede proponer tablados
 * que todavía no existen (`tmp:`): se resuelven por nombre una vez creados.
 */
function resolvePlatformId(session, platforms) {
  if (session.platformId && platforms.some((platform) => platform.id === session.platformId)) {
    return session.platformId
  }
  const name = String(session.platform ?? '').trim().toLowerCase()
  return platforms.find((platform) => platform.name.toLowerCase() === name)?.id ?? null
}
