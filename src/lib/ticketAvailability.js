/**
 * Reduce la respuesta de /api/tickets/availability/:eventSlug (cupo evento
 * + por tipo de entrada) a un solo número: el remaining más ajustado de
 * todos los scopes con límite configurado. Ese es el que realmente frena
 * una compra, así que es el único que vale la pena mostrarle al público
 * antes de que llene el formulario. `null` = sin límites configurados (no
 * hay nada que avisar, no es "ilimitado" en un sentido que valga mostrar).
 */
export function summarizeAvailability(availability) {
  if (!availability) return null
  let tightest = null
  const entries = [availability.event, ...(availability.ticketTypes ?? [])]
  for (const entry of entries) {
    if (!entry || entry.limit == null || entry.remaining == null) continue
    if (tightest === null || entry.remaining < tightest) tightest = entry.remaining
  }
  return tightest
}

/** Remaining para un tipo de entrada puntual, o null si no tiene cupo propio. */
export function remainingForTicketType(availability, ticketTypeId) {
  const entry = availability?.ticketTypes?.find((item) => item.ticketTypeId === ticketTypeId)
  return entry?.limit == null ? null : entry.remaining
}

export const LOW_AVAILABILITY_THRESHOLD = 10
