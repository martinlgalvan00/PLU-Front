import { describe, expect, it } from 'vitest'
import { describePublicCapacity, publicCapacityBand } from '../src/lib/eventCapacityPublic.js'

describe('describePublicCapacity', () => {
  it('muestra progreso, restantes y total cuando ambos flags están prendidos', () => {
    expect(
      describePublicCapacity({
        progressPublic: true,
        totalPublic: true,
        registered: 42,
        slots: 200,
      }),
    ).toEqual({
      mode: 'meter',
      band: 'open',
      showTotal: true,
      showNumbers: true,
      registered: 42,
      slots: 200,
      remaining: 158,
      percent: 21,
    })
  })

  it('sin total publica anotados y restantes, pero no el cupo máximo', () => {
    expect(
      describePublicCapacity({
        progressPublic: true,
        totalPublic: false,
        registered: 42,
        slots: 200,
      }),
    ).toMatchObject({
      mode: 'meter',
      band: 'open',
      showTotal: false,
      showNumbers: true,
      registered: 42,
      remaining: 158,
      percent: 21,
    })

    expect(
      describePublicCapacity({
        progressPublic: true,
        totalPublic: false,
        registered: 170,
        slots: 200,
      }),
    ).toMatchObject({ mode: 'meter', band: 'tight', showTotal: false, showNumbers: true })

    expect(
      describePublicCapacity({
        progressPublic: true,
        totalPublic: false,
        registered: 200,
        slots: 200,
      }),
    ).toMatchObject({ mode: 'meter', band: 'full', showTotal: false, showNumbers: true })
  })

  it('con ocupación apagada no exhibe el medidor', () => {
    expect(
      describePublicCapacity({
        progressPublic: false,
        totalPublic: true,
        registered: 42,
        slots: 200,
      }),
    ).toMatchObject({ mode: 'hidden', band: 'hidden', showTotal: false, showNumbers: false })
  })
})

describe('publicCapacityBand', () => {
  it('marca pocos cupos desde 80% y completo sin restantes', () => {
    expect(publicCapacityBand({ percent: 21, remaining: 158 })).toBe('open')
    expect(publicCapacityBand({ percent: 55, remaining: 90 })).toBe('filling')
    expect(publicCapacityBand({ percent: 80, remaining: 40 })).toBe('tight')
    expect(publicCapacityBand({ percent: 100, remaining: 0 })).toBe('full')
  })
})
