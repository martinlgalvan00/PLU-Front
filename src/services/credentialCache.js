import { createStore, del, get, keys, set } from 'idb-keyval'

/**
 * credentialCache.js — PLU ARG
 *
 * Última verificación buena de cada credencial escaneada, en IndexedDB.
 *
 * Para qué: en la puerta de un evento la misma persona se escanea más de una
 * vez (se cae la app, se reintenta, cambia el operador), y la señal se va
 * justo cuando hay más gente. Si ya vimos ese código con conexión, podemos
 * seguir mostrando quién es, si estaba al día y qué día compite, en vez de
 * dejar al operador sin nada.
 *
 * Lo que este caché NO hace, a propósito:
 *
 *   * No autoriza. El dato sale marcado como diferido, con su antigüedad a la
 *     vista, y la UI lo presenta como "última verificación conocida", nunca
 *     como una validación fresca. Quien decide sigue siendo la persona.
 *   * No guarda ingresos. El check-in offline ya tiene su propia cola
 *     (offlineCheckinDb.js), que es la que sabe resolver conflictos.
 *   * No sobrevive al vencimiento. Un dato de hace dos días dice más de la
 *     caché que del atleta, así que se descarta.
 *
 * IndexedDB y no localStorage: es la misma base que ya usa el scanner offline
 * y no bloquea el hilo principal mientras el operador escanea.
 */

const store = createStore('plu-credential-cache', 'kv')

const KEY_PREFIX = 'cred:'
/** Más allá de esto el dato deja de ser informativo. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Tope de credenciales guardadas: un evento grande no debe llenar el disco. */
const MAX_ENTRIES = 400

function cacheKey(code, eventSlug) {
  return `${KEY_PREFIX}${eventSlug ?? '-'}:${code}`
}

/**
 * Guarda una verificación exitosa. Los fallos nunca se cachean: guardar un
 * "no encontrado" convertiría un problema puntual en uno persistente.
 */
export async function rememberCredential(code, eventSlug, data) {
  if (!code || !data) return
  try {
    await set(
      cacheKey(code, eventSlug),
      { code, eventSlug: eventSlug ?? null, data, verifiedAt: new Date().toISOString() },
      store,
    )
    await pruneCache()
  } catch {
    // Modo incógnito, cuota llena o IndexedDB deshabilitado. El caché es una
    // mejora, no un requisito: si no se puede escribir, la app sigue igual.
  }
}

/**
 * Recupera la última verificación buena, si sigue siendo reciente.
 * @returns {Promise<{ data: object, verifiedAt: string, ageMs: number } | null>}
 */
export async function recallCredential(code, eventSlug) {
  if (!code) return null
  try {
    const entry = await get(cacheKey(code, eventSlug), store)
    if (!entry?.data || !entry.verifiedAt) return null

    const ageMs = Date.now() - new Date(entry.verifiedAt).getTime()
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_AGE_MS) {
      await del(cacheKey(code, eventSlug), store).catch(() => {})
      return null
    }

    return { data: entry.data, verifiedAt: entry.verifiedAt, ageMs }
  } catch {
    return null
  }
}

/** Descarta lo vencido y, si aún sobran, lo más viejo. */
async function pruneCache() {
  const allKeys = (await keys(store)).filter(
    (key) => typeof key === 'string' && key.startsWith(KEY_PREFIX),
  )
  if (allKeys.length <= MAX_ENTRIES) {
    await dropExpired(allKeys)
    return
  }

  const entries = await Promise.all(
    allKeys.map(async (key) => ({ key, verifiedAt: (await get(key, store))?.verifiedAt ?? '' })),
  )
  entries.sort((left, right) => String(left.verifiedAt).localeCompare(String(right.verifiedAt)))

  const excess = entries.slice(0, entries.length - MAX_ENTRIES)
  await Promise.all(excess.map(({ key }) => del(key, store).catch(() => {})))
  await dropExpired(entries.slice(excess.length).map(({ key }) => key))
}

async function dropExpired(cacheKeys) {
  const now = Date.now()
  await Promise.all(
    cacheKeys.map(async (key) => {
      const entry = await get(key, store).catch(() => null)
      if (!entry?.verifiedAt) return
      if (now - new Date(entry.verifiedAt).getTime() > MAX_AGE_MS) {
        await del(key, store).catch(() => {})
      }
    }),
  )
}

/** Antigüedad legible: el operador tiene que poder juzgar si confiar. */
export function formatCacheAge(ageMs, locale = 'es') {
  const minutes = Math.floor(ageMs / 60_000)
  const en = locale === 'en'

  if (minutes < 1) return en ? 'seconds ago' : 'hace segundos'
  if (minutes < 60) return en ? `${minutes} min ago` : `hace ${minutes} min`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return en ? `${hours} h ago` : `hace ${hours} h`

  const days = Math.floor(hours / 24)
  return en ? `${days} d ago` : `hace ${days} d`
}
