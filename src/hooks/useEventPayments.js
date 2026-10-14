import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEventPayments } from '../services/eventPaymentsService.js'

const EMPTY = Object.freeze({
  payments: [],
  athletes: [],
  pendingTicketOrders: [],
  summary: null,
})

/**
 * Cobros del evento abierto, solo para cuentas por evento. Con `enabled` en false no
 * pide nada. Se relee al abrir otro evento y a pedido (`reload`), que es lo que el
 * triage llama después de aprobar o rechazar una orden.
 */
export default function useEventPayments(eventSlug, { enabled = false } = {}) {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const requestRef = useRef(0)

  const reload = useCallback(async () => {
    if (!enabled || !eventSlug) return
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const next = await fetchEventPayments(eventSlug)
      // Una respuesta vieja (otro evento, o una lectura anterior) no pisa la actual.
      if (request === requestRef.current) setData(next)
    } catch (loadError) {
      if (request === requestRef.current) {
        setError(loadError?.message ?? 'No se pudieron cargar los cobros del evento.')
      }
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [enabled, eventSlug])

  useEffect(() => {
    if (!enabled || !eventSlug) {
      requestRef.current += 1
      setData(EMPTY)
      setError(null)
      setLoading(false)
      return undefined
    }
    void reload()
    return () => {
      requestRef.current += 1
    }
  }, [enabled, eventSlug, reload])

  return { ...data, loading, error, reload }
}
