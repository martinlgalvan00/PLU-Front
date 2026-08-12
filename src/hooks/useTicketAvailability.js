import { useEffect, useState } from 'react'
import { ticketAvailabilityStore } from '../services/eventLiveStore.js'
import { summarizeAvailability } from '../lib/ticketAvailability.js'

/**
 * `null` mientras no hay dato (evento sin slug, fetch en curso, o el
 * evento no tiene reglas de cupo cargadas) — la UI que consume esto debe
 * tratar `null` como "no mostrar nada", nunca como "agotado".
 *
 * El dato viene de `ticketAvailabilityStore`: la lista de Shop, su drawer y
 * la página de entradas piden el mismo slug y comparten un solo request, y
 * una compra invalida la clave para que el remaining no quede viejo.
 */
export function useTicketAvailability(eventSlug) {
  const [remaining, setRemaining] = useState(() =>
    summarizeAvailability(ticketAvailabilityStore.read(eventSlug)?.data),
  )

  useEffect(() => {
    if (!eventSlug) {
      setRemaining(null)
      return undefined
    }

    const apply = (snapshot) => {
      if (!snapshot.data) return
      setRemaining(summarizeAvailability(snapshot.data))
    }

    const unsubscribe = ticketAvailabilityStore.subscribe(eventSlug, apply)
    const current = ticketAvailabilityStore.read(eventSlug)
    // Al cambiar de evento el remaining del anterior no aplica: se limpia y
    // se repinta con el del nuevo slug (cacheado o recién pedido).
    setRemaining(summarizeAvailability(current?.data))
    if (current) apply(current)
    // Sin backend disponible u otro error: no bloquea la compra, solo no
    // mostramos el aviso de cupo.
    ticketAvailabilityStore.load(eventSlug).catch(() => {})

    return unsubscribe
  }, [eventSlug])

  return remaining
}
