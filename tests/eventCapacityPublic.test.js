import { describe, expect, it } from 'vitest'
import { describePublicCapacity } from '../src/lib/eventCapacityPublic.js'

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
      showTotal: true,
      registered: 42,
      slots: 200,
      remaining: 158,
      percent: 21,
    })
  })

  it('oculta el total y deja anotados + lugares que quedan', () => {
    expect(
      describePublicCapacity({
        progressPublic: true,
        totalPublic: false,
        registered: 42,
        slots: 200,
      }),
    ).toMatchObject({
      mode: 'meter',
      showTotal: false,
      registered: 42,
      remaining: 158,
      percent: 21,
    })
  })

  it('con ocupación apagada no exhibe el medidor', () => {
    expect(
      describePublicCapacity({
        progressPublic: false,
        totalPublic: true,
        registered: 42,
        slots: 200,
      }),
    ).toMatchObject({ mode: 'hidden', showTotal: false })
  })
})
