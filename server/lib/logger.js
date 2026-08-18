import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

/**
 * logger.js — PLU ARG
 *
 * Log estructurado de una linea por evento. El objetivo concreto es que
 * cualquier falla de cobro se pueda reconstruir sin reproducirla: quien la
 * disparo (requestId), en que etapa del flujo, contra que orden, con que
 * codigo del proveedor y con el stack completo -- incluida la cadena de
 * `cause`, que es donde el SDK de Mercado Pago deja el detalle real.
 *
 * Antes de esto el unico rastro de un 500 era `[api] 500 Error interno` y el
 * stack se perdia: no habia forma de saber si el pago habia fallado en la
 * firma del webhook, en la RPC de Supabase o en la API de MP.
 *
 * Reglas:
 * - Nunca loguear secretos ni datos de tarjeta. `redact()` recorta por clave
 *   y enmascara emails; el token del Brick jamas entra al log.
 * - Log en JSON (una linea) para que Vercel/Datadog lo indexen. En local, con
 *   LOG_PRETTY=true, sale legible.
 * - Ningun fallo del logger puede tirar la operacion de negocio.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|authorization|cookie|signature|api[_-]?key|service[_-]?role|card|cvv|security[_-]?code|cardholder|account[_-]?number)/i

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_DEPTH = 6
const MAX_ARRAY = 20
const MAX_STRING = 2_000
const MAX_STACK = 8_000

const store_ = new AsyncLocalStorage()
/** Cuantos pasos previos se conservan por operacion. */
const MAX_BREADCRUMBS = 40

function resolveLevel(env) {
  const configured = String(env.LOG_LEVEL ?? '')
    .trim()
    .toLowerCase()
  if (configured && configured in LEVELS) return LEVELS[configured]
  // Los tests montan la app decenas de veces; sin esto cada 4xx esperado
  // ensuciaria la salida de vitest y taparia las fallas reales.
  if (env.NODE_ENV === 'test') return LEVELS.error
  if (env.NODE_ENV === 'production') return LEVELS.info
  return LEVELS.debug
}

/** Enmascara un email conservando dominio: sirve para correlacionar sin exponer. */
export function maskEmail(value) {
  const email = String(value ?? '')
  const [user, domain] = email.split('@')
  if (!domain) return '[redacted]'
  const visible = user.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(1, user.length - visible.length))}@${domain}`
}

function redactValue(value, depth) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (EMAIL_PATTERN.test(value)) return maskEmail(value)
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return serializeError(value)
  if (depth >= MAX_DEPTH) return '[depth-limit]'
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => redactValue(item, depth + 1))
    if (value.length > MAX_ARRAY) items.push(`…(+${value.length - MAX_ARRAY})`)
    return items
  }
  if (typeof value === 'object') return redact(value, depth + 1)
  return String(value)
}

/** Copia el objeto reemplazando por `[redacted]` toda clave sensible. */
export function redact(input, depth = 0) {
  if (!input || typeof input !== 'object') return redactValue(input, depth)
  const output = {}
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = value === undefined || value === null ? value : '[redacted]'
      continue
    }
    const redacted = redactValue(value, depth)
    if (redacted !== undefined) output[key] = redacted
  }
  return output
}

function stackOf(error) {
  const stack = typeof error?.stack === 'string' ? error.stack : null
  if (!stack) return null
  return stack.length > MAX_STACK ? `${stack.slice(0, MAX_STACK)}…[truncated]` : stack
}

const STACK_FRAME =
  /at\s+(?:(?<fn>[^\s(]+)\s+\()?(?<location>[^\s)]+):(?<line>\d+):(?<column>\d+)\)?/
// Marco de terceros: no dice donde esta el problema nuestro.
const FOREIGN_FRAME = /node_modules|node:internal|^\s*at\s+node:/

/**
 * Primer marco de codigo propio del stack: archivo, linea y funcion.
 *
 * El stack completo son 20 lineas donde las primeras suelen ser Express, el
 * SDK de Mercado Pago o internals de Node. `origin` responde de una la pregunta
 * "donde falla" con un dato indexable, sin tener que leerlo entero. La ruta se
 * normaliza relativa al repo para que sea clickeable y no filtre el path
 * absoluto de la maquina.
 */
export function originFrame(error) {
  const stack = typeof error?.stack === 'string' ? error.stack : null
  if (!stack) return null

  for (const rawLine of stack.split('\n').slice(1)) {
    if (FOREIGN_FRAME.test(rawLine)) continue
    const match = STACK_FRAME.exec(rawLine)
    if (!match?.groups) continue
    const { fn, location, line, column } = match.groups
    const normalized = location
      .replace(/^file:\/{2,3}/, '')
      .replace(/\\/g, '/')
      .replace(/^[A-Za-z]:/, '')
    // Corta desde la carpeta del repo: `server/...`, `src/...`, `scripts/...`.
    const relative = /\/((?:server|src|scripts|api|tests)\/.+)$/.exec(normalized)
    return {
      file: relative ? relative[1] : normalized,
      line: Number(line),
      column: Number(column),
      function: fn && fn !== 'Object.<anonymous>' ? fn : null,
    }
  }
  return null
}

/**
 * Serializa un error con su stack y toda la cadena de `cause`. El SDK de
 * Mercado Pago envuelve la respuesta HTTP en `cause`, asi que sin recorrerla
 * el log dice "Error de Mercado Pago" y nada mas.
 */
export function serializeError(error, depth = 0) {
  if (!error) return null
  if (typeof error !== 'object') return { message: String(error) }

  const serialized = {
    name: error.name ?? 'Error',
    message: typeof error.message === 'string' ? error.message : String(error),
    // Donde fallo, en una linea. El stack queda abajo para el detalle.
    origin: originFrame(error),
    stack: stackOf(error),
  }
  if (error.status !== undefined) serialized.status = error.status
  if (error.statusCode !== undefined) serialized.statusCode = error.statusCode
  if (error.code !== undefined) serialized.code = error.code
  if (error.details) serialized.details = redact(error.details)
  // Detalle del proveedor: lo agrega `mercadoPagoAdapter` al normalizar.
  if (error.provider) serialized.provider = redact(error.provider)
  if (error.diagnosis) serialized.diagnosis = redact(error.diagnosis)
  if (error.cause && depth < 4) serialized.cause = serializeError(error.cause, depth + 1)
  return serialized
}

function write(level, event, context = {}) {
  const env = process.env
  if (LEVELS[level] < resolveLevel(env)) return

  const { err, error, ...rest } = context
  const store = store_.getStore()
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(store?.requestId ? { requestId: store.requestId } : {}),
    ...(store?.entrypoint ? { entrypoint: store.entrypoint } : {}),
    ...redact(rest),
  }
  const failure = err ?? error
  if (failure) {
    payload.err = serializeError(failure)
    // Los pasos que se dieron ANTES de la falla, en este mismo request. Es la
    // diferencia entre "fallo al aplicar el pago" y "fallo al aplicar el pago
    // despues de reclamar el intento y de que MP respondiera approved en 900ms".
    const trail = store?.breadcrumbs ?? []
    if (trail.length) payload.trail = trail.map((crumb) => redact(crumb))
  }

  const line =
    env.LOG_PRETTY === 'true'
      ? `[${level}] ${event} ${JSON.stringify(payload, null, 2)}`
      : JSON.stringify(payload)

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

function safeWrite(level, event, context) {
  try {
    write(level, event, context)
  } catch (loggingError) {
    // La observabilidad nunca puede tumbar un cobro. Se degrada a una linea
    // plana y sigue.
    console.error(
      `[logger] no se pudo serializar ${event}: ${loggingError?.message ?? loggingError}`,
    )
  }
}

export const logger = {
  debug: (event, context) => safeWrite('debug', event, context),
  info: (event, context) => safeWrite('info', event, context),
  warn: (event, context) => safeWrite('warn', event, context),
  error: (event, context) => safeWrite('error', event, context),
  /** Sub-logger con contexto fijo (ej. `{ orderId, kind }` de un cobro). */
  child(base = {}) {
    const merge = (context = {}) => ({ ...base, ...context })
    return {
      debug: (event, context) => safeWrite('debug', event, merge(context)),
      info: (event, context) => safeWrite('info', event, merge(context)),
      warn: (event, context) => safeWrite('warn', event, merge(context)),
      error: (event, context) => safeWrite('error', event, merge(context)),
    }
  },
}

/** Identificador de correlacion de la operacion en curso, si hay contexto. */
export function getRequestId() {
  return store_.getStore()?.requestId ?? null
}

export function getRequestContext() {
  return store_.getStore() ?? null
}

export function newRequestId() {
  return randomUUID()
}

/**
 * Registra un paso de la operacion en curso. No emite log: solo se vuelca
 * cuando algo falla, para responder "que venia pasando" sin inundar la salida
 * en el 99% de los cobros que salen bien.
 *
 * @param {string} event Nombre corto del paso (`order.resolved`, `mp.payment_created`).
 * @param {object} [data] Contexto acotado. Se redacta igual que el resto.
 */
export function addBreadcrumb(event, data = {}) {
  const store = store_.getStore()
  if (!store) return false
  if (!store.breadcrumbs) store.breadcrumbs = []
  // Al llenarse se descarta el paso mas viejo: los ultimos son los que
  // explican la falla.
  if (store.breadcrumbs.length >= MAX_BREADCRUMBS) store.breadcrumbs.shift()
  store.breadcrumbs.push({
    // Milisegundos desde que arranco la operacion: hace visible donde se fue
    // el tiempo (ej. 8s esperando a Mercado Pago antes del timeout).
    atMs: store.startedAt
      ? Math.round(Number(process.hrtime.bigint() - store.startedAt) / 1e6)
      : null,
    event,
    ...data,
  })
  return true
}

/** Pasos acumulados de la operacion en curso. */
export function getBreadcrumbs() {
  return store_.getStore()?.breadcrumbs ?? []
}

/** Corre `fn` dentro de un contexto de correlacion. */
export function runWithRequestContext(context, fn) {
  return store_.run(
    {
      requestId: context.requestId ?? newRequestId(),
      startedAt: process.hrtime.bigint(),
      breadcrumbs: [],
      ...context,
    },
    fn,
  )
}

/** Solo tests: fuerza el nivel evaluado en la proxima escritura. */
export const LOG_LEVELS = LEVELS
