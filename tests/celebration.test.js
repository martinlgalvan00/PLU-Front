import { beforeEach, describe, expect, it } from 'vitest'
import {
  CELEBRATION_ENABLED,
  buildCelebrationPieces,
  celebrationPieceCount,
  hasCelebrated,
  markCelebrated,
  shouldCelebrate,
} from '../src/lib/celebration.js'

/**
 * Reglas del festejo: cuándo la federación tira papel y cuándo no.
 *
 * La ráfaga acompaña tres momentos y solo tres —afiliación acreditada,
 * credencial emitida, inscripción confirmada—, nunca una orden pendiente.
 * Estas pruebas fijan las tres garantías que no pueden romperse por un cambio
 * de estilo: determinismo (para que el render sea reproducible), respeto por
 * `prefers-reduced-motion`, y el "una sola vez" de las superficies que la
 * persona vuelve a visitar.
 */

beforeEach(() => {
  window.localStorage.clear()
})

describe('geometría de la ráfaga', () => {
  // Con Math.random el mismo momento salía distinto en cada montaje: los tests
  // de render no podían afirmar nada y Storybook cambiaba de captura sola.
  it('es determinista para la misma cantidad y semilla', () => {
    expect(buildCelebrationPieces(12)).toEqual(buildCelebrationPieces(12))
  })

  it('devuelve multiplicadores unitarios, no píxeles', () => {
    for (const piece of buildCelebrationPieces(30)) {
      expect(Math.abs(piece.px)).toBeLessThanOrEqual(1)
      expect(Math.abs(piece.py)).toBeLessThanOrEqual(1)
      // El alto y el ancho son múltiplos de --celebration-unit: si volvieran a
      // ser píxeles, el calc() del CSS quedaría en px² y la pieza saldría con
      // altura 0 (fue exactamente el bug de la primera versión).
      expect(piece.width).toBeGreaterThan(0)
      expect(piece.width).toBeLessThan(4)
      expect(piece.height).toBeGreaterThan(0)
      expect(piece.height).toBeLessThan(6)
    }
  })

  // El abanico nunca pasa de 65° sobre la horizontal: con el sello arriba de la
  // pantalla, un tiro más vertical manda el papel fuera del viewport.
  it('mantiene el abanico dentro del arco hacia arriba', () => {
    for (const piece of buildCelebrationPieces(30)) {
      expect(piece.py).toBeLessThan(0)
      expect(piece.py).toBeGreaterThan(-0.79)
    }
  })

  it('cada pieza cae después del apex', () => {
    for (const piece of buildCelebrationPieces(30)) {
      expect(piece.fall).toBeGreaterThan(0)
    }
  })

  it('baja la densidad en equipos limitados sin apagar la ráfaga', () => {
    expect(celebrationPieceCount('high')).toBe(30)
    expect(celebrationPieceCount('mid')).toBe(20)
    expect(celebrationPieceCount('low')).toBe(12)
    expect(celebrationPieceCount('low')).toBeGreaterThan(0)
    expect(celebrationPieceCount(undefined)).toBe(30)
  })

  it('reparte oro dominante con celeste y plata de acompañamiento', () => {
    const tones = buildCelebrationPieces(30).map((piece) => piece.tone)
    const gold = tones.filter((tone) => tone === 'gold').length

    expect(gold / tones.length).toBeGreaterThan(0.5)
    expect(new Set(tones)).toEqual(new Set(['gold', 'celeste', 'silver']))
  })
})

describe('shouldCelebrate', () => {
  it('no festeja un hecho que todavía no está confirmado', () => {
    expect(shouldCelebrate({ active: false, reducedMotion: false })).toBe(false)
  })

  it('no festeja si la persona pidió menos movimiento', () => {
    expect(shouldCelebrate({ active: true, reducedMotion: true })).toBe(false)
  })

  it('festeja una confirmación real', () => {
    expect(shouldCelebrate({ active: true, reducedMotion: false })).toBe(true)
  })

  // Superficies que se vuelven a visitar (la credencial en la cuenta): un
  // festejo que se repite en cada entrada deja de ser un festejo.
  it('respeta el "una sola vez" cuando hay clave', () => {
    const playKey = 'credential.ath-1.PLU-2026-001'
    expect(shouldCelebrate({ active: true, reducedMotion: false, playKey })).toBe(true)

    markCelebrated(playKey)

    expect(hasCelebrated(playKey)).toBe(true)
    expect(shouldCelebrate({ active: true, reducedMotion: false, playKey })).toBe(false)
    // Otra clave (renovación con código nuevo) vuelve a festejar.
    expect(
      shouldCelebrate({ active: true, reducedMotion: false, playKey: 'credential.ath-1.PLU-2027' }),
    ).toBe(true)
  })

  it('sin clave no consulta el storage', () => {
    expect(hasCelebrated(null)).toBe(false)
    expect(shouldCelebrate({ active: true, reducedMotion: false, playKey: undefined })).toBe(true)
  })

  // El interruptor existe para poder sacar la ráfaga sin tocar la secuencia de
  // sello, credencial y QR: la confirmación nunca dependió del papel.
  it('el interruptor general está declarado como booleano', () => {
    expect(typeof CELEBRATION_ENABLED).toBe('boolean')
  })
})
