/**
 * Textos del panel (`admin.*`) cargados aparte del sitio público.
 *
 * `admin.es.js` pesa ~300 KB (84 KB gzip): importado desde `es.js` viajaba en
 * el bundle principal y lo descargaba cada visitante del sitio, aunque nunca
 * entrara al panel. Ahora se pide al abrir una ruta de staff (panel, check-in,
 * organizador, vinculación de Mercado Pago) y queda cacheado.
 *
 * El `I18nProvider` se suscribe y suma el namespace `admin` en cuanto llega.
 * Tests y Storybook lo registran de entrada con `registerAdminMessages`.
 */

const loaders = {
  es: () => import('./locales/admin.es.js'),
  en: () => import('./locales/admin.en.js'),
}

const loaded = { es: null, en: null }
const inflight = {}
const listeners = new Set()

/**
 * Foto estable para `useSyncExternalStore`. Se reemplaza entera al llegar un
 * idioma: React compara por identidad y, si devolvemos un objeto nuevo en cada
 * lectura, entra en un bucle de render.
 */
let snapshot = { es: null, en: null }

/** Mensajes `admin` ya cargados para el idioma, o `null`. */
export function adminMessagesFor(locale) {
  return loaded[locale] ?? null
}

/** Foto actual de los textos del panel. Misma referencia hasta que cambian. */
export function getAdminMessagesSnapshot() {
  return snapshot
}

/** Carga síncrona (tests, Storybook) o al resolver el import diferido. */
export function registerAdminMessages(locale, messages) {
  if (!messages || loaded[locale] === messages) return
  loaded[locale] = messages
  snapshot = { es: loaded.es, en: loaded.en }
  listeners.forEach((listener) => listener())
}

export function subscribeAdminMessages(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Baja (una sola vez) los textos del panel del idioma pedido. */
export function loadAdminMessages(locale = 'es') {
  const target = loaders[locale] ? locale : 'es'
  if (loaded[target]) return Promise.resolve(loaded[target])
  inflight[target] ??= loaders[target]()
    .then((module) => {
      registerAdminMessages(target, module.default)
      return module.default
    })
    .catch((error) => {
      // Un fallo de red no puede quedar cacheado: el próximo intento reintenta.
      delete inflight[target]
      throw error
    })
  return inflight[target]
}

/**
 * Para las rutas de staff: español siempre (es el respaldo de cualquier clave)
 * y el idioma guardado si es otro. Se espera antes de montar la página para
 * que el panel no muestre claves crudas ni un instante.
 */
export function loadAdminMessagesForStoredLocale() {
  let stored = 'es'
  try {
    stored = localStorage.getItem('plu-arg-locale') === 'en' ? 'en' : 'es'
  } catch {
    // Sin storage (modo privado estricto): español.
  }
  return Promise.all([
    loadAdminMessages('es'),
    stored === 'en' ? loadAdminMessages('en') : null,
  ])
}
