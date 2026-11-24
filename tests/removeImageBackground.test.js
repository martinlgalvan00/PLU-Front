import { describe, expect, it } from 'vitest'
import {
  BACKGROUND_REASON,
  removeFlatBackground,
  trimTransparentMargins,
} from '../src/lib/removeImageBackground.js'

function makeImage(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = paint(x, y)
      const offset = (y * width + x) * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = a
    }
  }
  return { data, width, height }
}

const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

const alphaAt = (image, x, y) => image.data[(y * image.width + x) * 4 + 3]
const channelAt = (image, x, y, channel = 0) => image.data[(y * image.width + x) * 4 + channel]

describe('removeFlatBackground', () => {
  it('quita un fondo blanco liso y recorta al sujeto', () => {
    const square = makeImage(40, 40, (x, y) =>
      x >= 10 && x < 30 && y >= 10 && y < 30 ? BLACK : WHITE,
    )

    const result = removeFlatBackground(square, { trim: false })

    expect(result.applied).toBe(true)
    expect(result.reason).toBe(BACKGROUND_REASON.APPLIED)
    expect(alphaAt(result.image, 0, 0)).toBe(0)
    expect(alphaAt(result.image, 20, 20)).toBe(255)
    expect(result.removedShare).toBeCloseTo(1 - 400 / 1600, 2)

    const trimmed = removeFlatBackground(square)
    // 20px de sujeto + 4% de aire (1px) por lado.
    expect(trimmed.image.width).toBeLessThan(40)
    expect(trimmed.image.width).toBeGreaterThanOrEqual(20)
    expect(trimmed.image.height).toBe(trimmed.image.width)
  })

  it('funciona con un fondo de color plano, no solo blanco', () => {
    const blue = [20, 60, 160]
    const badge = makeImage(32, 32, (x, y) => (x >= 8 && x < 24 && y >= 8 && y < 24 ? WHITE : blue))

    const result = removeFlatBackground(badge, { trim: false })

    expect(result.applied).toBe(true)
    expect(alphaAt(result.image, 1, 1)).toBe(0)
    expect(alphaAt(result.image, 16, 16)).toBe(255)
  })

  it('conserva lo que queda encerrado por el sujeto (el hueco de una "O")', () => {
    const ring = makeImage(40, 40, (x, y) => {
      const outer = x >= 8 && x < 32 && y >= 8 && y < 32
      const inner = x >= 16 && x < 24 && y >= 16 && y < 24
      return outer && !inner ? BLACK : WHITE
    })

    const result = removeFlatBackground(ring, { trim: false })

    expect(result.applied).toBe(true)
    expect(alphaAt(result.image, 0, 0)).toBe(0)
    expect(alphaAt(result.image, 20, 20)).toBe(255)
  })

  it('suaviza el borde anti-aliasado y le saca el halo claro', () => {
    // Una columna intermedia entre el negro y el blanco, como deja un anti-aliasing.
    const antialiased = makeImage(40, 40, (x, y) => {
      if (y < 10 || y >= 30 || x < 10 || x >= 30) return WHITE
      if (x === 10) return [128, 128, 128]
      return BLACK
    })

    const result = removeFlatBackground(antialiased, { trim: false })

    const alpha = alphaAt(result.image, 10, 20)
    expect(alpha).toBeGreaterThan(0)
    expect(alpha).toBeLessThan(255)
    // Des-mezclado del blanco: el píxel de borde queda más oscuro que el gris original.
    expect(channelAt(result.image, 10, 20)).toBeLessThan(128)
  })

  it('tolera el ruido de compresión de un JPG sobre fondo blanco', () => {
    // Blanco "sucio": cada canal se aparta hasta 48 puntos (±24 del promedio): con tolerancia fija se rechazaba entero.
    let seed = 11
    const dirtyWhite = () => {
      seed = (seed * 16807) % 2147483647
      return 255 - (seed % 49)
    }
    const noisy = makeImage(60, 60, (x, y) =>
      x >= 20 && x < 40 && y >= 20 && y < 40 ? BLACK : [dirtyWhite(), dirtyWhite(), dirtyWhite()],
    )

    const result = removeFlatBackground(noisy, { trim: false })

    expect(result.applied).toBe(true)
    expect(alphaAt(result.image, 2, 2)).toBe(0)
    expect(alphaAt(result.image, 30, 30)).toBe(255)
    expect(result.removedShare).toBeGreaterThan(0.8)
  })

  it('no toca una imagen cuyo borde no es liso (una foto)', () => {
    let seed = 7
    const noise = () => {
      seed = (seed * 16807) % 2147483647
      return seed % 256
    }
    const photo = makeImage(40, 40, () => [noise(), noise(), noise()])

    const result = removeFlatBackground(photo)

    expect(result.applied).toBe(false)
    expect(result.reason).toBe(BACKGROUND_REASON.NO_FLAT_BACKGROUND)
    expect(result.image).toBe(photo)
  })

  it('no vuelve a procesar una imagen que ya es transparente', () => {
    const cutout = makeImage(40, 40, (x, y) =>
      x >= 10 && x < 30 && y >= 10 && y < 30 ? [10, 10, 10, 255] : [0, 0, 0, 0],
    )

    const result = removeFlatBackground(cutout)

    expect(result.applied).toBe(false)
    expect(result.reason).toBe(BACKGROUND_REASON.ALREADY_TRANSPARENT)
  })

  it('no borra todo si la imagen es de un solo color', () => {
    const flat = makeImage(24, 24, () => WHITE)

    const result = removeFlatBackground(flat)

    expect(result.applied).toBe(false)
    expect(result.reason).toBe(BACKGROUND_REASON.NOTHING_LEFT)
  })

  it('avisa cuando no había fondo que quitar', () => {
    // Borde liso pero el sujeto lo toca por todos lados: casi nada es alcanzable.
    const full = makeImage(24, 24, () => BLACK)
    const almost = makeImage(24, 24, (x, y) => (x === 0 && y === 0 ? WHITE : BLACK))

    expect(removeFlatBackground(full).applied).toBe(false)
    expect(removeFlatBackground(almost).applied).toBe(false)
  })
})

describe('trimTransparentMargins', () => {
  it('recorta al contenido visible con aire proporcional', () => {
    const image = makeImage(100, 60, (x, y) =>
      x >= 40 && x < 60 && y >= 20 && y < 40 ? [1, 2, 3, 255] : [0, 0, 0, 0],
    )

    const trimmed = trimTransparentMargins(image, 0.1)

    // 20px de sujeto + 2px de aire por lado.
    expect(trimmed.width).toBe(24)
    expect(trimmed.height).toBe(24)
    expect(trimmed.data.length).toBe(24 * 24 * 4)
  })

  it('deja igual una imagen sin nada visible', () => {
    const empty = makeImage(10, 10, () => [0, 0, 0, 0])
    expect(trimTransparentMargins(empty)).toBe(empty)
  })
})
