/**
 * sessionCache.js — PLU ARG
 *
 * Validación de sesión en memoria, con TTL corto e invalidación explícita.
 *
 * El problema: cada request autenticado resolvía la sesión con una consulta a la
 * base. En el staff es un `findUnique` sobre `sessions` con tres joins (perfil,
 * rol de acceso y sus permisos); en el atleta es un select sobre
 * `athlete_sessions` MÁS un update de `last_seen_at`. El panel repregunta el
 * snapshot cada minuto y la cuenta del atleta hace lo propio, así que ese ida y
 * vuelta se paga en cada llamada de cada pestaña abierta.
 *
 * Sobre la instancia Nano el costo real no es el tiempo de la query: es el slot
 * del pooler. Son 15 para todo el proyecto, compartidos con los jobs y las
 * migraciones, y la sesión los tomaba antes de que el handler empezara a
 * trabajar.
 *
 * Por qué es seguro cachear una decisión de autorización:
 *
 *   Todo lo que puede invalidar una sesión pasa por un único lugar. Cambiar el
 *   rol, suspender la cuenta, dar de baja, reemitir la credencial y cerrar
 *   sesión llaman `revokeSession` o `revokeSessionsForUser` (ver
 *   server/routes/users.js y auth.js) -- eso ya existía, justamente para que un
 *   recorte de permisos no esperara a que venciera la cookie. Acá se engancha la
 *   purga a esos mismos llamados, así que la caché no puede sobrevivir a la
 *   revocación que la invalida.
 *
 *   El TTL corto es la red por si algún día aparece un camino que escriba
 *   `users.status` sin revocar: el peor caso es una ventana de segundos, no de
 *   las ocho horas que dura la cookie.
 *
 * Nunca se cachea un resultado negativo. Una cookie revocada tiene que volver a
 * consultarse: cachear el "no" ahorraría una query en el caso que ya termina en
 * 401 y agregaría una forma de mantener a alguien afuera por TTL si el estado
 * cambia a favor.
 *
 * En una Function la caché es best-effort -- un cold start la vacía -- igual que
 * `signedPhotoUrlCache` en el repositorio de atletas. No se persiste nunca fuera
 * del proceso: es un cache de lectura, no una fuente de verdad.
 */

/** Ventana de tolerancia ante un camino que invalide sin revocar. */
const DEFAULT_TTL_MS = 20_000

/**
 * Tope de entradas. Un evento con toda la organización operando a la vez son
 * decenas de sesiones, no miles; el límite existe para que un flood de cookies
 * inventadas no pueda inflar la memoria del proceso.
 */
const MAX_ENTRIES = 500

export function createSessionCache({ ttlMs = DEFAULT_TTL_MS, maxEntries = MAX_ENTRIES } = {}) {
  /** @type {Map<string, { value: unknown, expiresAt: number, ownerKey: string|null }>} */
  const entries = new Map()
  /** @type {Map<string, Set<string>>} */
  const keysByOwner = new Map()

  function forget(key) {
    const entry = entries.get(key)
    if (!entry) return
    entries.delete(key)
    if (!entry.ownerKey) return
    const siblings = keysByOwner.get(entry.ownerKey)
    if (!siblings) return
    siblings.delete(key)
    if (siblings.size === 0) keysByOwner.delete(entry.ownerKey)
  }

  return {
    get(key, now = Date.now()) {
      if (!key) return null
      const entry = entries.get(key)
      if (!entry) return null
      if (entry.expiresAt <= now) {
        forget(key)
        return null
      }
      return entry.value
    },

    /**
     * `ownerKey` es el id del usuario o del atleta: es lo que permite purgar
     * todas las sesiones de una persona sin conocer sus tokens, que es
     * exactamente lo que necesita `revokeSessionsForUser`.
     */
    set(key, value, { ownerKey = null, now = Date.now() } = {}) {
      if (!key || value == null) return
      // Reemplazo: hay que soltar el índice anterior antes de reindexar, o un
      // cambio de dueño dejaría el token colgado del dueño viejo y la purga no
      // lo alcanzaría.
      if (entries.has(key)) forget(key)

      if (entries.size >= maxEntries) {
        // La entrada más vieja por orden de inserción. Con TTL de segundos no
        // hace falta un LRU real: la rotación natural ya vacía el mapa.
        const oldest = entries.keys().next()
        if (!oldest.done) forget(oldest.value)
      }

      entries.set(key, { value, expiresAt: now + ttlMs, ownerKey })
      if (ownerKey) {
        const siblings = keysByOwner.get(ownerKey)
        if (siblings) siblings.add(key)
        else keysByOwner.set(ownerKey, new Set([key]))
      }
    },

    /** Cierre de una sesión puntual (logout). */
    invalidateKey(key) {
      forget(key)
    },

    /** Baja, suspensión o cambio de rol: se caen todas las sesiones. */
    invalidateOwner(ownerKey) {
      if (!ownerKey) return
      const siblings = keysByOwner.get(ownerKey)
      if (!siblings) return
      for (const key of [...siblings]) forget(key)
    },

    clear() {
      entries.clear()
      keysByOwner.clear()
    },

    /** Sólo para tests y diagnóstico. */
    get size() {
      return entries.size
    },
  }
}

/**
 * Instancias compartidas por proceso. Separadas porque son dos dominios de
 * identidad distintos (staff en Prisma, atletas en Supabase) y un `clear()` de
 * uno no tiene por qué tirar el otro.
 */
export const staffSessionCache = createSessionCache()
export const athleteSessionCache = createSessionCache()

/**
 * Los tests montan la app muchas veces en el mismo proceso y comparten estas
 * instancias, igual que los rate limiters. Sin un reset explícito, una sesión
 * cacheada por un test sobrevive al siguiente y lo hace pasar (o fallar) por el
 * estado del anterior.
 */
export function resetSessionCaches() {
  staffSessionCache.clear()
  athleteSessionCache.clear()
}
