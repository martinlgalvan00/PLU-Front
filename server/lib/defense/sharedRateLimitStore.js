import { getSupabaseAdmin } from '../supabaseAdmin.js'

/**
 * sharedRateLimitStore.js — PLU ARG
 *
 * Store de `express-rate-limit` con estado compartido en Postgres.
 *
 * El problema que resuelve: el store en memoria default no comparte nada entre
 * procesos, y en Vercel cada request concurrente puede aterrizar en una
 * instancia nueva con su propio contador arrancando en cero. Los presets de
 * `middleware/rateLimit.js` estan bien calibrados, pero en produccion el limite
 * efectivo no es el numero configurado: es ese numero multiplicado por la
 * cantidad de instancias, y la cantidad de instancias la decide quien ataca
 * subiendo la concurrencia. El unico escenario donde el limite tenia que servir
 * es el unico donde no servia.
 *
 * ── Por que no es simplemente "contar en la base" ──────────────────────────
 *
 * Porque eso convierte cada request en una ida a Postgres, y este proyecto corre
 * sobre el plan gratuito de Supabase. Un limite que se paga con una consulta por
 * request le regala al atacante justo lo que busca: el ataque pasa a costar mas
 * del lado del defensor.
 *
 * El diseño invierte eso. Tres reglas:
 *
 *   1. **Primero la memoria.** El contador local sube siempre y no cuesta nada.
 *   2. **La base se consulta por lotes.** Se sincronizan varios hits juntos
 *      (`p_cost`), no uno por uno. El trafico legitimo, que nunca se acerca al
 *      limite, hace muy pocas idas -- o ninguna, en los presets muestreados.
 *   3. **Un bloqueo se cachea local.** Cuando la base responde "bloqueado", la
 *      instancia se lo guarda y deja de preguntar hasta que venza. A partir de
 *      ahi el atacante recibe 429 servidos desde memoria: cuanto mas insiste,
 *      mas barato sale rechazarlo.
 *
 * ── Modos ─────────────────────────────────────────────────────────────────
 *
 *   'strict'  — sincroniza en cada hit. Para lo que se cuenta de a poco y duele
 *               si se escapa: login, codigo de tanda privada, checkout, webhook.
 *               Una ida a la base por intento de login es irrelevante al lado de
 *               los ~250 ms de bcrypt que ese mismo request va a gastar.
 *   'sampled' — sincroniza cada N hits y siempre cerca del limite. Para volumen
 *               alto donde el objetivo es frenar abuso, no contar exacto:
 *               analitica, lecturas publicas, panel.
 *
 * ── Que pasa si Supabase no responde ──────────────────────────────────────
 *
 * Se degrada al contador local (fail-open) y se abre un corte de circuito: tras
 * varios errores seguidos deja de intentar por un rato. Un incidente de la base
 * no puede dejar sin login a todo el mundo, y sobre todo no puede sumarle
 * latencia a cada request mientras dura.
 */

const SYNC_FAILURE_THRESHOLD = 3
const CIRCUIT_OPEN_MS = 30_000
// Techo de claves vivas por instancia. Sin esto, un barrido desde miles de IPs
// hace crecer el Map hasta el limite de memoria de la funcion -- el rate limiter
// seria el vector de agotamiento en vez de la defensa.
const MAX_LOCAL_KEYS = 20_000

function nowMs() {
  return Date.now()
}

export class SharedRateLimitStore {
  /**
   * @param {object} options
   * @param {string} options.name Prefijo de la clave; separa los baldes entre presets.
   * @param {'strict'|'sampled'} [options.mode]
   * @param {() => object|null} [options.getClient] Inyectable para los tests.
   */
  constructor({ name, mode = 'sampled', getClient = getSupabaseAdmin } = {}) {
    this.name = name
    this.mode = mode
    this.getClient = getClient
    this.localKeys = false

    /** @type {Map<string, {hits: number, syncedHits: number, sharedHits: number, resetAt: number, blockedUntil: number}>} */
    this.entries = new Map()
    this.windowMs = 60_000
    this.limit = 60
    this.consecutiveFailures = 0
    this.circuitOpenUntil = 0
  }

  init(options) {
    this.windowMs = options.windowMs ?? this.windowMs
    if (typeof options.limit === 'number') this.limit = options.limit
  }

  /** Hits que se dejan acumular en memoria antes de ir a la base. */
  syncThreshold() {
    if (this.mode === 'strict') return 1
    return Math.max(2, Math.ceil(this.limit / 6))
  }

  freshEntry(now) {
    return {
      hits: 0,
      syncedHits: 0,
      sharedHits: 0,
      resetAt: now + this.windowMs,
      blockedUntil: 0,
    }
  }

  entryFor(key, now) {
    let entry = this.entries.get(key)
    if (!entry || entry.resetAt <= now) {
      // Un bloqueo mas largo que la ventana sobrevive al reinicio del contador:
      // si no, el que se paso espera a que rote la ventana y recupera el cupo
      // entero, que es exactamente lo que el bloqueo escalonado quiere evitar.
      const blockedUntil = entry && entry.blockedUntil > now ? entry.blockedUntil : 0
      entry = { ...this.freshEntry(now), blockedUntil }
      this.entries.set(key, entry)
    }
    return entry
  }

  /**
   * Desalojo perezoso. Se ejecuta solo cuando el Map crece de mas, y saca
   * primero lo que ya vencio; si aun asi sobra, corta por orden de insercion
   * (el Map de JS lo preserva), que aproxima bien "lo mas viejo".
   */
  evictIfNeeded(now) {
    if (this.entries.size <= MAX_LOCAL_KEYS) return

    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now && entry.blockedUntil <= now) this.entries.delete(key)
      if (this.entries.size <= MAX_LOCAL_KEYS) return
    }

    for (const key of this.entries.keys()) {
      this.entries.delete(key)
      if (this.entries.size <= MAX_LOCAL_KEYS) return
    }
  }

  circuitIsOpen(now) {
    return now < this.circuitOpenUntil
  }

  recordFailure(now) {
    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= SYNC_FAILURE_THRESHOLD) {
      this.circuitOpenUntil = now + CIRCUIT_OPEN_MS
      this.consecutiveFailures = 0
    }
  }

  /**
   * Consume `cost` unidades en la base. Devuelve null si no se pudo consultar,
   * y en ese caso quien llama se queda con el conteo local.
   */
  async consumeShared(key, cost) {
    const client = this.getClient?.()
    if (!client?.rpc) return null

    const { data, error } = await client.rpc('consume_rate_limit', {
      p_key: `${this.name}:${key}`,
      p_window_seconds: Math.max(1, Math.round(this.windowMs / 1000)),
      p_limit: this.limit,
      p_cost: cost,
    })

    if (error) throw new Error(error.message)
    return data
  }

  async increment(key) {
    const now = nowMs()
    const entry = this.entryFor(key, now)
    entry.hits += 1
    this.evictIfNeeded(now)

    // Bloqueo ya conocido: se responde sin salir de memoria. Este es el camino
    // que recorre un ataque sostenido, y por eso es el que no cuesta nada.
    if (entry.blockedUntil > now) {
      return { totalHits: this.limit + 1, resetTime: new Date(entry.blockedUntil) }
    }

    const pending = entry.hits - entry.syncedHits
    const projected = entry.sharedHits + pending
    const shouldSync = pending >= this.syncThreshold() || projected > this.limit

    if (shouldSync && !this.circuitIsOpen(now)) {
      try {
        const result = await this.consumeShared(key, pending)
        if (result) {
          this.consecutiveFailures = 0
          entry.syncedHits = entry.hits
          entry.sharedHits = Number(result.hits ?? projected)

          if (result.allowed === false) {
            const retryMs = Math.max(1, Number(result.retryAfterSeconds ?? 1)) * 1000
            entry.blockedUntil = now + retryMs
            return { totalHits: this.limit + 1, resetTime: new Date(entry.blockedUntil) }
          }

          if (result.resetAt) {
            const resetAt = new Date(result.resetAt).getTime()
            if (Number.isFinite(resetAt) && resetAt > now) entry.resetAt = resetAt
          }
        }
      } catch {
        // Nunca se propaga: una falla de la base no puede convertirse en un 500
        // del login. Se sigue con el contador local, que es mas permisivo pero
        // no deja el endpoint sin ninguna proteccion.
        this.recordFailure(now)
      }
    }

    return {
      totalHits: Math.max(entry.hits, entry.sharedHits),
      resetTime: new Date(entry.resetAt),
    }
  }

  async decrement(key) {
    const entry = this.entries.get(key)
    if (!entry) return
    // Solo local: `skipSuccessfulRequests` no se usa en ningun preset, asi que
    // devolver el hit a la base agregaria una ida sin cambiar ninguna decision.
    entry.hits = Math.max(0, entry.hits - 1)
    entry.syncedHits = Math.min(entry.syncedHits, entry.hits)
  }

  async resetKey(key) {
    this.entries.delete(key)
    const client = this.getClient?.()
    if (!client?.rpc) return
    try {
      await client.rpc('release_rate_limit', { p_key: `${this.name}:${key}` })
    } catch {
      // Liberar es best-effort: la ventana vence sola.
    }
  }

  async resetAll() {
    this.entries.clear()
  }
}

/**
 * Devuelve un store compartido, o `undefined` para que `express-rate-limit` use
 * el suyo en memoria.
 *
 * Queda apagado si no hay Supabase configurado y en los tests unitarios, que
 * montan la app con dobles parciales y no deben pegarle a la base real.
 */
export function createSharedStore({ name, mode, env = process.env, getClient } = {}) {
  if (env.NODE_ENV === 'test' && !getClient) return undefined
  if (env.SHARED_RATE_LIMIT_ENABLED === 'false') return undefined

  const resolveClient = getClient ?? getSupabaseAdmin
  if (!getClient && !env.SUPABASE_URL) return undefined

  return new SharedRateLimitStore({ name, mode, getClient: resolveClient })
}
