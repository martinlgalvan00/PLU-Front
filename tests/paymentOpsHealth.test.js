import { describe, expect, it } from 'vitest'
import { buildPaymentHealthBreakdown } from '../src/lib/paymentOpsHealth.js'

function t(key, vars = {}) {
  return key.endsWith('_one') ? `1:${key}` : `${vars.count}:${key}`
}

describe('buildPaymentHealthBreakdown', () => {
  it('devuelve vacío si el ledger está sano', () => {
    expect(buildPaymentHealthBreakdown({ healthy: true, ticketOrderDrift: 3 }, t)).toEqual([])
  })

  it('lista solo las desalineaciones con valor', () => {
    expect(
      buildPaymentHealthBreakdown(
        {
          healthy: false,
          athleteOrderDrift: 0,
          ticketOrderDrift: 1,
          staleEventLocks: 2,
          staleReconciliationLocks: 0,
          exhaustedEvents: 0,
        },
        t,
      ),
    ).toEqual([
      '1:admin.paymentOperations.healthTicketDrift_one',
      '2:admin.paymentOperations.healthStaleEventLocks_other',
    ])
  })
})
