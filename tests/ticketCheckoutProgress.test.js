import { describe, expect, it } from 'vitest'
import { resolveTicketCheckoutProgress } from '../src/services/ticketCheckoutProgress.js'

const ids = ['general']
const attendee = { fullName: 'Ana Pérez', dni: '30111222', ticketTypeId: 'general' }
const buyer = { name: 'Ana Pérez', email: 'ana@correo.com', phone: '' }

describe('resolveTicketCheckoutProgress', () => {
  it('empieza en las entradas cuando falta algún dato del asistente', () => {
    const progress = resolveTicketCheckoutProgress({
      attendees: [{ ...attendee, dni: '' }],
      buyer,
      paymentMethod: 'mercado_pago',
      ticketTypeIds: ids,
    })
    expect(progress.done).toEqual({ tickets: false, buyer: true, payment: false })
    expect(progress.current).toBe('tickets')
    expect(progress.completed).toBe(1)
  })

  it('pasa al comprador cuando todos los asistentes están completos', () => {
    const progress = resolveTicketCheckoutProgress({
      attendees: [attendee],
      buyer: { name: '', email: '' },
      paymentMethod: 'mercado_pago',
      ticketTypeIds: ids,
    })
    expect(progress.done.tickets).toBe(true)
    expect(progress.current).toBe('buyer')
  })

  it('no da el pago por hecho mientras falte lo anterior, aunque venga preseleccionado', () => {
    const progress = resolveTicketCheckoutProgress({
      attendees: [attendee],
      buyer: { name: 'Ana Pérez', email: 'no-es-un-mail' },
      paymentMethod: 'mercado_pago',
      ticketTypeIds: ids,
    })
    expect(progress.done.payment).toBe(false)
  })

  it('cierra los tres pasos con todo completo', () => {
    const progress = resolveTicketCheckoutProgress({
      attendees: [attendee],
      buyer,
      paymentMethod: 'transferencia',
      ticketTypeIds: ids,
    })
    expect(progress.completed).toBe(3)
    expect(progress.current).toBe('payment')
  })

  it('marca DNI repetido entre asistentes como paso incompleto', () => {
    const progress = resolveTicketCheckoutProgress({
      attendees: [attendee, { ...attendee, fullName: 'Luis Gómez' }],
      buyer,
      paymentMethod: 'mercado_pago',
      ticketTypeIds: ids,
    })
    expect(progress.done.tickets).toBe(false)
  })

  it('un tipo de entrada fuera de venta no cuenta como válido', () => {
    const progress = resolveTicketCheckoutProgress({
      attendees: [{ ...attendee, ticketTypeId: 'retirada' }],
      buyer,
      paymentMethod: 'mercado_pago',
      ticketTypeIds: ids,
    })
    expect(progress.done.tickets).toBe(false)
  })
})
