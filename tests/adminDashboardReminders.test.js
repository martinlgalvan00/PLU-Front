import { describe, expect, it } from 'vitest'
import { buildDashboardReminders } from '../src/services/adminService.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Fechas relativas a HOY, siempre: los recordatorios viven de ventanas
 * (7 días para cierres, 30 para vencimientos) y un literal se pudre solo
 * (ver la lección de adminOperationalFlows.test.js).
 */
function inDays(days) {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)
}

function baseSnapshot(overrides = {}) {
  return {
    payments: [],
    registrations: [],
    memberships: [],
    events: [],
    pendingTicketOrders: [],
    ...overrides,
  }
}

describe('buildDashboardReminders', () => {
  it('devuelve la mesa vacía cuando el snapshot está al día', () => {
    const reminders = buildDashboardReminders(baseSnapshot())

    expect(reminders.items).toEqual([])
    expect(reminders.openCount).toBe(0)
    expect(reminders.urgentCount).toBe(0)
  })

  it('marca como urgentes los pagos con validación manual pendiente', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        payments: [
          { id: 'p1', status: 'validacion_manual' },
          { id: 'p2', status: 'validacion_manual' },
          { id: 'p3', status: 'aprobado' },
        ],
      }),
    )

    const manual = reminders.items.find((item) => item.id === 'manual_payments')
    expect(manual).toMatchObject({ severity: 'urgent', count: 2, section: 'payments' })
  })

  it('avisa inscripciones observadas y órdenes de entradas por separado', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        registrations: [{ id: 'r1', status: 'observada' }],
        pendingTicketOrders: [{ orderId: 't1' }],
      }),
    )

    expect(reminders.items.find((item) => item.id === 'observed_registrations')).toMatchObject({
      severity: 'urgent',
      count: 1,
      section: 'registrations',
    })
    expect(reminders.items.find((item) => item.id === 'ticket_orders')).toMatchObject({
      severity: 'warning',
      count: 1,
      section: 'payments',
    })
  })

  it('resume afiliaciones por vencer con la fecha más próxima', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        memberships: [
          { id: 'm1', status: 'activa', expirationDate: inDays(10) },
          { id: 'm2', status: 'activa', expirationDate: inDays(5) },
          { id: 'm3', status: 'activa', expirationDate: inDays(400) },
          { id: 'm4', status: 'vencida', expirationDate: inDays(-1) },
        ],
      }),
    )

    const expiring = reminders.items.find((item) => item.id === 'expiring_memberships')
    expect(expiring.count).toBe(2)
    expect(expiring.earliestDate).toBe(inDays(5))
  })

  it('genera un recordatorio por evento que cierra inscripciones esta semana', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        events: [
          {
            id: 'e1',
            title: 'Pitbull Classic',
            status: 'inscripcion_abierta',
            registrationClosesAt: `${inDays(3)}T23:59`,
          },
          {
            id: 'e2',
            title: 'Lejano',
            status: 'inscripcion_abierta',
            registrationClosesAt: `${inDays(30)}T23:59`,
          },
          {
            id: 'e3',
            title: 'Ya cerrado',
            status: 'inscripcion_abierta',
            registrationClosesAt: `${inDays(-2)}T23:59`,
          },
        ],
      }),
    )

    const closing = reminders.items.filter((item) => item.kind === 'closing_event')
    expect(closing).toHaveLength(1)
    expect(closing[0].event.title).toBe('Pitbull Classic')
    expect(closing[0].event.daysLeft).toBeGreaterThanOrEqual(2)
    expect(closing[0].event.daysLeft).toBeLessThanOrEqual(4)
  })

  it('trata el cierre de hoy sin días negativos', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        events: [
          {
            id: 'e1',
            title: 'Cierra hoy',
            status: 'cupos_limitados',
            registrationClosesAt: `${inDays(0)}T23:59`,
          },
        ],
      }),
    )

    const closing = reminders.items.find((item) => item.kind === 'closing_event')
    expect(closing.event.daysLeft).toBe(0)
  })

  it('marca como info los eventos casi agotados que siguen abiertos', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        events: [
          { id: 'e1', title: 'Casi lleno', status: 'inscripcion_abierta', slots: 100, registered: 92 },
          { id: 'e2', title: 'Mitad', status: 'inscripcion_abierta', slots: 100, registered: 50 },
        ],
      }),
    )

    const nearlyFull = reminders.items.find((item) => item.kind === 'nearly_full_event')
    expect(nearlyFull.severity).toBe('info')
    expect(nearlyFull.count).toBe(92)
  })

  it('detecta eventos con configuración contradictoria como urgentes', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        events: [
          {
            id: 'e1',
            title: 'Contradictorio',
            status: 'inscripcion_abierta',
            registrationClosesAt: `${inDays(-5)}T23:59`,
          },
        ],
      }),
    )

    const consistency = reminders.items.find((item) => item.id === 'event_consistency')
    expect(consistency.severity).toBe('urgent')
    expect(consistency.eventTitles).toEqual(['Contradictorio'])
  })

  it('ordena urgentes antes que warnings y estos antes que info', () => {
    const reminders = buildDashboardReminders(
      baseSnapshot({
        payments: [{ id: 'p1', status: 'validacion_manual' }],
        memberships: [{ id: 'm1', status: 'activa', expirationDate: inDays(7) }],
        events: [
          { id: 'e1', title: 'Casi lleno', status: 'inscripcion_abierta', slots: 100, registered: 95 },
        ],
      }),
    )

    const severities = reminders.items.map((item) => item.severity)
    expect(severities).toEqual(['urgent', 'warning', 'info'])
    expect(reminders.urgentCount).toBe(1)
    expect(reminders.openCount).toBe(3)
  })

  it('se integra a buildDashboardOverview con las órdenes de entrada', async () => {
    const { buildDashboardOverview } = await import('../src/services/adminService.js')
    const overview = buildDashboardOverview(
      baseSnapshot({
        athletes: [],
        pendingTicketOrders: [{ orderId: 't1' }],
      }),
    )

    expect(overview.reminders.openCount).toBe(1)
    expect(overview.reminders.items[0].id).toBe('ticket_orders')
  })
})
