/**
 * Colores propios de una landing — PLU ARG
 *
 * El staff elige hasta tres colores por evento (`accent`, `action` y
 * `background`, en `#rrggbb`). Todo lo demás se deriva de ellos para que la
 * landing nunca quede ilegible: el texto sale del fondo (blanco o grafito, el de
 * mayor contraste WCAG) y el hover del botón se mezcla con blanco.
 *
 * Sin colores propios no se inyecta nada y rige el tema del evento.
 */

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

export const LANDING_PALETTE_KEYS = Object.freeze(['accent', 'action', 'background'])

export function normalizeLandingPalette(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const palette = {}
  for (const key of LANDING_PALETTE_KEYS) {
    const value = String(source[key] ?? '').trim()
    if (HEX_PATTERN.test(value)) palette[key] = value.toLowerCase()
  }
  return palette
}

function channel(hex, index) {
  return Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
}

/** Luminancia relativa WCAG de un `#rrggbb`. */
export function relativeLuminance(hex) {
  const [r, g, b] = [0, 1, 2].map((index) => {
    const value = channel(hex, index)
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste WCAG entre dos `#rrggbb` (1 a 21). */
export function contrastRatio(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** Texto legible sobre un fondo: blanco o grafito, el de mayor contraste. */
export function readableTextOn(hex) {
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#14181f') ? '#ffffff' : '#14181f'
}

function mix(a, b, weight) {
  const out = [0, 1, 2].map((index) => {
    const value = Math.round(
      channel(a, index) * 255 * (1 - weight) + channel(b, index) * 255 * weight,
    )
    return value.toString(16).padStart(2, '0')
  })
  return `#${out.join('')}`
}

/**
 * Avisos de legibilidad de la paleta elegida. No bloquean: el staff decide, pero
 * se entera de que un acento no se lee sobre el fondo o un botón queda ilegible.
 * @returns {{ code: 'accentOnBackground' | 'actionOnBackground', ratio: number }[]}
 */
export function paletteContrastWarnings(palette, fallbackBackground = '#0d0f12') {
  const normalized = normalizeLandingPalette(palette)
  const background = normalized.background ?? fallbackBackground
  const warnings = []
  if (normalized.accent) {
    const ratio = contrastRatio(normalized.accent, background)
    if (ratio < 3) warnings.push({ code: 'accentOnBackground', ratio })
  }
  if (normalized.action) {
    const ratio = contrastRatio(normalized.action, background)
    if (ratio < 3) warnings.push({ code: 'actionOnBackground', ratio })
  }
  return warnings
}

/**
 * Variables CSS de la paleta para el `style` del `<main>` de la landing. Sin
 * colores propios devuelve `{}` y rige el tema elegido. El texto se deriva del
 * fondo (blanco o grafito) para que nunca quede ilegible por una mala elección.
 * `withBackground: false` aplica solo acento y botón (plantillas con diseño fijo).
 */
export function landingPaletteStyle(layout, { withBackground = true } = {}) {
  const palette = normalizeLandingPalette(layout?.palette)
  const style = {}
  if (palette.accent) {
    style['--event-accent'] = palette.accent
    style['--event-accent-soft'] = `${palette.accent}2e`
    style['--event-accent-glow'] = `${palette.accent}59`
  }
  if (palette.action) {
    style['--event-action'] = palette.action
    style['--event-action-hover'] = mix(palette.action, '#ffffff', 0.14)
    style['--event-action-text'] = readableTextOn(palette.action)
  }
  if (palette.background && withBackground) {
    const text = readableTextOn(palette.background)
    style['--color-bg'] = palette.background
    style['--color-text'] = text
    style['--color-text-secondary'] = mix(palette.background, text, 0.72)
    style['--color-border-subtle'] = mix(palette.background, text, 0.16)
    style['--lb-surface'] = mix(palette.background, text, 0.06)
  }
  return style
}
