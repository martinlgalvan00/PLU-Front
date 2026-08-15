import { describe, expect, it } from 'vitest'
import { buildDashboardOverview } from '../src/services/adminService.js'

describe('buildDashboardOverview operational flows', () => {
  it('separates states that progress from states requiring a decision', () => {
    const overview = buildDashboardOverview({
      athletes: [],
      memberships: [
        { id: 'm1', status: 'activa', expirationDate: '2027-12-31' },
        { id: 'm2', status: 'activa', expirationDate: '2026-08-20' },
      ],
      payments: [
        { id: 'p1', status: 'pendiente' },
        { id: 'p2', status: 'validacion_manual' },
      ],
      registrations: [
        { id: 'r1', status: 'confirmada' },
        { id: 'r2', status: 'observada' },
      ],
      events: [
        { id: 'e1', status: 'inscripcion_abierta' },
        { id: 'e2', status: 'cupos_limitados' },
      ],
    })

    expect(overview.operationalFlows).toMatchObject({
      payments: { reconciliationPending: 1, manualValidation: 1 },
      registrations: { confirmed: 1, observed: 1, gatePending: 0 },
      memberships: { active: 2, expiring: 1 },
      events: { open: 1, limited: 1 },
    })
  })
})
