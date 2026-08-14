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
const selectRemaining = (data) => summarizeAvailability(data?.availability)

export function useTicketAvailability(eventSlug) {
  return useAvailabilitySlice(eventSlug, selectRemaining, null)
}

/**
 * Interruptores de compra de entradas del panel (venta y canal manual). Comparte
 * el request con `useTicketAvailability` a través del mismo store, así que la
 * pantalla no pide dos veces lo mismo.
 *
 * Default abierto: si el dato todavía no llegó o el API falló, la pantalla se
 * arma completa y el 409 del backend sigue siendo la última palabra. Cerrar por
 * falta de dato dejaría la venta caída por un problema de red.
 */
const CHECKOUT_OPEN = { ticketEnabled: true, ticketManualEnabled: true }
const selectCheckout = (data) => data?.checkout ?? CHECKOUT_OPEN

export function useTicketCheckoutAvailability(eventSlug) {
  return useAvailabilitySlice(eventSlug, selectCheckout, CHECKOUT_OPEN)
}

function useAvailabilitySlice(eventSlug, select, fallback) {
  const [value, setValue] = useState(() => select(ticketAvailabilityStore.read(eventSlug)?.data))

  useEffect(() => {
    if (!eventSlug) {
      setValue(fallback)
      return undefined
    }

    const apply = (snapshot) => {
      if (!snapshot.data) return
      setValue(select(snapshot.data))
    }

    const unsubscribe = ticketAvailabilityStore.subscribe(eventSlug, apply)
    const current = ticketAvailabilityStore.read(eventSlug)
    // Al cambiar de evento el dato del anterior no aplica: se limpia y se
    // repinta con el del nuevo slug (cacheado o recién pedido).
    setValue(select(current?.data))
    if (current) apply(current)
    // Sin backend disponible u otro error: no bloquea la compra, solo no
    // mostramos el aviso de cupo.
    ticketAvailabilityStore.load(eventSlug).catch(() => {})

    return unsubscribe
  }, [eventSlug, fallback, select])

  return value
}
