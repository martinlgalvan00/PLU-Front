import { beforeEach, describe, expect, it } from 'vitest'
import {
  CELEBRATION_ENABLED,
  buildCelebrationPieces,
  celebrationBiasX,
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

/**
 * El sesgo horizontal del abanico.
 *
 * El sello abre el bloque de confirmación contra el margen izquierdo: en 390px
 * vive a ~70px del borde mientras el papel viaja ~94px, así que media ráfaga
 * salía de pantalla y lo que quedaba se leía como confeti entrando desde
 * afuera en vez de saliendo del sello. El sesgo corre el abanico completo lo
 * justo para que el extremo entre.
 */
describe('sesgo horizontal de la ráfaga', () => {
  it('no corre nada cuando el sello tiene lugar a los dos lados', () => {
    expect(celebrationBiasX(720, 1440, 300)).toBe(0)
  })

  it('empuja a la derecha el sello pegado al borde izquierdo', () => {
    // 390px de ancho, alcance 94px, sello a 70px: faltan 34px de pista.
    const bias = celebrationBiasX(70, 390, 94)

    expect(bias).toBeGreaterThan(0)
    // El extremo izquierdo del abanico entra al viewport en vez de salirse.
    expect(70 - 94 + bias * 94).toBeGreaterThanOrEqual(0)
  })

  it('empuja a la izquierda el sello pegado al borde derecho', () => {
    const bias = celebrationBiasX(330, 390, 94)

    expect(bias).toBeLessThan(0)
    expect(330 + 94 + bias * 94).toBeLessThanOrEqual(390)
  })

  // Un sesgo de 1 mandaría todas las piezas al mismo lado y el abanico dejaría
  // de ser un abanico: es papel volando en una dirección.
  it('nunca vuelca el abanico entero hacia un lado', () => {
    expect(Math.abs(celebrationBiasX(0, 390, 300))).toBeLessThanOrEqual(0.92)
    expect(Math.abs(celebrationBiasX(390, 390, 300))).toBeLessThanOrEqual(0.92)
  })

  // Sin alcance resuelto (jsdom sin el CSS del componente) el sesgo queda en 0
  // y la ráfaga se comporta como antes: nunca peor que el estado previo.
  it('queda neutro sin alcance resuelto', () => {
    expect(celebrationBiasX(70, 390, 0)).toBe(0)
    expect(celebrationBiasX(70, 0, 94)).toBe(0)
  })
})
