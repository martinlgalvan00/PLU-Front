import { describe, expect, it } from 'vitest'
import {
  applyAthleteCheckinGate,
  describeAthleteCredential,
  describeDoorCredential,
  doorRequiresMembership,
} from '../src/lib/athleteCredential.js'

const athlete = { credentialToken: '11111111-1111-4111-8111-111111111111' }
const currentMembership = { status: 'activa', memberCode: 'PLU-1', expirationDate: '2099-01-01' }
const inactiveMembership = { status: 'vencida', memberCode: 'PLU-1', expirationDate: '2020-01-01' }

describe('describeAthleteCredential', () => {
  it('habilita el QR de la card cuando hay inscripción confirmada aunque la afiliación no esté vigente', () => {
    const model = describeAthleteCredential({
      athlete,
      membership: inactiveMembership,
      registrations: [{ status: 'confirmada', requiresMembership: false }],
    })

    expect(model.hasCredential).toBe(true)
    expect(model.canShowQr).toBe(true)
    expect(model.credentialCode).toBe(athlete.credentialToken)
    expect(model.statusKey).toBe('account.qr.gateReady')
    expect(model.statusReady).toBe(true)
  })

  it('mantiene la card cerrada si no hay afiliación vigente ni inscripción', () => {
    const model = describeAthleteCredential({
      athlete,
      membership: inactiveMembership,
      registrations: [],
    })

    expect(model.hasCredential).toBe(false)
    expect(model.canShowQr).toBe(false)
    expect(model.statusKey).toBe('account.membershipInactive')
    expect(model.statusReady).toBe(false)
  })

  it('unifica el estado cuando hay afiliación vigente e inscripción', () => {
    const model = describeAthleteCredential({
      athlete,
      membership: currentMembership,
      registrations: [{ status: 'pagada', requiresMembership: true }],
    })

    expect(model.statusKey).toBe('account.qr.unifiedStatus')
    expect(model.statusReady).toBe(true)
    expect(model.canShowQr).toBe(true)
  })

  it('muestra el QR pero deja el chip inactivo si el torneo todavía exige afiliación', () => {
    const model = describeAthleteCredential({
      athlete,
      membership: inactiveMembership,
      registrations: [{ status: 'confirmada', requiresMembership: true }],
    })

    expect(model.canShowQr).toBe(true)
    expect(model.gateReady).toBe(false)
    expect(model.statusKey).toBe('account.qr.gateReserved')
    expect(model.statusReady).toBe(false)
  })

  it('muestra la inscripción del torneo que se pidió ver', () => {
    const model = describeAthleteCredential({
      athlete,
      membership: inactiveMembership,
      registrations: [
        { status: 'confirmada', eventSlug: 'meet-a', event: 'Meet A', requiresMembership: false },
        { status: 'confirmada', eventSlug: 'meet-b', event: 'Meet B', requiresMembership: true },
      ],
      focusEventSlug: 'meet-b',
    })

    expect(model.primaryMeet.eventSlug).toBe('meet-b')
    expect(model.statusKey).toBe('account.qr.gateReserved')
    expect(model.canShowQr).toBe(true)
  })

  it('si el torneo pedido no está admitido, vuelve a la primera inscripción', () => {
    const model = describeAthleteCredential({
      athlete,
      membership: inactiveMembership,
      registrations: [
        { status: 'confirmada', eventSlug: 'meet-a', requiresMembership: false },
        { status: 'pendiente_pago', eventSlug: 'meet-b', requiresMembership: false },
      ],
      focusEventSlug: 'meet-b',
    })

    expect(model.primaryMeet.eventSlug).toBe('meet-a')
    expect(model.statusKey).toBe('account.qr.gateReady')
  })
})

describe('describeDoorCredential', () => {
  it('trata null como afiliación exigida y la ausencia de la bandera como no exigida', () => {
    expect(doorRequiresMembership({ requiresMembership: null })).toBe(true)
    expect(doorRequiresMembership({ requiresMembership: false })).toBe(false)
    expect(doorRequiresMembership({})).toBe(false)
  })

  it('no pinta válida una inscripción confirmada si el torneo pide afiliación y no está vigente', () => {
    const door = describeDoorCredential({
      membership: inactiveMembership,
      registrations: [{ id: 'reg-1', status: 'confirmada', requiresMembership: true }],
    })

    expect(door.verdict).toBe('warning')
    expect(door.gates[0].ready).toBe(false)
  })

  it('sí habilita el ingreso de un meet abierto sin afiliación vigente', () => {
    const door = describeDoorCredential({
      membership: null,
      registrations: [{ id: 'reg-1', status: 'confirmada', requiresMembership: false }],
    })

    expect(door.verdict).toBe('valid')
    expect(door.gates[0].ready).toBe(true)
  })

  it('con un evento en el QR juzga esa inscripción y no otra', () => {
    const door = describeDoorCredential({
      membership: currentMembership,
      eventSlug: 'meet-a',
      registration: null,
      registrations: [{ id: 'reg-2', status: 'confirmada', requiresMembership: false }],
    })

    expect(door.verdict).toBe('unknown')
    expect(door.gates).toHaveLength(0)
  })
})

describe('applyAthleteCheckinGate', () => {
  const registration = {
    id: 'reg-1',
    athleteId: 'ath-1',
    status: 'confirmada',
    requiresMembership: true,
  }

  it('saca de la fila de listos a quien el meet todavía no puede dejar entrar', () => {
    expect(applyAthleteCheckinGate('pagada', registration, { memberships: [] })).toBe(
      'needs_membership',
    )
  })

  it('lo deja listo si la afiliación está vigente', () => {
    expect(
      applyAthleteCheckinGate('pagada', registration, {
        memberships: [
          {
            athleteId: 'ath-1',
            status: 'activa',
            expirationDate: '2099-01-01',
          },
        ],
      }),
    ).toBe('pagada')
  })

  it('no toca un meet abierto ni un ingreso ya marcado', () => {
    expect(
      applyAthleteCheckinGate('pagada', { ...registration, requiresMembership: false }, {
        membership: null,
      }),
    ).toBe('pagada')
    expect(applyAthleteCheckinGate('usada', registration, { memberships: [] })).toBe('usada')
  })
})
