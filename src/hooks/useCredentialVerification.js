import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FAILURE,
  classifyFailure,
  isOffline,
  onConnectivityRestored,
  withRetry,
} from '../lib/resilience.js'
import { recallCredential, rememberCredential } from '../services/credentialCache.js'

/**
 * useCredentialVerification — PLU ARG
 *
 * Ciclo de vida de una verificación de credencial en la puerta del evento,
 * con la tolerancia a fallos concentrada en un solo lugar.
 *
 * Fases:
 *   loading       — pidiendo por primera vez.
 *   verified      — respuesta fresca del backend.
 *   stale         — no hubo respuesta, pero teníamos una verificación buena
 *                   reciente de este mismo código. Se muestra marcada.
 *   unverifiable  — no hubo respuesta y no hay nada cacheado. NO es inválida.
 *   not_found     — el backend respondió y dijo que ese código no existe.
 *
 * La separación entre `unverifiable` y `not_found` es el motivo de este hook.
 * Antes las dos terminaban en el mismo cartel rojo, así que una red caída
 * rebotaba atletas que habían pagado.
 *
 * @param {(code: string) => Promise<object>} verify  Lectura contra el backend
 * @param {{ code: string, eventSlug?: string|null, enabled?: boolean }} options
 */
/**
 * Presupuesto de tiempo de la puerta: peor caso ~8,5s antes de caer a un
 * estado accionable (caché o "no se pudo verificar"). Es más corto que el
 * default de `withRetry` a propósito -- acá hay una persona esperando, y un
 * estado accionable a los ocho segundos vale más que una respuesta perfecta a
 * los veinticinco.
 */
const GATE_RETRY = { delays: [500, 1500], timeoutMs: 4000 }

export function useCredentialVerification(verify, { code, eventSlug = null, enabled = true }) {
  const [state, setState] = useState({ phase: 'loading', data: null, cache: null })
  const [retrying, setRetrying] = useState(false)
  // `verify` suele venir como función inline; guardarla en un ref evita que
  // cada render cancele y relance la verificación en curso.
  const verifyRef = useRef(verify)
  verifyRef.current = verify

  const run = useCallback(
    async (signal, { manual = false } = {}) => {
      if (manual) setRetrying(true)

      try {
        const data = await withRetry(() => verifyRef.current(code), {
          ...GATE_RETRY,
          signal,
          // Sin conexión declarada no tiene sentido gastar reintentos con una
          // persona esperando: se cae al caché de una.
          delays: isOffline() ? [] : GATE_RETRY.delays,
        })
        if (signal.aborted) return

        setState({ phase: 'verified', data, cache: null })
        void rememberCredential(code, eventSlug, data)
      } catch (error) {
        if (signal.aborted) return

        const failure = classifyFailure(error)

        // El backend contestó: su respuesta manda, y no se toca el caché.
        if (failure === FAILURE.notFound) {
          setState({ phase: 'not_found', data: null, cache: null })
          return
        }

        // No hubo respuesta. Antes de rendirse, la última verificación buena.
        const cached = await recallCredential(code, eventSlug)
        if (signal.aborted) return

        setState(
          cached
            ? { phase: 'stale', data: cached.data, cache: cached }
            : { phase: 'unverifiable', data: null, cache: null, failure },
        )
      } finally {
        if (!signal.aborted) setRetrying(false)
      }
    },
    [code, eventSlug],
  )

  useEffect(() => {
    if (!enabled || !code) return undefined

    const controller = new AbortController()
    setState({ phase: 'loading', data: null, cache: null })
    void run(controller.signal)

    return () => controller.abort()
  }, [code, enabled, run])

  // Cuando vuelve la señal se revalida sola: en la puerta nadie va a estar
  // mirando si apareció un botón de reintentar.
  useEffect(() => {
    if (!enabled || !code) return undefined

    return onConnectivityRestored(() => {
      const controller = new AbortController()
      void run(controller.signal)
    })
  }, [code, enabled, run])

  const retry = useCallback(() => {
    const controller = new AbortController()
    return run(controller.signal, { manual: true })
  }, [run])

  /**
   * Reemplaza los datos en memoria tras una acción del operador (por ejemplo,
   * marcar ingreso) sin volver a pedirlos. El caché se actualiza con ellos:
   * si la red se cae justo después, el próximo escaneo ve el ingreso.
   */
  const patchData = useCallback(
    (updater) => {
      setState((current) => {
        if (!current.data) return current
        const next = typeof updater === 'function' ? updater(current.data) : updater
        void rememberCredential(code, eventSlug, next)
        return { ...current, data: next }
      })
    },
    [code, eventSlug],
  )

  return {
    phase: state.phase,
    data: state.data,
    cache: state.cache,
    failure: state.failure ?? null,
    retrying,
    retry,
    patchData,
  }
}
