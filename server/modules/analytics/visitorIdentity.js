import { createHash } from 'node:crypto'

/**
 * visitorIdentity.js — PLU ARG
 *
 * Deriva el identificador de visitante que usa la analitica.
 *
 * La IP nunca se guarda: entra a un hash junto al user-agent y una sal que rota
 * cada dia, y se descarta. Eso da visitantes unicos dentro de la jornada sin
 * conservar el identificador de red, y hace que el historico no se pueda
 * recorrelacionar despues de la rotacion.
 *
 * El hash se calcula en el servidor y no en el navegador a proposito: un id
 * generado por el cliente es trivial de falsear, y con el se pueden inflar las
 * visitas de cualquier pagina.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Secreto de la sal. Se prefiere uno dedicado; si no existe se reusa
 * `AUTH_SECRET`, que ya es obligatorio para levantar el server. El literal
 * final solo aplica en desarrollo, donde la desanonimizacion no es un riesgo.
 */
function saltSecret(env) {
  return env.ANALYTICS_SALT_SECRET?.trim() || env.AUTH_SECRET?.trim() || 'plu-analytics-dev-salt'
}

/** Sal del dia: al cambiar, el mismo visitante deja de ser reconocible. */
export function dailySalt(env = process.env, now = new Date()) {
  const day = Math.floor(now.getTime() / DAY_MS)
  return `${saltSecret(env)}:${day}`
}

/**
 * IP del cliente. `x-vercel-forwarded-for` la escribe el edge y pisa lo que
 * mande el navegador; el `x-forwarded-for` crudo si es falsificable, asi que no
 * se lee directo (mismo criterio que `clientKey` en middleware/rateLimit.js).
 */
export function clientAddress(req) {
  const vercelIp = String(req.get?.('x-vercel-forwarded-for') ?? '')
    .split(',')[0]
    .trim()
  if (vercelIp) return vercelIp
  return req.ip ?? 'desconocido'
}

export function resolveVisitorId(req, { env = process.env, now = new Date() } = {}) {
  const userAgent = String(req.get?.('user-agent') ?? '').slice(0, 400)
  const language = String(req.get?.('accept-language') ?? '').slice(0, 80)

  return (
    createHash('sha256')
      .update(`${dailySalt(env, now)}|${clientAddress(req)}|${userAgent}|${language}`)
      .digest('hex')
      // 32 hex bastan para no colisionar en el orden de visitantes que maneja el
      // sitio y acortan la fila; el hash completo no aporta nada aca.
      .slice(0, 32)
  )
}

const BOT_PATTERN =
  /bot|crawler|spider|crawling|slurp|bingpreview|headless|lighthouse|pingdom|curl|wget|python-requests|axios/i

/**
 * Clasificacion de dispositivo y agente. Es deliberadamente gruesa: alcanza
 * para segmentar el informe y evita arrastrar una libreria de parsing de UA
 * (que ademas envejece mal) para un dato que solo se muestra agrupado.
 */
export function describeUserAgent(rawUserAgent) {
  const ua = String(rawUserAgent ?? '')
  if (!ua) return { deviceType: 'unknown', browser: null, os: null, isBot: false }
  if (BOT_PATTERN.test(ua)) return { deviceType: 'bot', browser: null, os: null, isBot: true }

  const isTablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)
  const isMobile =
    !isTablet && /mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)

  // El orden importa: Edge y Opera se anuncian tambien como Chrome, y Chrome
  // como Safari. De mayor a menor especificidad.
  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /samsungbrowser/i.test(ua)
        ? 'Samsung Internet'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /chrome|crios/i.test(ua)
            ? 'Chrome'
            : /safari/i.test(ua)
              ? 'Safari'
              : null

  const os = /windows/i.test(ua)
    ? 'Windows'
    : /android/i.test(ua)
      ? 'Android'
      : /iphone|ipad|ipod/i.test(ua)
        ? 'iOS'
        : /mac os x/i.test(ua)
          ? 'macOS'
          : /linux/i.test(ua)
            ? 'Linux'
            : null

  return {
    deviceType: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
    browser,
    os,
    isBot: false,
  }
}
