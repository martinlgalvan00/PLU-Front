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

    const statuses = overview.breakdowns.registrations.items.map((item) => item.status)
    expect(statuses).toEqual(['confirmada', 'pendiente_pago', 'observada'])
    expect(
      overview.breakdowns.registrations.items.find((item) => item.status === 'confirmada')?.value,
    ).toBe(2)
  })
})

describe('buildDashboardOverview — desglose de eventos', () => {
  it('cuenta eventos por estado con el mismo tono que status.js', () => {
    const overview = buildDashboardOverview({
      athletes: [],
      memberships: [],
      payments: [],
      registrations: [],
      events: [
        { id: 'e1', status: 'inscripcion_abierta' },
        { id: 'e2', status: 'inscripcion_abierta' },
        { id: 'e3', status: 'cupos_limitados' },
        { id: 'e4', status: 'finalizado' },
      ],
    })

    expect(overview.breakdowns.events.total).toBe(4)
    expect(overview.breakdowns.events.items).toEqual(
      expect.arrayContaining([
        { status: 'inscripcion_abierta', value: 2, tone: 'success' },
        { status: 'cupos_limitados', value: 1, tone: 'warning' },
        { status: 'finalizado', value: 1, tone: 'default' },
        { status: 'proximamente', value: 0, tone: 'default' },
        { status: 'cerrado', value: 0, tone: 'alert' },
      ]),
    )
  })
})
