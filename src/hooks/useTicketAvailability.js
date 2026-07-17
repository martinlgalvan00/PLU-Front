import { useEffect, useState } from 'react'
import { fetchTicketAvailability } from '../services/ticketApi.js'
import { summarizeAvailability } from '../lib/ticketAvailability.js'

/**
 * `null` mientras no hay dato (evento sin slug, fetch en curso, o el
 * evento no tiene reglas de cupo cargadas) — la UI que consume esto debe
 * tratar `null` como "no mostrar nada", nunca como "agotado".
 */
export function useTicketAvailability(eventSlug) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    setRemaining(null)
    if (!eventSlug) return

    let active = true
    fetchTicketAvailability(eventSlug)
      .then((availability) => {
        if (active) setRemaining(summarizeAvailability(availability))
      })
      .catch(() => {
        // Sin backend disponible u otro error: no bloquea la compra, solo
        // no mostramos el aviso de cupo.
      })
    return () => {
      active = false
    }
  }, [eventSlug])

  return remaining
}
