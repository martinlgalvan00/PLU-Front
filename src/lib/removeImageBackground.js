/**
 * Quita de fondo para logos: relleno desde los bordes sobre un fondo liso.
 *
 * No es un modelo de segmentación: un logo casi siempre vive sobre blanco, negro
 * o un color plano, y para eso alcanza (y sale instantáneo, sin red, sin
 * dependencias y sin mandar la imagen a un tercero). Si el borde no es liso --
 * una foto, un degradé -- no toca nada y lo avisa, en vez de comerse el sujeto.
 *
 * Todo el núcleo trabaja sobre `{ data, width, height }` (el shape de ImageData)
 * para poder probarse sin canvas; `removeImageBackground` es el envoltorio que
 * rasteriza un File.
 */

/** Distancia RGB hasta la que un píxel se considera fondo (transparente del todo). */
export const BACKGROUND_TOLERANCE = 30
/** Techo de la tolerancia adaptativa: más allá se empieza a comer el sujeto. */
const MAX_TOLERANCE = 52
/** Qué parte del borde tiene que parecerse al fondo para tratarlo como liso. */
const FLAT_BORDER_MIN_SHARE = 0.85
/** Con más de esto ya transparente, la imagen ya viene recortada: no se toca. */
const ALREADY_TRANSPARENT_SHARE = 0.03
/** Debajo de esto no hubo fondo que quitar. */
const MIN_REMOVED_SHARE = 0.01
/** Debajo de esto quedó casi nada: el "fondo" era el sujeto. */
const MIN_REMAINING_SHARE = 0.005
/** Aire que se deja alrededor del sujeto al recortar, sobre su lado largo. */
const TRIM_PADDING_SHARE = 0.04
const ALPHA_VISIBLE = 8
const MAX_DISTANCE = Math.ceil(Math.sqrt(3 * 255 * 255))

export const BACKGROUND_REASON = Object.freeze({
  APPLIED: 'applied',
  ALREADY_TRANSPARENT: 'already-transparent',
  NO_FLAT_BACKGROUND: 'no-flat-background',
  NOTHING_REMOVED: 'nothing-removed',
  NOTHING_LEFT: 'nothing-left',
  UNSUPPORTED: 'unsupported',
})

function colorDistance(data, offset, color) {
  const dr = data[offset] - color[0]
  const dg = data[offset + 1] - color[1]
  const db = data[offset + 2] - color[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function forEachBorderIndex(width, height, visit) {
  for (let x = 0; x < width; x += 1) {
    visit(x)
    if (height > 1) visit((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    visit(y * width)
    if (width > 1) visit(y * width + width - 1)
  }
}

/** Color más repetido del borde (cuantizado a 5 bits), promediado con sus miembros. */
function dominantBorderColor(data, width, height) {
  const buckets = new Map()
  forEachBorderIndex(width, height, (index) => {
    const offset = index * 4
    if (data[offset + 3] < 250) return
    const key = ((data[offset] >> 3) << 10) | ((data[offset + 1] >> 3) << 5) | (data[offset + 2] >> 3)
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += data[offset]
    bucket.g += data[offset + 1]
    bucket.b += data[offset + 2]
    buckets.set(key, bucket)
  })
  let best = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket
  }
  if (!best) return null
  return [best.r / best.count, best.g / best.count, best.b / best.count]
}

function transparentShare(data, pixelCount) {
  let transparent = 0
  for (let index = 0; index < pixelCount; index += 1) {
    if (data[index * 4 + 3] < 250) transparent += 1
  }
  return transparent / pixelCount
}

/** Recorta al sujeto con un margen proporcional. Sin sujeto visible, devuelve igual. */
export function trimTransparentMargins(image, paddingShare = TRIM_PADDING_SHARE) {
  const { data, width, height } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_VISIBLE) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return image

  const padding = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * paddingShare)
  const left = Math.max(0, minX - padding)
  const top = Math.max(0, minY - padding)
  const right = Math.min(width - 1, maxX + padding)
  const bottom = Math.min(height - 1, maxY + padding)
  const nextWidth = right - left + 1
  const nextHeight = bottom - top + 1
  if (nextWidth === width && nextHeight === height) return image

  const out = new Uint8ClampedArray(nextWidth * nextHeight * 4)
  for (let y = 0; y < nextHeight; y += 1) {
    const from = ((top + y) * width + left) * 4
    out.set(data.subarray(from, from + nextWidth * 4), y * nextWidth * 4)
  }
  return { data: out, width: nextWidth, height: nextHeight }
}

/**
 * Quita el fondo liso de una imagen. Devuelve `{ applied, reason, image, removedShare }`;
 * `image` es siempre un `{ data, width, height }` utilizable (el original si no se aplicó).
 */
export function removeFlatBackground(
  image,
  { tolerance: baseTolerance = BACKGROUND_TOLERANCE, trim = true } = {},
) {
  const { width, height } = image
  const source = image.data
  const pixelCount = width * height
  const skip = (reason) => ({ applied: false, reason, image, removedShare: 0 })

  if (!pixelCount) return skip(BACKGROUND_REASON.UNSUPPORTED)
  if (transparentShare(source, pixelCount) > ALREADY_TRANSPARENT_SHARE) {
    return skip(BACKGROUND_REASON.ALREADY_TRANSPARENT)
  }

  const background = dominantBorderColor(source, width, height)
  if (!background) return skip(BACKGROUND_REASON.NO_FLAT_BACKGROUND)

  // Un JPG nunca es plano del todo: el ruido de compresión corre el "blanco" unos
  // puntos. Se mide cuánto se aparta el borde del fondo y la tolerancia se abre
  // en proporción, así un logo limpio no pierde detalle y uno ruidoso no deja motas.
  let noiseSquares = 0
  let noiseSamples = 0
  forEachBorderIndex(width, height, (index) => {
    const distance = colorDistance(source, index * 4, background)
    if (distance <= baseTolerance) {
      noiseSquares += distance * distance
      noiseSamples += 1
    }
  })
  const noise = noiseSamples ? Math.sqrt(noiseSquares / noiseSamples) : 0
  const tolerance = Math.min(MAX_TOLERANCE, baseTolerance + noise * 2)

  let borderTotal = 0
  let borderMatching = 0
  forEachBorderIndex(width, height, (index) => {
    borderTotal += 1
    if (colorDistance(source, index * 4, background) <= tolerance) borderMatching += 1
  })
  if (borderMatching / borderTotal < FLAT_BORDER_MIN_SHARE) {
    return skip(BACKGROUND_REASON.NO_FLAT_BACKGROUND)
  }

  // Relleno por 4 vecinos desde los píxeles de borde que son fondo. Lo que queda
  // encerrado por el sujeto (el hueco de una "O") no se alcanza y se conserva.
  const removed = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let head = 0
  let tail = 0
  const enqueue = (index) => {
    if (removed[index] || colorDistance(source, index * 4, background) > tolerance) return
    removed[index] = 1
    queue[tail] = index
    tail += 1
  }
  forEachBorderIndex(width, height, enqueue)
  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width
    if (x > 0) enqueue(index - 1)
    if (x < width - 1) enqueue(index + 1)
    if (index >= width) enqueue(index - width)
    if (index < pixelCount - width) enqueue(index + width)
  }

  const removedShare = tail / pixelCount
  if (removedShare < MIN_REMOVED_SHARE) return skip(BACKGROUND_REASON.NOTHING_REMOVED)
  if (1 - removedShare < MIN_REMAINING_SHARE) return skip(BACKGROUND_REASON.NOTHING_LEFT)

  // A qué distancia del fondo está, típicamente, el sujeto: sirve para estimar
  // cuánto de un píxel de borde es sujeto y cuánto fondo mezclado (anti-aliasing).
  const histogram = new Uint32Array(MAX_DISTANCE + 1)
  let remaining = 0
  for (let index = 0; index < pixelCount; index += 1) {
    if (removed[index]) continue
    histogram[Math.min(MAX_DISTANCE, Math.round(colorDistance(source, index * 4, background)))] += 1
    remaining += 1
  }
  let accumulated = 0
  let subjectDistance = tolerance * 2
  for (let distance = 0; distance <= MAX_DISTANCE; distance += 1) {
    accumulated += histogram[distance]
    if (accumulated >= remaining * 0.75) {
      subjectDistance = Math.max(distance, tolerance * 2)
      break
    }
  }
  const ramp = Math.max(1, subjectDistance * 0.9 - tolerance)

  const out = new Uint8ClampedArray(source)
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    if (removed[index]) {
      out[offset + 3] = 0
      continue
    }
    const x = index % width
    const y = (index - x) / width
    let touchesBackground = false
    for (let dy = -1; dy <= 1 && !touchesBackground; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (removed[ny * width + nx]) {
          touchesBackground = true
          break
        }
      }
    }
    if (!touchesBackground) continue

    // Borde: la opacidad sale de qué tan lejos del fondo está el píxel, y el color
    // se "des-mezcla" del fondo para que no quede un halo claro alrededor.
    const distance = colorDistance(source, offset, background)
    const alpha = Math.min(1, Math.max(0, (distance - tolerance) / ramp))
    out[offset + 3] = Math.round(alpha * source[offset + 3])
    if (alpha > 0 && alpha < 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const value = background[channel] + (source[offset + channel] - background[channel]) / alpha
        out[offset + channel] = Math.max(0, Math.min(255, Math.round(value)))
      }
    }
  }

  const result = { data: out, width, height }
  return {
    applied: true,
    reason: BACKGROUND_REASON.APPLIED,
    image: trim ? trimTransparentMargins(result) : result,
    removedShare,
  }
}

function replaceExtension(fileName, extension) {
  const base = String(fileName ?? 'logo')
    .trim()
    .replace(/\.[^.]+$/, '')
  return `${base || 'logo'}.${extension}`
}

/** Decodifica una vez y deja la imagen en un canvas acotado a `maxEdge`. */
async function rasterize(file, maxEdge) {
  if (!file?.type?.startsWith('image/')) return null
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close?.()
    return null
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  return { canvas, context, width, height }
}

/**
 * ¿Esta imagen tiene un fondo liso que se pueda quitar? Mira una miniatura, así
 * que sirve para decidir si ofrecer la acción sobre un logo ya subido sin pagar
 * el costo de procesarlo.
 */
export async function hasRemovableBackground(file) {
  const raster = await rasterize(file, 256)
  if (!raster) return false
  const outcome = removeFlatBackground(raster.context.getImageData(0, 0, raster.width, raster.height), {
    trim: false,
  })
  return outcome.applied
}

/**
 * Quita el fondo de un File de imagen y lo entrega ya listo para subir: recortado
 * al sujeto, a `outputEdge` de lado largo y en WebP. Se decodifica una sola vez y
 * se codifica una sola vez; no hay PNG intermedio ni segunda pasada de compresión.
 *
 * Si el entorno no puede rasterizar o la imagen no tiene un fondo liso, devuelve
 * el mismo File con `applied: false` y el motivo, para que la pantalla pueda
 * explicarlo. `maxEdge` acota el trabajo del relleno, que es lineal en píxeles.
 */
export async function removeImageBackground(
  file,
  { maxEdge = 1024, outputEdge = 512, quality = 0.92, tolerance } = {},
) {
  const unsupported = { file, applied: false, reason: BACKGROUND_REASON.UNSUPPORTED }
  const raster = await rasterize(file, maxEdge)
  if (!raster) return unsupported

  const outcome = removeFlatBackground(
    raster.context.getImageData(0, 0, raster.width, raster.height),
    tolerance ? { tolerance } : {},
  )
  if (!outcome.applied) return { file, applied: false, reason: outcome.reason }

  const { image } = outcome
  const cutout = document.createElement('canvas')
  cutout.width = image.width
  cutout.height = image.height
  cutout.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0)

  // Se baja al tamaño final desde el recorte (no desde el original): el sujeto
  // ocupa todo el cuadro, así que no se gastan píxeles en margen.
  const scale = Math.min(1, outputEdge / Math.max(image.width, image.height))
  const target = document.createElement('canvas')
  target.width = Math.max(1, Math.round(image.width * scale))
  target.height = Math.max(1, Math.round(image.height * scale))
  const targetContext = target.getContext('2d')
  targetContext.imageSmoothingQuality = 'high'
  targetContext.drawImage(cutout, 0, 0, target.width, target.height)

  const blob = await new Promise((resolve) => target.toBlob(resolve, 'image/webp', quality))
  if (!blob || blob.size === 0) return unsupported
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/png'
  return {
    file: new File([blob], replaceExtension(file.name, type === 'image/webp' ? 'webp' : 'png'), {
      type,
      lastModified: Date.now(),
    }),
    applied: true,
    reason: BACKGROUND_REASON.APPLIED,
  }
}
