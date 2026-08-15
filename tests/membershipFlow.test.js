import { describe, expect, it } from 'vitest'
import {
  filterMemberships,
  getMembershipLifecycle,
  getMembershipOperationalStatus,
  hasCurrentMembership,
  isExpiringSoon,
  isMembershipCurrent,
  isMembershipExpired,
  MEMBERSHIP_LIFECYCLE,
} from '../src/services/membershipService.js'
import { reconcileCreatedOrder } from '../src/services/paymentService.js'

/**
 * membershipFlow.test.js — PLU ARG
 *
 * Las tres respuestas que el flujo de afiliación tiene que dar sobre una fila
 * de `memberships`, y que hasta ahora se resolvían con `status === 'activa'`
 * repartido por las pantallas:
 *
 *   ¿cubre hoy?      -> habilita el ingreso en puerta si el meet exige afiliación
 *   ¿ya venció?      -> corresponde renovar, NO "pendiente de pago"
 *   ¿nunca se pagó?  -> corresponde pagar por primera vez
 *
 * El caso que ordena el archivo: una fila marcada `activa` con la fecha de
 * vencimiento pasada. El cron de vencimiento no es instantáneo y la fila queda
 * así por un rato; mirando solo `status` esa afiliación se mostraba al día,
 * escondía el botón de renovar —única salida del atleta— y ofrecía una
 * credencial vencida como si sirviera. El servidor, en cambio, la rechaza en
 * la puerta: `staff_check_in_registration` exige cobertura vigente (PLU05)
 * cuando el evento pide afiliación.
 */

const TODAY = new Date('2026-08-07T12:00:00')

function membership(overrides = {}) {
  return {
    id: 'mem-1',
    athleteId: 'ath-1',
    status: 'activa',
    startDate: '2026-01-01',
    expirationDate: '2026-12-31',
    memberCode: 'PLU-ARG-2026-014',
    ...overrides,
  }
}

describe('vigencia de la afiliación', () => {
  it('reconoce la que cubre hoy', () => {
    expect(isMembershipCurrent(membership(), TODAY)).toBe(true)
    expect(isMembershipExpired(membership(), TODAY)).toBe(false)
  })

  it('no da por vigente una fila activa con el vencimiento pasado', () => {
    const stale = membership({ expirationDate: '2026-07-31' })
    expect(isMembershipCurrent(stale, TODAY)).toBe(false)
    expect(isMembershipExpired(stale, TODAY)).toBe(true)
  })

  it('el día del vencimiento todavía cubre', () => {
    const lastDay = membership({ expirationDate: '2026-08-07' })
    expect(isMembershipCurrent(lastDay, TODAY)).toBe(true)
    expect(isMembershipExpired(lastDay, TODAY)).toBe(false)
  })

  it('distingue vencida de nunca paga', () => {
    // Las dos son "no vigente", pero la acción que corresponde es distinta:
    // renovar contra pagar por primera vez.
    const unpaid = membership({ status: 'pendiente_pago', expirationDate: '2026-12-31' })
    expect(isMembershipCurrent(unpaid, TODAY)).toBe(false)
    expect(isMembershipExpired(unpaid, TODAY)).toBe(false)

    const expired = membership({ status: 'vencida', expirationDate: '2025-12-31' })
    expect(isMembershipExpired(expired, TODAY)).toBe(true)
  })

  it('una renovación programada no está vencida ni vigente todavía', () => {
    // Alta con fecha futura sobre una cobertura que todavía corre: el
    // corrimiento es intencional (ver project_membership_order_target).
    const scheduled = membership({ startDate: '2026-12-01', expirationDate: '2027-12-01' })
    expect(isMembershipCurrent(scheduled, TODAY)).toBe(false)
    expect(isMembershipExpired(scheduled, TODAY)).toBe(false)
    expect(getMembershipLifecycle(scheduled, TODAY)).toBe(MEMBERSHIP_LIFECYCLE.SCHEDULED)
    expect(getMembershipOperationalStatus(scheduled, TODAY)).toBe('programada')
  })

  it('deriva vencida aunque el cron todavía no haya corregido el estado persistido', () => {
    const stale = membership({ expirationDate: '2026-08-06' })
    expect(getMembershipOperationalStatus(stale, TODAY)).toBe('vencida')
    expect(filterMemberships([stale], { status: 'activa', today: TODAY })).toEqual([])
    expect(filterMemberships([stale], { status: 'vencida', today: TODAY })).toEqual([stale])
  })

  it('encuentra afiliaciones por gimnasio para operar el padrón', () => {
    const item = membership({
      athlete: { fullName: 'Ana Torres', documentId: '30111222', gym: 'Fuerza Sur' },
    })

    expect(filterMemberships([item], { query: 'fuerza sur', today: TODAY })).toEqual([item])
  })

  it('calcula el vencimiento próximo contra el día recibido, sin depender del reloj real', () => {
    expect(isExpiringSoon('2026-09-06', 30, TODAY)).toBe(true)
    expect(isExpiringSoon('2026-09-07', 30, TODAY)).toBe(false)
    expect(isExpiringSoon('2026-08-06', 30, TODAY)).toBe(false)
    expect(isExpiringSoon(null, 30, TODAY)).toBe(false)
  })

  it('mantiene cancelación y reembolso como estados terminales con fechas viejas', () => {
    expect(getMembershipLifecycle(membership({ status: 'cancelada' }), TODAY)).toBe(
      MEMBERSHIP_LIFECYCLE.CANCELLED,
    )
    expect(getMembershipLifecycle(membership({ status: 'reembolsada' }), TODAY)).toBe(
      MEMBERSHIP_LIFECYCLE.REFUNDED,
    )
  })

  it('no considera vencida una afiliación cancelada o reembolsada', () => {
    for (const status of ['cancelada', 'reembolsada', 'pendiente_pago']) {
      expect(isMembershipExpired(membership({ status, expirationDate: '2025-01-01' }), TODAY)).toBe(false)
    }
  })

  it('sin fecha de vencimiento no cubre, igual que en el servidor', () => {
    // La RPC hace coalesce a ayer: sin fecha no hay derecho.
    const undated = membership({ expirationDate: null })
    expect(isMembershipCurrent(undated, TODAY)).toBe(false)
    expect(isMembershipExpired(undated, TODAY)).toBe(false)
    expect(isMembershipExpired(membership({ status: 'vencida', expirationDate: null }), TODAY)).toBe(true)
  })

  it('habilita inscribirse solo con cobertura vigente del propio atleta', () => {
    const padron = [
      membership({ id: 'mem-a', athleteId: 'ath-1', expirationDate: '2026-07-31' }),
      membership({ id: 'mem-b', athleteId: 'ath-2' }),
    ]
    expect(hasCurrentMembership(padron, 'ath-1', TODAY)).toBe(false)
    expect(hasCurrentMembership(padron, 'ath-2', TODAY)).toBe(true)
    expect(hasCurrentMembership(padron, undefined, TODAY)).toBe(false)

    // Renovada: la fila nueva vigente habilita aunque la vieja siga vencida.
    expect(
      hasCurrentMembership([...padron, membership({ id: 'mem-c', athleteId: 'ath-1' })], 'ath-1', TODAY),
    ).toBe(true)
  })
})

describe('estado de la orden en la pantalla de confirmación', () => {
  const ORDER_ID = '8cb43d94-b330-4e69-a2d0-76a56916ebf5'
  const created = { type: 'membership', paymentId: ORDER_ID, status: 'pendiente', amount: 25000 }

  it('adopta el estado que trae el snapshot cuando el pago se acredita', () => {
    const synced = reconcileCreatedOrder(created, [{ id: ORDER_ID, status: 'aprobado' }])

    expect(synced.status).toBe('aprobado')
    // El resto de la orden es lo que la pantalla ya venía mostrando: el
    // snapshot solo manda sobre el estado.
    expect(synced.amount).toBe(25000)
    expect(synced.type).toBe('membership')
  })

  it('devuelve la misma referencia si no hay nada que cambiar', () => {
    // Se llama en cada refresco del snapshot; cambiar la referencia sin motivo
    // vuelve a montar el checkout embebido y el brick pierde lo tipeado.
    expect(reconcileCreatedOrder(created, [{ id: ORDER_ID, status: 'pendiente' }])).toBe(created)
    expect(reconcileCreatedOrder(created, [])).toBe(created)
    expect(reconcileCreatedOrder(created, [{ id: 'otra-orden', status: 'aprobado' }])).toBe(created)
  })

  it('tolera no tener orden en pantalla', () => {
    expect(reconcileCreatedOrder(null, [{ id: ORDER_ID, status: 'aprobado' }])).toBe(null)
    // La confirmación de alta de perfil no tiene orden de pago asociada.
    const profile = { type: 'profile', athleteName: 'Ana Torres', status: 'registrado' }
    expect(reconcileCreatedOrder(profile, [])).toBe(profile)
  })

  it('también refleja un rechazo', () => {
    expect(reconcileCreatedOrder(created, [{ id: ORDER_ID, status: 'rechazado' }]).status).toBe('rechazado')
  })
})
