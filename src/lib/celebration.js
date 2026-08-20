/**
 * celebration.js — PLU ARG
 *
 * Reglas de cuándo la federación festeja. Son tres momentos y solo tres:
 * la afiliación queda acreditada, la credencial con QR se emite, la
 * inscripción a un meet queda confirmada. Ninguno es un estado pendiente:
 * festejar un pago que el banco todavía puede rechazar es peor que no
 * festejar nada.
 *
 * El módulo existe para que la decisión no viva repartida en cinco
 * componentes. `shouldCelebrate()` es la única puerta: si devuelve false no
 * se monta ni un nodo de la ráfaga.
 *
 * `CELEBRATION_ENABLED` es el interruptor general. Apagarlo deja intacta la
 * secuencia de sello, credencial y QR —la confirmación nunca dependió de las
 * partículas— y solo saca la ráfaga.
 */

/** Interruptor general de la ráfaga. En false queda solo el sello. */
export const CELEBRATION_ENABLED = true

/** Momentos que la federación reconoce como cierre de un trámite. */
export const CELEBRATION_MOMENTS = ['membership', 'credential', 'registration']

const STORAGE_PREFIX = 'plu.celebrated.'

/**
 * Piezas por tier de dispositivo. La ráfaga nunca desaparece por tier —eso lo
 * decide `prefers-reduced-motion`—, solo baja de densidad: en un equipo
 * limitado 30 nodos animándose a la vez compiten con el render de la
 * credencial, que sí es el contenido.
 */
const PIECES_BY_TIER = { high: 30, mid: 20, low: 12 }

export function celebrationPieceCount(tier = 'high') {
  return PIECES_BY_TIER[tier] ?? PIECES_BY_TIER.high
}

/**
 * PRNG determinista (mulberry32). La ráfaga tiene que verse orgánica pero
 * idéntica en cada render: con `Math.random` el mismo momento salía distinto
 * en cada montaje, los tests de render no podían afirmar nada y Storybook
 * cambiaba de captura sin que nadie tocara código.
 */
function mulberry32(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Reparto de color: oro dominante, celeste de acompañamiento, y un papel
 * "plata" que toma el color del texto —así se ve en los dos temas—. La primera
 * versión usaba `--color-text-muted` para ese tercio y sobre grafito era
 * literalmente invisible: un tercio de la ráfaga no existía.
 */
const PIECE_TONES = ['gold', 'gold', 'celeste', 'gold', 'silver', 'gold', 'celeste', 'gold']

/**
 * Geometría de la ráfaga.
 *
 * Devuelve multiplicadores unitarios en vez de píxeles: el alcance y el tamaño
 * de la pieza los pone el CSS con `clamp()`, así la misma tabla sirve en 360px
 * y en 1920px sin recalcular nada en JS. Sin esta separación la primera versión
 * usaba tamaños fijos de 3 a 6px y en desktop la ráfaga se leía como polvo.
 *
 * El movimiento no es radial: cada pieza sube en abanico hasta un apex y de ahí
 * cae. Una ráfaga puramente radial se lee como explosión de partículas; el arco
 * con gravedad se lee como papel. El abanico va de −155° a −25° (nunca más de
 * 65° sobre la horizontal) para que el papel no se escape por el borde superior
 * cuando el sello está arriba de la pantalla.
 */
export function buildCelebrationPieces(count = 30, seed = 0x504c55) {
  const random = mulberry32(seed)
  const pieces = []

  for (let index = 0; index < count; index += 1) {
    // Abanico determinista con jitter: el reparto parejo evita huecos y el
    // jitter evita que se lea como un patrón de radios.
    const spread = -155 + (130 * index) / Math.max(1, count - 1)
    const angle = ((spread + (random() - 0.5) * 16) * Math.PI) / 180

    pieces.push({
      id: `piece-${index}`,
      px: Number(Math.cos(angle).toFixed(4)),
      // La componente vertical va comprimida: el apex queda más bajo que el
      // alcance horizontal y la caída tiene lugar dentro del viewport.
      py: Number((Math.sin(angle) * 0.78).toFixed(4)),
      // Alcance relativo: el borde de la ráfaga no es un círculo perfecto.
      reach: Number((0.66 + random() * 0.34).toFixed(3)),
      fall: Number((0.9 + random() * 0.85).toFixed(3)),
      spin: Math.round(-260 + random() * 520),
      // Múltiplos de la unidad de papel (ver --celebration-unit en el CSS).
      width: Number((0.9 + random() * 0.7).toFixed(2)),
      height: Number((2 + random() * 1.4).toFixed(2)),
      delay: Math.round(random() * 160),
      duration: Math.round(1000 + random() * 380),
      tone: PIECE_TONES[index % PIECE_TONES.length],
    })
  }

  return pieces
}

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`
}

/**
 * ¿Este momento ya se festejó? Solo aplica a superficies que la persona
 * vuelve a visitar (la credencial en su cuenta). Sin esto el QR festejaba
 * cada vez que alguien entraba a ver su código, y un festejo que se repite
 * deja de ser un festejo.
 *
 * Ante cualquier problema de storage devuelve `true` (ya festejado): preferimos
 * perder una ráfaga antes que repetirla en loop.
 */
export function hasCelebrated(key) {
  if (!key) return false
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(storageKey(key)) === '1'
  } catch {
    return true
  }
}

export function markCelebrated(key) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(key), '1')
  } catch {
    // Modo privado o cuota llena: el festejo puede repetirse una vez más.
  }
}

/**
 * La única puerta de la ráfaga.
 *
 * @param {object} options
 * @param {boolean} options.active        El hecho está confirmado de verdad.
 * @param {boolean} options.reducedMotion La persona pidió menos movimiento.
 * @param {string} [options.playKey]      Clave de "una sola vez", si aplica.
 */
export function shouldCelebrate({ active, reducedMotion, playKey } = {}) {
  if (!CELEBRATION_ENABLED) return false
  if (!active || reducedMotion) return false
  if (playKey && hasCelebrated(playKey)) return false
  return true
}
