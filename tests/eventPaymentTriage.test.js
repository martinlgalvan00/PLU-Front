import { describe, expect, it } from 'vitest'
import {
  buildEventPaymentTriage,
  classifyEventPaymentBucket,
  formatEventPaymentTriageSummary,
} from '../src/services/eventPaymentTriage.js'

const EVENT = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic' }

describe('eventPaymentTriage', () => {
  it('clasifica estados abiertos, problemas y aprobados', () => {
    expect(classifyEventPaymentBucket({ status: 'pendiente' })).toBe('pending')
    expect(classifyEventPaymentBucket({ status: 'validacion_manual' })).toBe('pending')
    expect(classifyEventPaymentBucket({ status: 'rechazado' })).toBe('problem')
    expect(classifyEventPaymentBucket({ status: 'cancelado' })).toBe('problem')
    expect(classifyEventPaymentBucket({ status: 'aprobado' })).toBe('ok')
    expect(classifyEventPaymentBucket({ status: 'reembolsado' })).toBeNull()
  })

  it('arma buckets solo del evento pedido', () => {
    const triage = buildEventPaymentTriage({
      event: EVENT,
      athletes: [{ id: 'a1', fullName: 'Ana Pérez' }],
      payments: [
        {
          id: 'p1',
          athleteId: 'a1',
          eventSlug: 'pitbull-classic-2026',
          status: 'validacion_manual',
          amount: 1000,
          concept: 'Inscripción',
          method: 'manual_link',
          paymentProofPath: 'proofs/a.pdf',
        },
        {
          id: 'p2',
          athleteId: 'a1',
          eventSlug: 'otro-meet',
          status: 'pendiente',
          amount: 500,
        },
        {
          id: 'p3',
          athleteId: 'a1',
          eventSlug: 'pitbull-classic-2026',
          status: 'aprobado',
          amount: 2000,
        },
        {
          id: 'p4',
          athleteId: 'a1',
          eventSlug: 'pitbull-classic-2026',
          status: 'rechazado',
          amount: 800,
        },
      ],
      pendingTicketOrders: [
        {
          orderId: 't1',
          eventSlug: 'pitbull-classic-2026',
          eventTitle: 'Pitbull Classic',
          amount: 12000,
          status: 'validacion_manual',
          paymentProofPath: null,
          attendees: [{ name: 'Juan', dni: '1' }],
        },
      ],
    })

    expect(triage.counts).toEqual({ ok: 1, pending: 2, problem: 1, total: 4 })
    expect(triage.rows.map((row) => row.bucket)).toEqual([
      'pending',
      'pending',
      'problem',
      'ok',
    ])
    expect(triage.rows.some((row) => row.kind === 'ticket')).toBe(true)
    expect(triage.rows.find((row) => row.id === 'pay-p1')?.subject).toBe('Ana Pérez')
  })

  it('formatea el resumen de la fila Pagos', () => {
    const t = (key, vars) => {
      if (key === 'admin.eventConsole.paymentsClear') return 'Sin pendientes'
      if (key === 'admin.eventConsole.paymentsPending') return `${vars.count} pendientes`
      if (key === 'admin.eventConsole.paymentsProblem') return `${vars.count} a resolver`
      if (key === 'admin.eventConsole.paymentsOk') return `${vars.count} en regla`
      return key
    }

    expect(formatEventPaymentTriageSummary({ ok: 0, pending: 0, problem: 0, total: 0 }, t)).toBe(
      'Sin pendientes',
    )
    expect(formatEventPaymentTriageSummary({ ok: 3, pending: 2, problem: 1, total: 6 }, t)).toBe(
      '2 pendientes · 1 a resolver',
    )
    expect(formatEventPaymentTriageSummary({ ok: 4, pending: 0, problem: 0, total: 4 }, t)).toBe(
      '4 en regla',
    )
  })
})
