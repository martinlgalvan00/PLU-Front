import { useEffect, useState } from 'react'
import { fetchPlatformFeatureToggles } from '../services/platformSettingsAdminService.js'

/**
 * Matriz de medios de pago de la plataforma, para que el panel de un evento
 * pueda mostrar *contra qué* decide.
 *
 * Con el modelo abrir/cerrar, la celda de un evento sólo se guarda cuando
 * difiere de Finanzas, así que el panel necesita saber qué dice Finanzas para
 * dibujar el estado efectivo. Varias pantallas lo piden a la vez (editor, alta
 * rápida, lista), por eso la lectura se comparte durante unos segundos en vez
 * de repetirse por cada una.
 *
 * `status`: 'loading' | 'ready' | 'error'. Con error `platform` es `null` y el
 * panel asume la política por omisión de plataforma (ver
 * `defaultPlatformChannels`).
 */
const SHARE_MS = 15_000

let shared = null

function readPlatform() {
  const now = Date.now()
  if (shared && now - shared.at < SHARE_MS) return shared.promise
  const promise = fetchPlatformFeatureToggles()
  shared = { at: now, promise }
  // Un error no se cachea: el siguiente montaje vuelve a intentar.
  promise.catch(() => {
    if (shared?.promise === promise) shared = null
  })
  return promise
}

/** Fuerza la próxima lectura (tras cambiar la matriz de plataforma). */
export function invalidatePlatformPaymentChannels() {
  shared = null
}

export default function usePlatformPaymentChannels() {
  const [state, setState] = useState({ platform: null, status: 'loading' })

  useEffect(() => {
    let alive = true
    readPlatform()
      .then((platform) => {
        if (alive) setState({ platform, status: 'ready' })
      })
      .catch(() => {
        if (alive) setState({ platform: null, status: 'error' })
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}
