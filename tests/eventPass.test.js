import { describe, expect, it } from 'vitest'
import { describeEventPass, listEventPasses } from '../src/lib/eventPass.js'

const NOW = new Date('2026-11-20T12:00:00Z')
const base = {
  id: 'r1',
  event: 'Pitbull Classic',
  eventSlug: 'pitbull-classic-2026',
  eventStartsAt: '2026-12-11T12:00:00Z',
  requiresMembership: false,
}

describe('describeEventPass', () => {
  it('confirmada sin exigir afiliación: lista para ingresar', () => {
    expect(describeEventPass({ ...base, status: 'confirmada' }, { now: NOW }).state).toBe('ready')
  })

  it('el evento pide afiliación y no está vigente: lo dice antes de llegar a la puerta', () => {
    const pass = describeEventPass(
      { ...base, status: 'confirmada', requiresMembership: true },
      { now: NOW, membershipCurrent: false },
    )
    expect(pass.state).toBe('needs_membership')
  })

  it('pago pendiente y observado tienen su propio estado', () => {
    expect(describeEventPass({ ...base, status: 'pendiente_pago' }, { now: NOW }).state).toBe(
      'payment_pending',
    )
    expect(describeEventPass({ ...base, status: 'observada' }, { now: NOW }).state).toBe('observed')
  })

  it('con ingreso registrado manda "ya ingresaste", aunque el evento haya pasado', () => {
    const pass = describeEventPass(
      { ...base, status: 'confirmada', checkedInAt: '2026-12-11T13:00:00Z' },
      { now: new Date('2027-01-10T00:00:00Z') },
    )
    expect(pass.state).toBe('checked_in')
  })

  it('canceladas y eventos terminados no generan pase', () => {
    expect(describeEventPass({ ...base, status: 'cancelada' }, { now: NOW })).toBeNull()
    expect(
      describeEventPass(
        { ...base, status: 'confirmada' },
        { now: new Date('2027-01-10T00:00:00Z') },
      ),
    ).toBeNull()
  })
})

describe('listEventPasses', () => {
  it('ordena por fecha del evento y deja los ya usados al final', () => {
    const passes = listEventPasses(
      [
        { ...base, id: 'b', eventStartsAt: '2027-03-06T12:00:00Z', status: 'pendiente_pago' },
        { ...base, id: 'a', status: 'confirmada' },
        { ...base, id: 'c', status: 'cancelada' },
        {
          ...base,
          id: 'u',
          eventStartsAt: '2026-09-01T12:00:00Z',
          status: 'confirmada',
          checkedInAt: '2026-09-01T13:00:00Z',
        },
      ],
      { now: NOW },
    )
    expect(passes.map((pass) => pass.registration.id)).toEqual(['a', 'b', 'u'])
  })
})
