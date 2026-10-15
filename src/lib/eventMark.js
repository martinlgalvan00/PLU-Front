import pitbullEmblem from '../assets/brand/logo-pitbullclassic2.png'

/**
 * Marca visual de un evento para el panel.
 *
 * El logo propio del evento manda. Si no existe, Pitbull conserva su asset
 * editorial y el resto cae a un monograma con iniciales.
 */
const BRAND_LOGOS = [{ test: /pitbull/i, src: pitbullEmblem }]

export function resolveEventLogo(event) {
  if (!event) return null
  if (event.logoUrl) return event.logoUrl
  const haystack = `${event.slug ?? ''} ${event.title ?? ''}`
  return BRAND_LOGOS.find((brand) => brand.test.test(haystack))?.src ?? null
}

const SKIPPED_WORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'the', 'of'])

/** Iniciales para el monograma: dos letras, sin años ni conectores. */
export function eventInitials(title) {
  const words = String(title ?? '')
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter((word) => word && !SKIPPED_WORDS.has(word.toLowerCase()))
  if (!words.length) return '·'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}
