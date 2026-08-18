import { describe, expect, it } from 'vitest'
import { findUnreconciledApprovedPayments } from '../src/services/paymentReconciliationService.js'

const athletes = [{ id: 'athlete-1', fullName: 'Martin Galvan', documentId: '42821146' }]

describe('findUnreconciledApprovedPayments', () => {
  it('detecta un pago de afiliación aprobado sin ninguna membership que lo refleje', () => {
    // Caso real: apply_mercado_pago_payment activa por
    // `update memberships set status = 'activa' where payment_order_id = ...`
    // -- si para ese momento ninguna fila apunta a esa orden (reintento que
    // repuntó payment_order_id a otra orden, o la fila nunca se creó), el pago
    // queda 'aprobado' sin ninguna membership asociada.
    const payments = [
      {
        id: 'order-1',
        athleteId: 'athlete-1',
        conceptType: 'membership',
        status: 'aprobado',
        amount: 1,
        reference: 'MORD-1',
      },
    ]
    const memberships = [
      {
        id: 'membership-1',
        athleteId: 'athlete-1',
        paymentOrderId: 'order-2',
        status: 'cancelada',
      },
    ]

    const result = findUnreconciledApprovedPayments({
      memberships,
      registrations: [],
      payments,
      athletes,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'order-1',
      missingMembership: true,
      missingRegistration: false,
    })
    expect(result[0].athlete.fullName).toBe('Martin Galvan')
  })

  it('no marca nada cuando la orden aprobada activó su membership', () => {
    const payments = [
      {
        id: 'order-1',
        athleteId: 'athlete-1',
        conceptType: 'membership',
        status: 'aprobado',
        amount: 85000,
      },
    ]
    const memberships = [
      { id: 'membership-1', athleteId: 'athlete-1', paymentOrderId: 'order-1', status: 'activa' },
    ]

    expect(
      findUnreconciledApprovedPayments({ memberships, registrations: [], payments, athletes }),
    ).toEqual([])
  })

  it('una membership vencida no cuenta como sin conciliar (cumplió su ciclo)', () => {
    const payments = [
      {
        id: 'order-1',
        athleteId: 'athlete-1',
        conceptType: 'membership',
        status: 'aprobado',
        amount: 85000,
      },
    ]
    const memberships = [
      { id: 'membership-1', athleteId: 'athlete-1', paymentOrderId: 'order-1', status: 'vencida' },
    ]

    expect(
      findUnreconciledApprovedPayments({ memberships, registrations: [], payments, athletes }),
    ).toEqual([])
  })

  it('ignora órdenes que no están aprobadas', () => {
    const payments = [
      {
        id: 'order-1',
        athleteId: 'athlete-1',
        conceptType: 'membership',
        status: 'cancelado',
        amount: 1,
      },
    ]

    expect(
      findUnreconciledApprovedPayments({ memberships: [], registrations: [], payments, athletes }),
    ).toEqual([])
  })

  it('un combo aprobado sin inscripción confirmada se marca solo del lado de inscripción', () => {
    const payments = [
      {
        id: 'order-1',
        athleteId: 'athlete-1',
        conceptType: 'combo',
        status: 'aprobado',
        amount: 100000,
      },
    ]
    const memberships = [
      { id: 'membership-1', athleteId: 'athlete-1', paymentOrderId: 'order-1', status: 'activa' },
    ]
    const registrations = [
      {
        id: 'registration-1',
        athleteId: 'athlete-1',
        paymentOrderId: 'order-1',
        status: 'pendiente_pago',
      },
    ]

    const result = findUnreconciledApprovedPayments({
      memberships,
      registrations,
      payments,
      athletes,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ missingMembership: false, missingRegistration: true })
  })
})
