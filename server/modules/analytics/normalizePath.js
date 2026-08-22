const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERIC = /^\d+$/
const MEMBER_CODE = /^PLU-ARG-\d{4}-\d+$/i
// Token opaco o hash largo: no es un slug legible, es un identificador.
const OPAQUE = /^[0-9a-f]{24,}$/i

/**
 * Rutas cuyo ultimo segmento es contenido real y no un identificador. Sin esta
 * lista, `/eventos/pitbull-classic` se colapsaria en `/eventos/:slug` y se
 * perderia justo la pagina que mas interesa medir.
 */
const CONTENT_COLLECTIONS = new Set(['eventos', 'events', 'noticias', 'resultados', 'results'])

function normalizeSegment(segment, previousSegment) {
  // La ruta publica /canjear/:codigo se elimino, pero los QR ya repartidos
  // siguen apuntando ahi. El segmento es un codigo promocional —secreto de
  // negocio— y se redacta siempre, tenga la forma que tenga, para que no
  // quede legible en web_analytics.
  if (previousSegment === 'canjear') return ':code'
  if (UUID.test(segment)) return ':id'
  if (NUMERIC.test(segment)) return ':n'
  if (MEMBER_CODE.test(segment)) return ':memberCode'
  if (OPAQUE.test(segment)) return ':token'
  // Slug de contenido: se conserva tal cual para poder medirlo por separado.
  if (CONTENT_COLLECTIONS.has(previousSegment)) return segment
  return segment
}

/**
 * normalizePath — PLU ARG
 *
 * Agrupa rutas equivalentes para que el informe no se atomice en una fila por
 * identificador. `/mi-cuenta/orden/6f3b...` y `/mi-cuenta/orden/9a1c...` son la
 * misma pantalla y tienen que contarse juntas.
 *
 * Se resuelve en el servidor y no en el tracker: la ruta es la clave de
 * agregacion de todo el sistema, y dejarla en manos del cliente permitiria
 * inflar o partir las metricas de cualquier pagina.
 *
 * La querystring se descarta entera. Los parametros de campaña (`utm_*`) viajan
 * por separado en el contexto de la sesion; el resto puede traer datos
 * personales (un email en un link de recuperacion) que no deben persistirse.
 */
export function normalizePath(rawPath) {
  const value = String(rawPath ?? '').trim()
  if (!value) return '/'

  let pathname = value
  try {
    // Acepta tanto '/ruta?x=1' como una URL absoluta.
    pathname = new URL(value, 'https://plu.local').pathname
  } catch {
    pathname = value.split('?')[0].split('#')[0]
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return '/'

  const normalized = segments.map((segment, index) =>
    normalizeSegment(decodeSafe(segment), index > 0 ? segments[index - 1].toLowerCase() : null),
  )

  // Techo de longitud: una ruta absurdamente larga solo puede venir de un
  // cliente manipulado y no aporta nada al informe.
  return `/${normalized.join('/')}`.slice(0, 300).toLowerCase()
}

function decodeSafe(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** Host del referrer, sin path ni query: interesa la fuente, no la URL exacta. */
export function normalizeReferrerHost(rawReferrer, appUrl) {
  const value = String(rawReferrer ?? '').trim()
  if (!value) return null
  try {
    const { hostname } = new URL(value)
    if (!hostname) return null
    // La navegacion interna no es una fuente de trafico.
    if (appUrl) {
      try {
        if (hostname === new URL(appUrl).hostname) return null
      } catch {
        // appUrl mal configurada: se prefiere registrar el host a perderlo.
      }
    }
    return hostname
      .replace(/^www\./i, '')
      .slice(0, 120)
      .toLowerCase()
  } catch {
    return null
  }
}
