import { validateTicketAttendees, validateTicketBuyer } from '../lib/validation.js'

/**
 * Pasos del checkout de entradas, en orden de lectura. El avance es derivado
 * de lo que ya está cargado y no bloquea nada: sirve para mostrar dónde está la
 * persona, nunca para impedirle completar el formulario en otro orden.
 */
export const TICKET_CHECKOUT_STEPS = ['tickets', 'buyer', 'payment']

/**
 * @param {{
 *   attendees: Array<{ fullName?: string, dni?: string, ticketTypeId?: string }>,
 *   buyer: { name?: string, email?: string, phone?: string },
 *   paymentMethod?: string,
 *   ticketTypeIds?: string[],
 * }} input
 * @returns {{ done: Record<'tickets' | 'buyer' | 'payment', boolean>, current: string, completed: number }}
 */
export function resolveTicketCheckoutProgress({
  attendees = [],
  buyer = {},
  paymentMethod = '',
  ticketTypeIds = [],
}) {
  const done = {
    tickets:
      attendees.length > 0 && validateTicketAttendees(attendees, null, ticketTypeIds).success,
    buyer: validateTicketBuyer(buyer, null).success,
    // El medio de pago arranca preseleccionado: sólo cuenta como paso hecho
    // cuando lo anterior ya está, para que el avance no se adelante solo.
    payment: false,
  }
  done.payment = done.tickets && done.buyer && Boolean(paymentMethod)

  const current = TICKET_CHECKOUT_STEPS.find((step) => !done[step]) ?? 'payment'
  const completed = TICKET_CHECKOUT_STEPS.filter((step) => done[step]).length
  return { done, current, completed }
}
