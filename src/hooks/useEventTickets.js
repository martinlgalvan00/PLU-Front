import { useEffect, useRef, useState } from 'react'
import { listTicketsForEvent } from '../services/ticketApi.js'

const NONE = Object.freeze([])

/**
 * Entradas emitidas de UN evento, para el Resumen de un organizador. El resto del staff
 * usa el snapshot global de entradas; un organizador no puede leerlo (trae todos los
 * eventos), así que pide solo las de su evento. Con `enabled` en false no pide nada.
 */
export default function useEventTickets(eventSlug, { enabled = false } = {}) {
  const [tickets, setTickets] = useState(NONE)
  const requestRef = useRef(0)

  useEffect(() => {
    const request = ++requestRef.current
    if (!enabled || !eventSlug) {
      setTickets(NONE)
      return undefined
    }
    listTicketsForEvent(eventSlug)
      .then((result) => {
        // Una respuesta vieja (otro evento) no pisa la actual.
        if (request === requestRef.current) setTickets(result.tickets)
      })
      .catch(() => {
        if (request === requestRef.current) setTickets(NONE)
      })
    return () => {
      requestRef.current += 1
    }
  }, [enabled, eventSlug])

  return tickets
}
