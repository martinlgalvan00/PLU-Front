/**
 * Alta guiada en tres pasos, en el orden en que se piensa un meet: qué es
 * (Evento), cómo se vende (Venta) y cómo se ve (Página). Cada paso valida lo
 * suyo antes de avanzar; al terminar, la pantalla "Listo" dice con la misma
 * regla que el panel si ya se puede vender y qué falta.
 */
export const QUICK_CREATE_STEPS = Object.freeze(['event', 'sales', 'page'])

/** En qué paso vive un campo, para llevar ahí al primer error. */
export function quickCreateStepForField(key = '') {
  if (['title', 'startsAt', 'endsAt', 'venue', 'location', 'slots'].includes(key)) return 'event'
  if (
    key.startsWith('pricing') ||
    key.startsWith('registration') ||
    key === 'ticketCapacity' ||
    key.startsWith('paymentChannel') ||
    key.startsWith('bankTransfer') ||
    key.startsWith('cashPayment')
  ) {
    return 'sales'
  }
  return 'page'
}
