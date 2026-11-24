import { fireEvent } from '@testing-library/react'

/**
 * Recorrido del checkout de entradas en pasos (entradas → datos → pago).
 *
 * Cada paso reemplaza al anterior, así que un test que quiere mirar los medios
 * de pago tiene que llegar hasta ahí igual que una persona: con al menos una
 * entrada elegida y los datos completos. Los tests que usan esto mockean
 * `MotionContentSwap` para que el cambio de paso sea inmediato.
 */

export const input = (name) => document.querySelector(`input[name="${name}"]`)

export function submitStep() {
  fireEvent.submit(document.querySelector('form.ticket-purchase'))
}

export function fillBuyer({ name = 'Camila Rearte', email = 'camila@example.com', phone } = {}) {
  fireEvent.change(input('buyer-name'), { target: { value: name } })
  fireEvent.change(input('buyer-email'), { target: { value: email } })
  if (phone !== undefined) fireEvent.change(input('buyer-phone'), { target: { value: phone } })
}

export function fillAttendee(index = 0, { fullName = 'Julián Mas', dni = '30111222' } = {}) {
  fireEvent.change(input(`attendee-${index}-fullName`), { target: { value: fullName } })
  fireEvent.change(input(`attendee-${index}-dni`), { target: { value: dni } })
}

/** Del paso de entradas al de datos (necesita al menos una entrada elegida). */
export function goToBuyerStep() {
  submitStep()
}

/** Del paso de entradas al de pago, completando comprador y asistentes. */
export function goToPaymentStep({ attendees = 1 } = {}) {
  goToBuyerStep()
  fillBuyer()
  for (let index = 0; index < attendees; index += 1) {
    fillAttendee(index, { fullName: `Asistente ${index + 1}`, dni: `3011122${index}` })
  }
  submitStep()
}
