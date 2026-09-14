import { describe, expect, it } from 'vitest'
import {
  resolveInscriptionCopyVariant,
  resolvePublicInscriptionCopy,
} from '../src/lib/eventInscriptionCopy.js'

function t(key) {
  return key
}

describe('copy público de inscripción', () => {
  it('cerrado y finalizado no hablan como si la inscripción siguiera abierta', () => {
    expect(resolveInscriptionCopyVariant({ status: 'cerrado' })).toBe('closed')
    expect(resolveInscriptionCopyVariant({ status: 'finalizado' })).toBe('finished')
    expect(resolveInscriptionCopyVariant({ status: 'agotado' })).toBe('full')
    expect(
      resolveInscriptionCopyVariant({
        status: 'inscripcion_abierta',
        closedByWindow: true,
      }),
    ).toBe('closed')
  })

  it('abierta con progreso oculto sigue siendo hidden', () => {
    expect(
      resolveInscriptionCopyVariant({
        status: 'inscripcion_abierta',
        progressPublic: false,
      }),
    ).toBe('hidden')
    expect(
      resolveInscriptionCopyVariant({
        status: 'cupos_limitados',
        progressPublic: true,
      }),
    ).toBe('meter')
  })

  it('el override del admin pisa el default y el vacío cae al i18n', () => {
    const closed = resolvePublicInscriptionCopy({
      status: 'cerrado',
      t,
    })
    expect(closed.mark).toBe('pages.pitbull.inscriptionCounterClosedMark')
    expect(closed.hint).toBe('pages.pitbull.inscriptionCounterClosed')
    expect(closed.showMeter).toBe(false)

    const custom = resolvePublicInscriptionCopy({
      status: 'cerrado',
      publicCopy: {
        inscriptionMark: 'Cierre de planilla',
        inscriptionNote: 'Reabrimos el lunes.',
      },
      t,
    })
    expect(custom.mark).toBe('Cierre de planilla')
    expect(custom.hint).toBe('Reabrimos el lunes.')
  })
})
