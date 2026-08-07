import { useCallback, useEffect, useState } from 'react'
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

  return {
    schedule,
    status,
    assigning,
    assign,
    saveSessions,
    days: schedule?.days ?? [],
    sessions: schedule?.sessions ?? [],
    unassignedCount: schedule?.unassignedCount ?? 0,
  }
}
