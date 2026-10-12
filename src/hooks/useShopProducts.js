import { useCallback, useEffect, useState } from 'react'
import { fetchPublicShopProducts } from '../services/shopService.js'

/**
 * Catálogo público de la tienda: se pide una vez por visita y queda en memoria
 * mientras la app siga abierta, así volver a la tienda no vuelve a esperar.
 * `status` distingue "cargando" de "vacío" y de "no se pudo cargar" para que la
 * página no confunda un fallo de red con un catálogo sin productos.
 */
let cachedProducts = null

export function useShopProducts() {
  const [state, setState] = useState(() =>
    cachedProducts
      ? { products: cachedProducts, status: 'ready' }
      : { products: [], status: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchPublicShopProducts()
      .then((products) => {
        cachedProducts = products
        if (!cancelled) setState({ products, status: 'ready' })
      })
      .catch(() => {
        // Con datos en memoria el error no los pisa: se siguen mostrando.
        if (!cancelled) {
          setState((current) =>
            current.status === 'ready' ? current : { products: [], status: 'error' },
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState((current) => (current.status === 'error' ? { ...current, status: 'loading' } : current))
    setAttempt((value) => value + 1)
  }, [])

  return { ...state, retry }
}

/** Solo para tests: vacía el catálogo en memoria. */
export function resetShopProductsCache() {
  cachedProducts = null
}
