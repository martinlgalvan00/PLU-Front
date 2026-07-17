/**
 * Reduce la respuesta de /api/tickets/availability/:eventSlug (cupo evento
 * + por día) a un solo número: el remaining más ajustado de todos los
 * scopes con límite configurado. Ese es el que realmente frena una compra,
 * así que es el único que vale la pena mostrarle al público antes de que
 * llene el formulario. `null` = sin límites configurados (no hay nada que
 * avisar, no es "ilimitado" en un sentido que valga mostrar).
 */
export function summarizeAvailability(availability) {
  if (!availability) return null
  let tightest = null
  for (const scope of ['event', 'day1', 'day2', 'both']) {
    const entry = availability[scope]
    if (!entry || entry.limit == null || entry.remaining == null) continue
    if (tightest === null || entry.remaining < tightest) tightest = entry.remaining
  }
  return tightest
}

export const LOW_AVAILABILITY_THRESHOLD = 10
