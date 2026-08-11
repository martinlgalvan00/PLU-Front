import { describe, expect, it } from 'vitest'
import {
  buildDashboardOverview,
  buildPendingActions,
  getAdminNavBadges,
} from '../src/services/adminService.js'

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

  it('expone los inscriptos recientes con atleta, evento y fecha', () => {
    const overview = buildDashboardOverview({
      athletes: [
        { id: 'a1', fullName: 'Ana Test' },
        { id: 'a2', fullName: 'Bruno Test' },
      ],
      memberships: [],
      payments: [],
      events: [],
      registrations: [
        {
          id: 'r1',
          athleteId: 'a1',
          event: 'Pitbull Classic',
          category: 'Raw',
          division: 'Open',
          status: 'confirmada',
          createdAt: '2026-08-10T10:00:00Z',
        },
        {
          id: 'r2',
          athleteId: 'a2',
          event: 'Test',
          category: 'Raw With Wraps',
          division: 'Junior',
          status: 'pendiente_pago',
          createdAt: '2026-08-11T10:00:00Z',
        },
      ],
    })

    expect(overview.recentRegistrations.items[0]).toMatchObject({
      id: 'r2',
      fullName: 'Bruno Test',
      event: 'Test',
      createdAt: '2026-08-11T10:00:00Z',
    })
  })
})

describe('buildPendingActions — gate sin afiliación', () => {
  it('incluye confirmadas de meets que exigen afiliación sin membership vigente', () => {
    const actions = buildPendingActions({
      payments: [],
      athletes: [{ id: 'a1', fullName: 'Ana Test' }],
      memberships: [{ id: 'm1', athleteId: 'a1', status: 'pendiente_pago' }],
      registrations: [
        {
          id: 'r1',
          athleteId: 'a1',
          status: 'confirmada',
          event: 'Pitbull Classic',
          eventSlug: 'pitbull-classic-2026',
          category: 'Raw',
        },
      ],
      events: [{ slug: 'pitbull-classic-2026', title: 'Pitbull Classic', requiresMembership: true }],
    })

    expect(actions.some((item) => item.id === 'action-gate-r1')).toBe(true)
    expect(actions.find((item) => item.id === 'action-gate-r1')?.summary).toBe(
      'Confirmada sin afiliación vigente',
    )
  })
})

describe('buildPendingActions — hasProof', () => {
  it('marca hasProof en pagos de atleta y órdenes de entrada', () => {
    const actions = buildPendingActions({
      payments: [
        {
          id: 'p1',
          athleteId: 'a1',
          status: 'validacion_manual',
          concept: 'Afiliación anual',
          amount: 38000,
          paymentProofPath: 'proofs/p1.jpg',
        },
        {
          id: 'p2',
          athleteId: 'a1',
          status: 'pendiente_pago',
          concept: 'Inscripción',
          amount: 10000,
        },
      ],
      athletes: [{ id: 'a1', fullName: 'Ana Test' }],
      memberships: [],
      registrations: [],
      pendingTicketOrders: [
        {
          orderId: 't1',
          amount: 5000,
          paymentProofPath: 'tickets/t1.pdf',
          eventTitle: 'Spring Classic',
          attendees: [{ name: 'Juan' }],
        },
        {
          orderId: 't2',
          amount: 5000,
          eventTitle: 'Spring Classic',
          attendees: [{ name: 'Luis' }],
        },
      ],
    })

    expect(actions.find((item) => item.id === 'action-pay-p1')?.hasProof).toBe(true)
    expect(actions.find((item) => item.id === 'action-pay-p2')?.hasProof).toBe(false)
    expect(actions.find((item) => item.id === 'action-tord-t1')?.hasProof).toBe(true)
    expect(actions.find((item) => item.id === 'action-tord-t2')?.hasProof).toBe(false)
  })
})

describe('getAdminNavBadges — incluye gate pending', () => {
  it('suma confirmadas sin afiliación al badge de inscripciones', () => {
    const badges = getAdminNavBadges({
      payments: [],
      memberships: [],
      registrations: [
        {
          id: 'r1',
          athleteId: 'a1',
          status: 'confirmada',
          eventSlug: 'pitbull-classic-2026',
          event: 'Pitbull Classic',
        },
        { id: 'r2', athleteId: 'a2', status: 'pendiente_pago' },
      ],
      events: [{ slug: 'pitbull-classic-2026', title: 'Pitbull Classic', requiresMembership: true }],
    })

    expect(badges.registrations).toBe(2)
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
