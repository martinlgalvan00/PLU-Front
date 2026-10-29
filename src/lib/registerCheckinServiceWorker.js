/**
 * Registra el service worker del shell de check-in. Solo en el build de
 * producción: en `vite` el plugin está apagado y no hay worker que registrar.
 */
export function registerCheckinServiceWorker() {
  if (!import.meta.env.PROD || typeof window === 'undefined') return

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {
      // Sin worker la puerta sigue online. La lista offline vive en IndexedDB
      // mientras la pestaña no se cierre.
    })
}
