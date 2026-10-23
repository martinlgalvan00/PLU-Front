/**
 * Qué acciones ofrece hoy la página pública de un evento. Una sola fuente de la
 * regla para la ficha del calendario (`EventsPage`) y la landing Constructor:
 * dos copias podían decir "Inscribirme" y "Inscripción cerrada" a la vez.
 */

import { env } from '../config/env.js'
import { resolveRegistrationSale } from '../../shared/registrationSaleState.js'
import { eventStatusClosesTicketSales, resolveEventPricing } from './eventPricing.js'

/**
 * ¿Se puede abrir el checkout de inscripción? La misma regla que el control de
 * venta del panel (`resolveRegistrationSale`): estado abierto, ventana de
 * fechas vigente, con cupo, sin "Solo anuncio" e inscripciones habilitadas en
 * la plataforma.
 *
 * Antes la ventana no se miraba (el gate de cobro siempre daba abierto para
 * inscripciones) y el sitio ofrecía "Inscribirme" en un evento que el servidor
 * iba a rechazar al pagar.
 *
 * Acepta el evento tal como lo dejó `withPublicEventStatus`: si el estado
 * público ya se corrigió por la ventana, el guardado viaja en `storedStatus`.
 *
 * @param {object} event
 * @param {{ registrationEnabled?: boolean, now?: Date }} [options]
 */
export function isEventRegistrationOpen(event, { registrationEnabled = true, now = new Date() } = {}) {
  if (!registrationEnabled || !event) return false
  const sale = resolveRegistrationSale(
    {
      ...event,
      status: event.storedStatus ?? event.status,
      // El sitio solo recibe eventos publicados; sin el dato no se inventa un bloqueo.
      published: event.published !== false,
    },
    { now },
  )
  return sale.canSell
}

/**
 * ¿Se pueden comprar entradas? Venta habilitada en la plataforma, evento no
 * finalizado y entradas activas en su precio.
 *
 * @param {object} event
 * @param {{ config?: object }} [options]
 */
export function canBuyEventTickets(event, { config = env } = {}) {
  return (
    config.ticketSalesEnabled === true &&
    Boolean(event) &&
    !eventStatusClosesTicketSales(event) &&
    resolveEventPricing(event).ticketsEnabled === true
  )
}
