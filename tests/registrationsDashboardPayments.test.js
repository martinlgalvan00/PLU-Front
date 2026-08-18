import { describe, expect, it } from 'vitest'
import { findRegistrationPayment } from '../src/services/registrationAdminService.js'

describe('pagos de inscripciones en dashboard', () => {
  const payments = [
    {
      id: 'order-event-a',
      athleteId: 'athlete-1',
      event: 'Evento A',
      method: 'mercado_pago',
      status: 'aprobado',
    },
    {
      id: 'order-event-b',
      athleteId: 'athlete-1',
      event: 'Evento B',
      method: 'manual_link',
      status: 'pendiente',
    },
  ]

  it('enlaza cada inscripción con su paymentOrderId aunque el atleta tenga varias', () => {
    expect(
      findRegistrationPayment(payments, {
        athleteId: 'athlete-1',
        event: 'Evento B',
        paymentOrderId: 'order-event-b',
      }),
    ).toBe(payments[1])
  })

  it('usa atleta y evento sólo como compatibilidad para datos antiguos', () => {
    expect(
      findRegistrationPayment(payments, {
        athleteId: 'athlete-1',
        event: 'Evento A',
      }),
    ).toBe(payments[0])
  })

  it('no toma el pago de otro evento del mismo atleta', () => {
    expect(
      findRegistrationPayment(payments, {
        athleteId: 'athlete-1',
        event: 'Evento inexistente',
      }),
    ).toBeUndefined()
  })
})
