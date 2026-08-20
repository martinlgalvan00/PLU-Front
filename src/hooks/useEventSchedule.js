import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  assignRegistrationSchedule,
  fetchEventSchedule,
  saveEventSessions,
} from '../services/eventRegistrationApi.js'

/**
 * Grilla de competencia de un evento para el panel: días, tandas y cuántos
 * atletas hay en cada uno.
 *
 * El estado del server es la autoridad -- `assign` devuelve la grilla
 * recalculada y se pisa la local con esa, en vez de sumar y restar contadores
 * del lado del cliente: dos operadores repartiendo atletas al mismo tiempo
 * harían divergir cualquier conteo optimista.
 */
export function useEventSchedule(eventSlug, { enabled = true } = {}) {
  const [schedule, setSchedule] = useState(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    if (!enabled || !eventSlug) {
      setSchedule(null)
      setStatus('idle')
      return undefined
    }

    let active = true
    setStatus('loading')

    fetchEventSchedule(eventSlug)
      .then((next) => {
        if (!active) return
        setSchedule(next)
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        setSchedule(null)
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [enabled, eventSlug])

  const assign = useCallback(
    async ({ registrationIds, dayIndex = null, sessionId = null }) => {
      if (!eventSlug) return { updated: 0, requested: 0 }
      setAssigning(true)
      try {
        const result = await assignRegistrationSchedule(eventSlug, {
          registrationIds,
          dayIndex,
          sessionId,
        })
        setSchedule(result.schedule)
        setStatus('ready')
        return result
      } finally {
        setAssigning(false)
      }
    },
    [eventSlug],
  )

  const saveSessions = useCallback(
    async (sessions) => {
      if (!eventSlug) return null
      const next = await saveEventSessions(eventSlug, sessions)
      setSchedule(next)
      setStatus('ready')
      return next
    },
    [eventSlug],
  )

  // `days` y `sessions` van memoizadas porque son dependencias de efectos en
  // los consumidores. Devolver `?? []` crudo creaba un array nuevo en cada
  // render, y el editor de tandas -- que sincroniza su borrador con
  // `[dirty, sessions]` -- entraba en bucle infinito mientras la grilla no
  // hubiera cargado: setDraft con un array nuevo, re-render, dependencia
  // nueva, otra vez. Se veía como la pestaña colgada, no como un error.
  const days = useMemo(() => schedule?.days ?? [], [schedule])
  const sessions = useMemo(() => schedule?.sessions ?? [], [schedule])

  return {
    schedule,
    status,
    assigning,
    assign,
    saveSessions,
    days,
    sessions,
    unassignedCount: schedule?.unassignedCount ?? 0,
  }
}
