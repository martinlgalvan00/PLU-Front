import { lazy } from 'react'

const CHUNK_ERROR_PATTERN =
  /dynamically imported module|importing a module script failed|Loading chunk|Loading CSS chunk|error loading dynamically/i

export function isChunkLoadError(error) {
  return CHUNK_ERROR_PATTERN.test(`${error?.name ?? ''} ${error?.message ?? ''}`)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `React.lazy` con reintento.
 *
 * `lazy` cachea la promesa rechazada: si el `import()` falla una vez (dev
 * server recompilando un archivo a medio guardar, red caída, chunk viejo tras
 * un deploy) todos los renders siguientes tiran el mismo error aunque el
 * módulo ya esté sano. Reintentar acá, antes de rechazar, absorbe esos fallos
 * transitorios; si igual falla, PageErrorBoundary recarga la pestaña.
 */
export default function lazyWithRetry(loader, { retries = 2, delayMs = 350 } = {}) {
  return lazy(async () => {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader()
      } catch (error) {
        lastError = error
        if (!isChunkLoadError(error) || attempt === retries) break
        await wait(delayMs * (attempt + 1))
      }
    }
    throw lastError
  })
}
