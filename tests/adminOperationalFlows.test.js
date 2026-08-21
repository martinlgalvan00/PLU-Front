import { describe, expect, it } from 'vitest'
import { buildDashboardOverview } from '../src/services/adminService.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * "Por vencer" es una ventana de 30 días contra HOY (`isExpiringSoon`), así que
 * la fecha no puede ser un literal: este fixture decía `2026-08-20` y el test se
 * rompió solo el 21/08 —esa afiliación pasó a estar vencida, no por vencer—, sin
 * que nadie tocara una línea de código. Las dos fechas se derivan de ahora: una
 * dentro de la ventana y otra bien afuera.
 */
function inDays(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)
}

describe('buildDashboardOverview operational flows', () => {
  it('separates states that progress from states requiring a decision', () => {
    const overview = buildDashboardOverview({
      athletes: [],
      memberships: [
        { id: 'm1', status: 'activa', expirationDate: inDays(400) },
        { id: 'm2', status: 'activa', expirationDate: inDays(10) },
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
