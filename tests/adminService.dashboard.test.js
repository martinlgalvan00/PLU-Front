import { describe, expect, it } from 'vitest'
import { buildDashboardOverview } from '../src/services/adminService.js'

describe('buildDashboardOverview — estados de inscripción', () => {
  it('cuenta acreditada como confirmada y no la muestra aparte', () => {
    const overview = buildDashboardOverview({
      athletes: [],
      memberships: [],
      payments: [],
      events: [],
      registrations: [
        { id: 'r1', status: 'confirmada' },
        { id: 'r2', status: 'acreditada' },
        { id: 'r3', status: 'pendiente_pago' },
        { id: 'r4', status: 'observada' },
      ],
    })

    const confirmedMetric = overview.secondary.find((item) => item.labelKey === 'confirmed')
    expect(confirmedMetric?.value).toBe(2)

    const statuses = overview.breakdowns.registrations.items.map((item) => item.status)
    expect(statuses).toEqual(['confirmada', 'pendiente_pago', 'observada'])
    expect(
      overview.breakdowns.registrations.items.find((item) => item.status === 'confirmada')?.value,
    ).toBe(2)
  })
})
