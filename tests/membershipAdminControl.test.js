import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getMembershipStats, getRecentMemberships } from '../src/services/membershipService.js'
import { buildDashboardOverview } from '../src/services/adminService.js'

/**
 * Control operativo de la afiliación desde el panel (migración 20260806160000)
 * y las métricas que lo acompañan.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260806160000_staff_membership_status.sql'),
  'utf8',
)

const today = new Date('2026-08-06T12:00:00')

const memberships = [
  // Vigente, vence en 20 días → cuenta como activa y como "por vencer".
  {
    id: 'm1',
    athleteId: 'ath-1',
    status: 'activa',
    startDate: '2026-08-01',
    expirationDate: '2026-08-26',
    memberCode: 'PLU-ARG-2026-00000001',
  },
  // Vigente todo el año → activa, pero no por vencer.
  {
    id: 'm2',
    athleteId: 'ath-2',
    status: 'activa',
    startDate: '2026-01-01',
    expirationDate: '2026-12-31',
    memberCode: 'PLU-ARG-2026-00000002',
  },
  // Activa pero ya vencida: no cubre a nadie hoy.
  {
    id: 'm3',
    athleteId: 'ath-3',
    status: 'activa',
    startDate: '2025-01-01',
    expirationDate: '2026-01-31',
    memberCode: 'PLU-ARG-2025-00000003',
  },
  // Renovación esperando pago.
  {
    id: 'm4',
    athleteId: 'ath-4',
    status: 'pendiente_pago',
    startDate: '2026-08-05',
    expirationDate: '2027-08-05',
    memberCode: 'PLU-ARG-2026-00000004',
  },
]

describe('métricas de afiliación', () => {
  it('cuenta como activas solo las que cubren hoy', () => {
    // El recuento por `status` daba 3: incluía una vencida que seguía marcada
    // como activa porque el cron de expiración no había corrido.
    expect(getMembershipStats(memberships, today).active).toBe(2)
  })

  it('cuenta las altas del mes por fecha de inicio', () => {
    expect(getMembershipStats(memberships, today).newThisMonth).toBe(2)
  })

  it('marca las que vencen dentro de 30 días', () => {
    expect(getMembershipStats(memberships, today).expiringSoon).toBe(1)
  })

  it('cuenta las que esperan pago', () => {
    expect(getMembershipStats(memberships, today).pendingPayment).toBe(1)
  })

  it('no rompe con un padrón vacío', () => {
    expect(getMembershipStats([], today)).toEqual({
      active: 0,
      newThisMonth: 0,
      expiringSoon: 0,
      pendingPayment: 0,
    })
  })
})

describe('afiliaciones recientes', () => {
  it('ordena por alta descendente y respeta el límite', () => {
    const recent = getRecentMemberships(memberships, 2)
    expect(recent.map((item) => item.id)).toEqual(['m4', 'm1'])
  })

  it('el dashboard las expone separadas de las altas de cuenta', () => {
    // Registrarse no afilia: son dos listas distintas y mezclarlas hacía que
    // el panel contara como socio a cualquiera que creó una cuenta.
    const overview = buildDashboardOverview({
      athletes: [
        { id: 'ath-1', fullName: 'Martina Rivas', createdAt: '2026-08-01T10:00:00Z' },
        { id: 'ath-4', fullName: 'Bruno Sosa', createdAt: '2026-08-05T10:00:00Z' },
      ],
      memberships,
      registrations: [],
      payments: [],
      events: [],
    })

    expect(overview.recentMemberships.items[0]).toMatchObject({
      id: 'm4',
      fullName: 'Bruno Sosa',
      memberCode: 'PLU-ARG-2026-00000004',
    })
    expect(overview.recentMemberships.items).not.toHaveLength(0)
    expect(overview.recentAthletes.items).toBeDefined()
  })
})

describe('activación y baja manual', () => {
  it('solo admite activa o cancelada', () => {
    expect(migration).toContain("if p_status not in ('activa', 'cancelada') then")
  })

  it('es idempotente', () => {
    expect(migration).toContain("'duplicate', true")
  })

  it('activar no pisa un período todavía vigente', () => {
    // Activar a mano no puede acortar ni correr una vigencia ya pagada.
    expect(migration).toContain(
      'if v_membership.expiration_date is null or v_membership.expiration_date < current_date then',
    )
  })

  it('la baja solo desafilia si no queda otra vigente', () => {
    expect(migration).toContain('and m.id <> p_membership_id')
    expect(migration).toContain("set status = 'registrado'")
  })

  it('queda auditado con el responsable', () => {
    expect(migration).toContain("'membership.activated_manually'")
    expect(migration).toContain("'membership.cancelled_manually'")
    expect(migration).toContain('p_actor')
  })

  it('la RPC no queda expuesta a anon', () => {
    expect(migration).toContain(
      'revoke all on function public.staff_set_membership_status(uuid, text, text)\n  from public, anon, authenticated;',
    )
  })
})
