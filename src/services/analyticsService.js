import { env } from '../config/env.js'

/**
 * analyticsService.js — PLU ARG
 *
 * Tracker de uso del sitio. Registra vistas de pagina, clicks con coordenadas
 * para el mapa de calor, profundidad de scroll y eventos de negocio del embudo
 * de afiliacion.
 *
 * Tres reglas que gobiernan todo el archivo:
 *
 * 1. **Nunca puede romper la navegacion.** Todo va dentro de try/catch y los
 *    fallos se descartan en silencio. Una metrica perdida no vale un error en
 *    la pantalla de alguien que esta por pagar.
 * 2. **Nunca captura contenido tipeado.** De un click se guarda el selector y
 *    a lo sumo el texto visible del boton; jamas el `value` de un input. En un
 *    sitio con DNI, email y datos de tarjeta eso no es negociable.
 * 3. **El identificador de visitante y la ruta los decide el servidor.** Aca no
 *    se genera ningun id: uno emitido por el navegador es falseable y con el se
 *    inflan las visitas.
 *
 * El envio usa `sendBeacon` cuando la pestaña se va, que es el unico mecanismo
 * que el navegador garantiza durante el unload; `fetch` normal se usa mientras
 * la pagina sigue viva.
 */

const ENDPOINT = '/api/analytics/collect'
const OPT_OUT_KEY = 'plu-analytics-opt-out'
const FLUSH_INTERVAL_MS = 10_000
// Techo alineado con el del endpoint y el de la RPC.
const MAX_BATCH = 50
// Un click cada menos de esto sobre el mismo destino es doble disparo del
// navegador, no dos intenciones distintas.
const CLICK_DEDUPE_MS = 300

const state = {
  started: false,
  queue: [],
  timer: null,
  currentPath: null,
  maxScrollDepth: 0,
  lastClickAt: 0,
  lastClickSelector: null,
  listeners: [],
}

/**
 * Salida explicita. Con identidad vinculada al atleta, tener un opt-out
 * accesible no es una cortesia: es lo que hace defendible el tratamiento.
 */
export function isOptedOut() {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === '1'
  } catch {
    return false
  }
}

export function setOptedOut(value) {
  try {
    if (value) {
      window.localStorage.setItem(OPT_OUT_KEY, '1')
      state.queue = []
    } else {
      window.localStorage.removeItem(OPT_OUT_KEY)
    }
  } catch {
    // Sin localStorage (modo privado estricto) no hay preferencia que guardar.
  }
}

/**
 * Configuracion efectiva. Se lee defensivamente porque `trackEvent` corre
 * dentro de flujos de negocio —el submit del checkout, entre otros— y una
 * excepcion acá se propagaria al llamador. Un `env` incompleto (un test que
 * mockea solo lo que le interesa, una config a medio migrar) tiene que
 * apagar la medicion, nunca romper un pago.
 */
function analyticsConfig() {
  return env?.analytics ?? { enabled: false, excludedPrefixes: [] }
}

function isTrackablePath(path) {
  if (!path) return false
  const excluded = analyticsConfig().excludedPrefixes ?? []
  return !excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function trackingEnabled() {
  try {
    return (
      analyticsConfig().enabled === true
      && typeof window !== 'undefined'
      && !isOptedOut()
      && isTrackablePath(window.location?.pathname)
    )
  } catch {
    return false
  }
}

/**
 * Selector corto y estable de un elemento. Se prefiere lo que el equipo controla
 * (`data-analytics`, `id`) antes que la cadena de clases, que cambia con cada
 * retoque de CSS y volveria incomparable el historico.
 */
function describeElement(element) {
  if (!element || typeof element.closest !== 'function') return null

  const target =
    element.closest('[data-analytics]')
    ?? element.closest('a, button, [role="button"], summary, input[type="submit"]')
    ?? element

  const explicit = target.getAttribute?.('data-analytics')
  if (explicit) return { selector: explicit.slice(0, 300), text: readLabel(target) }

  const parts = []
  if (target.id) parts.push(`#${target.id}`)
  else {
    parts.push(target.tagName?.toLowerCase() ?? 'elemento')
    const className = typeof target.className === 'string' ? target.className.trim() : ''
    if (className) parts.push(`.${className.split(/\s+/).slice(0, 2).join('.')}`)
  }

  return { selector: parts.join('').slice(0, 300), text: readLabel(target) }
}

/**
 * Etiqueta visible del elemento. Nunca sale de atributos accesibles o del texto
 * del propio control: si el click fue sobre un input, se devuelve su `name`,
 * jamas lo que la persona escribio.
 */
function readLabel(element) {
  if (element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.tagName === 'SELECT') {
    return (element.getAttribute('name') ?? element.getAttribute('type') ?? '').slice(0, 120)
  }
  const label =
    element?.getAttribute?.('aria-label')
    ?? element?.getAttribute?.('title')
    ?? element?.textContent
    ?? ''
  return String(label).replace(/\s+/g, ' ').trim().slice(0, 120)
}

function documentSize() {
  const doc = document.documentElement
  return {
    width: Math.max(doc?.scrollWidth ?? 0, window.innerWidth ?? 0, 1),
    height: Math.max(doc?.scrollHeight ?? 0, window.innerHeight ?? 0, 1),
  }
}

function currentContext() {
  const params = new URLSearchParams(window.location.search)
  return {
    path: window.location.pathname,
    referrer: document.referrer || undefined,
    utmSource: params.get('utm_source') ?? undefined,
    utmMedium: params.get('utm_medium') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    language: navigator.language,
  }
}

function enqueue(event) {
  // Ultima linea de defensa: encolar es el punto por el que pasan todos los
  // eventos, incluidos los que se emiten desde el checkout. Nada de lo que
  // ocurra acá adentro puede llegar al llamador.
  try {
    if (!trackingEnabled()) return
    state.queue.push({
      ...event,
      path: window.location.pathname,
      occurredAt: new Date().toISOString(),
    })
    // Se descarta lo mas viejo: si algo se pierde, que sea el pasado y no la
    // interaccion que acaba de ocurrir.
    if (state.queue.length > MAX_BATCH) state.queue = state.queue.slice(-MAX_BATCH)
    if (state.queue.length >= MAX_BATCH) flush()
  } catch {
    // Una metrica perdida no vale un error en la pantalla de quien esta pagando.
  }
}

/**
 * Descarga la cola. `useBeacon` es obligatorio durante `pagehide`: un `fetch`
 * ahi se cancela al descargarse el documento y se pierde justo la salida, que
 * es el dato que cierra la sesion y alimenta el rebote.
 */
export function flush({ useBeacon = false } = {}) {
  if (state.queue.length === 0) return
  const events = state.queue.slice(0, MAX_BATCH)
  state.queue = state.queue.slice(events.length)

  const payload = JSON.stringify({ events, context: currentContext() })

  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      const delivered = navigator.sendBeacon(ENDPOINT, blob)
      // Si el navegador rechaza el beacon (cola llena), se devuelven los
      // eventos a la cola en vez de perderlos en silencio.
      if (!delivered) state.queue = events.concat(state.queue)
      return
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-PLU-Request': 'browser' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // La analitica es best-effort: un fallo de red no se le muestra a nadie.
    })
  } catch {
    // Idem.
  }
}

/** Vista de pagina. Cierra el scroll de la anterior antes de abrir la nueva. */
export function trackPageView({ title, route } = {}) {
  if (!trackingEnabled()) return
  const path = window.location.pathname
  if (state.currentPath === path) return

  if (state.currentPath !== null) flushScrollDepth()

  state.currentPath = path
  state.maxScrollDepth = 0
  enqueue({
    type: 'pageview',
    title: title ?? document.title,
    route,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })
}

/** Evento de negocio con nombre: es lo que sostiene el embudo. */
export function trackEvent(name, { type = 'custom', value, metadata } = {}) {
  if (!name) return
  enqueue({ type, name: String(name).slice(0, 80), value, metadata })
}

/** Conversion: paso final del embudo (pago aprobado, inscripcion confirmada). */
export function trackConversion(name, { value, metadata } = {}) {
  trackEvent(name, { type: 'conversion', value, metadata })
}

function flushScrollDepth() {
  if (state.maxScrollDepth <= 0) return
  enqueue({ type: 'scroll', scrollDepth: Number(state.maxScrollDepth.toFixed(3)) })
  state.maxScrollDepth = 0
}

function handleClick(event) {
  if (!trackingEnabled()) return
  try {
    const described = describeElement(event.target)
    const now = Date.now()
    if (
      described?.selector === state.lastClickSelector
      && now - state.lastClickAt < CLICK_DEDUPE_MS
    ) {
      return
    }
    state.lastClickAt = now
    state.lastClickSelector = described?.selector ?? null

    const { width, height } = documentSize()
    enqueue({
      type: 'click',
      selector: described?.selector,
      text: described?.text,
      // Coordenadas de documento y no de viewport, normalizadas 0..1: es lo que
      // hace que el mapa de calor sea comparable entre un monitor y un telefono.
      x: clamp01((event.pageX ?? 0) / width),
      y: clamp01((event.pageY ?? 0) / height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
  } catch {
    // Un click nunca puede fallar por culpa de la medicion.
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function handleScroll() {
  try {
    const { height } = documentSize()
    const reached = (window.scrollY + window.innerHeight) / height
    if (reached > state.maxScrollDepth) state.maxScrollDepth = clamp01(reached)
  } catch {
    // Idem.
  }
}

function handleVisibility() {
  if (document.visibilityState === 'hidden') {
    flushScrollDepth()
    flush({ useBeacon: true })
  }
}

function handlePageHide() {
  flushScrollDepth()
  flush({ useBeacon: true })
}

/**
 * Arranca la instrumentacion global. Idempotente: montarlo dos veces (React
 * StrictMode en dev) no duplica listeners ni eventos.
 */
export function startAnalytics() {
  if (state.started || typeof window === 'undefined') return () => {}
  if (!env.analytics.enabled) return () => {}
  state.started = true

  const listeners = [
    ['click', handleClick, { capture: true, passive: true }],
    ['scroll', handleScroll, { passive: true }],
    ['visibilitychange', handleVisibility, undefined],
    ['pagehide', handlePageHide, undefined],
  ]

  for (const [type, handler, options] of listeners) {
    const target = type === 'visibilitychange' ? document : window
    target.addEventListener(type, handler, options)
    state.listeners.push([target, type, handler, options])
  }

  state.timer = window.setInterval(() => flush(), FLUSH_INTERVAL_MS)

  return stopAnalytics
}

export function stopAnalytics() {
  if (!state.started) return
  for (const [target, type, handler, options] of state.listeners) {
    target.removeEventListener(type, handler, options)
  }
  state.listeners = []
  if (state.timer) window.clearInterval(state.timer)
  state.timer = null
  state.started = false
  flush({ useBeacon: true })
}

/** Solo para tests: devuelve el tracker a su estado inicial. */
export function resetAnalyticsForTests() {
  stopAnalytics()
  state.queue = []
  state.currentPath = null
  state.maxScrollDepth = 0
  state.lastClickAt = 0
  state.lastClickSelector = null
}

/** Solo para tests: inspecciona la cola sin descargarla. */
export function peekQueueForTests() {
  return [...state.queue]
}
