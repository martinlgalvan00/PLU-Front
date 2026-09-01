import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { createSharedStore } from '../lib/defense/sharedRateLimitStore.js'

/**
 * rateLimit.js — PLU ARG
 *
 * Presets compartidos, nombrados por nivel de riesgo (no uno por endpoint) --
 * antes cada route file definía su propio `rateLimit(...)` inline, con
 * configs inconsistentes (ej. `payments.js` usaba `standardHeaders: 'draft-8'`
 * mientras el resto usaba `true`) y varios endpoints públicos quedaban sin
 * ningún límite (el más grave: GET /api/tickets/verify/:qrToken, que permitía
 * enumerar QR tokens sin fricción).
 *
 * ── Estado compartido ─────────────────────────────────────────────────────
 *
 * Estos límites corrían sobre el store en memoria de express-rate-limit, que no
 * comparte nada entre procesos. En Vercel cada request concurrente puede
 * aterrizar en una instancia nueva con el contador en cero, así que el límite
 * real no era el número configurado sino ese número por instancia -- y la
 * cantidad de instancias la elige quien ataca, subiendo la concurrencia. Los
 * números de acá estaban bien pensados y en producción no se aplicaban.
 *
 * Ahora cada preset lleva un store respaldado en Postgres
 * (`lib/defense/sharedRateLimitStore.js`), que cuenta primero en memoria y sólo
 * sincroniza cuando hace falta, para no pagar una consulta por request en el
 * plan gratuito. Cuando no hay Supabase configurado -- o en los tests -- cae al
 * store en memoria de siempre y el comportamiento no cambia.
 */

/**
 * Clave de conteo. `x-vercel-forwarded-for` la escribe el edge de Vercel y
 * pisa cualquier valor que mande el cliente, asi que no es falsificable; el
 * `X-Forwarded-For` crudo si lo es, y por eso no se lee directo. Fuera de
 * Vercel cae en req.ip, que es confiable segun el `trust proxy` de app.js.
 *
 * `ipKeyGenerator` normaliza IPv6 a subnet (/56 por default) para que un
 * cliente no evada el límite rotando dentro del mismo prefijo. express-rate-limit
 * v8 exige esto en keyGenerators custom que caen a IP.
 *
 * Sin esto -- y sin trust proxy -- todos los clientes compartian una unica
 * clave: el limite se volvia global y alcanzaba con que una sola IP lo agotara
 * para dejar sin login a todo el mundo.
 */
function clientKey(req) {
  const vercelClientIp = String(req.get('x-vercel-forwarded-for') ?? '')
    .split(',')[0]
    .trim()

  if (vercelClientIp) return ipKeyGenerator(vercelClientIp)
  if (req.ip) return ipKeyGenerator(req.ip)
  return 'desconocido'
}

/**
 * @param {string} name Prefijo del balde compartido. Separa los presets entre sí
 *   en la tabla: sin esto, una IP que agota el límite de analítica se llevaría
 *   puesto también su cupo de login.
 * @param {'strict'|'sampled'} mode Cada cuánto se sincroniza con la base.
 *   `strict` va a la base en cada hit y se reserva para lo que se cuenta de a
 *   poco (login, checkout, código de acceso); `sampled` acumula y sincroniza por
 *   lotes, para el volumen alto donde interesa frenar abuso, no contar exacto.
 */
function buildLimiter(windowMs, limit, message, { name, mode = 'sampled' } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    message: { error: message },
    store: name ? createSharedStore({ name, mode }) : undefined,
  })
}

// Login de staff y /oauth/session -- ventana larga, límite bajo, ya calibrado.
export const authLimiter = buildLimiter(
  15 * 60 * 1000,
  20,
  'Demasiados intentos. Proba de nuevo en unos minutos.',
  { name: 'auth', mode: 'strict' },
)

/**
 * Login de atleta. Limiter propio y NO `authLimiter`: el cliente prueba
 * primero el login de staff y recién ante un 401 cae al de atleta
 * (useAppData.login), así que compartir la instancia hacía que cada intento
 * legítimo gastara dos cupos del mismo contador -- unos 10 logins por IP cada
 * 15 minutos para todo el padrón. Detrás del NAT de un gimnasio o del wifi de
 * un venue eso dejaba gente afuera, y el 429 se mostraba como "credenciales
 * inválidas".
 *
 * El volumen es más alto que el de staff porque la superficie es distinta: son
 * atletas compartiendo salida a internet, no un puñado de cuentas operativas.
 */
export const athleteAuthLimiter = buildLimiter(
  15 * 60 * 1000,
  40,
  'Demasiados intentos. Proba de nuevo en unos minutos.',
  { name: 'athlete-auth', mode: 'strict' },
)

// Escritura pública sin auth: registro de atleta, alta de orden de membresía.
export const publicWriteLimiter = buildLimiter(
  10 * 60 * 1000,
  30,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
  { name: 'public-write', mode: 'strict' },
)

// Compra de tickets -- más alto que publicWriteLimiter a propósito: una
// compra cubre hasta 8 asistentes en un solo flujo.
export const ticketPublicWriteLimiter = buildLimiter(
  10 * 60 * 1000,
  40,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
  { name: 'ticket-write', mode: 'strict' },
)

// Lecturas públicas sin auth (verificación de QR, estado de pago con
// polling durante checkout, catálogo de planes) -- ventana corta y volumen
// generoso, pensado para no frenar el polling legítimo del frontend.
export const publicReadLimiter = buildLimiter(
  60 * 1000,
  60,
  'Demasiadas solicitudes. Proba de nuevo en un momento.',
  { name: 'public-read', mode: 'sampled' },
)

// Checkout: preferencias de pago, checkout embebido, suscripciones.
export const checkoutLimiter = buildLimiter(
  15 * 60 * 1000,
  30,
  'Demasiados intentos de checkout. Probá nuevamente en unos minutos.',
  { name: 'checkout', mode: 'strict' },
)

/**
 * Telemetría del Brick. Limiter propio y NO `checkoutLimiter`: es diagnóstico
 * best-effort que se dispara justo cuando el checkout viene fallando, así que
 * compartir el balde con /preferences y /embedded/process hacía que cada error
 * de render gastara cupo de pago. Con el Brick reintentando, el atleta agotaba
 * el límite y recibía "Demasiados intentos de checkout" sin haber llegado a
 * enviar un solo pago: el reporte del problema se comía la posibilidad de
 * resolverlo.
 *
 * Ventana corta y volumen acotado -- alcanza para instrumentar una sesión de
 * checkout con problemas y sigue frenando un cliente que loopee reportando.
 */
export const paymentTelemetryLimiter = buildLimiter(
  5 * 60 * 1000,
  30,
  'Demasiados reportes de checkout. Proba de nuevo en unos minutos.',
  { name: 'payment-telemetry', mode: 'sampled' },
)

/**
 * Ingesta de analitica. Volumen alto por diseño: un lote cada pocos segundos
 * por pestaña activa, y varias personas detras del mismo NAT (wifi del gimnasio
 * o del venue) comparten clave.
 *
 * El limite existe para frenar a alguien inflando metricas a mano, no para
 * regular navegacion legitima. Por eso es holgado, y por eso la ingesta jamas
 * comparte instancia con endpoints de negocio: un 429 de analitica no puede
 * dejar a nadie sin poder afiliarse ni pagar.
 */
export const analyticsIngestLimiter = buildLimiter(
  60 * 1000,
  120,
  'Demasiados eventos de analitica. Proba de nuevo en un momento.',
  { name: 'analytics', mode: 'sampled' },
)

/**
 * Presencia en vivo del panel. Limiter propio y NO `staffLimiter`: es el único
 * endpoint staff que se consulta en bucle (auto-refresco cada 15s mientras dura
 * un evento), y compartir balde con el resto del panel hacía que una sola
 * pestaña abierta durante una hora se comiera 240 de los 900 cupos que usa todo
 * el equipo para escanear en puerta.
 *
 * El volumen tolera varias pestañas por operador y sigue frenando un cliente
 * que loopee sin intervalo.
 */
export const liveLimiter = buildLimiter(
  60 * 1000,
  60,
  'Demasiadas consultas en vivo. Proba de nuevo en un momento.',
  { name: 'live', mode: 'sampled' },
)

// Escrituras con cookie de atleta ya autenticada (editar perfil, foto) --
// más generoso que publicWriteLimiter porque ya pasó por requireAthleteSession.
export const athleteWriteLimiter = buildLimiter(
  10 * 60 * 1000,
  60,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
  { name: 'athlete-write', mode: 'sampled' },
)

/**
 * Verificación del código de una tanda privada. Limiter propio y estrecho, no
 * `athleteWriteLimiter`: este endpoint compara una contraseña compartida y
 * responde válido/inválido sin crear ninguna orden. Con el balde de escritura
 * de atleta (60 cada 10 min) alcanzaba para barrer un código débil; acá queda
 * en un puñado de intentos por IP. La otra superficie donde se prueban códigos
 * en loop —los promocionales— tiene su propio balde (`promotionCodeLimiter`).
 *
 * El límite es por IP y no por atleta a propósito: el código lo comparte la
 * organización, así que el abuso esperable es una sola máquina probando, no un
 * atleta olvidándose del suyo.
 */
export const registrationAccessCodeLimiter = buildLimiter(
  15 * 60 * 1000,
  15,
  'Demasiados intentos con el código de acceso. Proba de nuevo en unos minutos.',
  { name: 'access-code', mode: 'strict' },
)

/**
 * Validación y canje de códigos promocionales (`/me/discount-preview`,
 * `/me/codes/redeem`, `/me/offer-unlocks`). Limiter propio y NO
 * `publicWriteLimiter`, por las dos puntas del mismo problema:
 *
 *   - Enumeración: estos endpoints responden existe/no-existe (con motivo)
 *     para cualquier string, así que los 30 cada 10 minutos de la escritura
 *     pública dejaban un barrido de diccionario demasiado barato.
 *   - Auto-DoS: el balde compartido era el mismo del alta de órdenes; un
 *     atleta que probaba códigos se quedaba sin cupo para pagar.
 *
 * Más holgado que `registrationAccessCodeLimiter` porque el flujo legítimo es
 * charlatán: aplicar un código de combo son ~3 requests (resolvedor + dos
 * previews) y cada cambio de medio de pago recotiza. El corte fuerte contra
 * la enumeración es por cuenta (identityGuard, scope `access_code`), que
 * bloquea a los pocos intentos inexistentes sin importar cuántas IPs roten.
 */
export const promotionCodeLimiter = buildLimiter(
  15 * 60 * 1000,
  30,
  'Demasiados intentos con códigos. Proba de nuevo en unos minutos.',
  { name: 'promotion-code', mode: 'strict' },
)

/**
 * Preview de precio SIN código: la consulta de la promo pública que el
 * checkout dispara en cada montaje y en cada cambio de canal o de paquete.
 * No viaja ningún código, así que no puede enumerar nada — y compartir el
 * balde estricto de arriba hacía que mirar el checkout y alternar medios de
 * pago un rato agotara los 30 intentos por IP: el canje legítimo que venía
 * después respondía 429. Balde propio, ventana corta y volumen de lectura,
 * como las demás consultas de sólo lectura del checkout.
 */
export const publicPromoPreviewLimiter = buildLimiter(
  60 * 1000,
  30,
  'Demasiadas consultas de precio. Proba de nuevo en un momento.',
  { name: 'promo-preview', mode: 'sampled' },
)

/**
 * Webhook de Mercado Pago. No tenía límite: un request con `id`/`data.id`
 * que pasa el schema pero falla la firma igual dispara un insert de
 * auditoría (`rejectWebhook`) antes de rechazarse, así que spam sin
 * autenticar podía amplificarse en escrituras. Ventana corta y volumen
 * generoso a propósito -- MP reintenta agresivo desde su propia infraestructura
 * y varios merchants pueden compartir salida, así que el límite es para frenar
 * abuso externo, no para regular el tráfico real de MP.
 */
export const webhookLimiter = buildLimiter(
  60 * 1000,
  120,
  'Demasiadas notificaciones. Proba de nuevo en un momento.',
  { name: 'webhook', mode: 'sampled' },
)

// Todo lo staff-only: ya protegido por rol (requireRole), este límite es
// defensa en profundidad ante una cuenta comprometida o un script/bug de
// polling descontrolado en el panel admin, no control de abuso primario --
// de ahí el volumen alto. Calibrado con margen para escaneo de check-in en
// puerta: varios dispositivos detrás del mismo NAT de wifi del venue,
// escaneando a su cooldown máximo (~27/min c/u, ver SCAN_COOLDOWN_MS en
// AdminQrScanner.jsx), no deberían acercarse a este límite.
export const staffLimiter = buildLimiter(
  5 * 60 * 1000,
  900,
  'Demasiadas solicitudes. Proba de nuevo en unos minutos.',
  { name: 'staff', mode: 'sampled' },
)
