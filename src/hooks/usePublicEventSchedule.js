import { useEffect, useRef, useState } from 'react'
import { fetchPublicEventSchedule } from '../services/eventRegistrationApi.js'

const EMPTY = Object.freeze({ enabled: false, platforms: [], days: [], hasContent: false })

/** Cada cuánto se vuelve a pedir con la pestaña a la vista. El servidor cachea 10 s. */
export const PUBLIC_SCHEDULE_REFRESH_MS = 60_000

/**
 * Grilla pública de un evento. Se pide al montar, al volver a la pestaña y
 * cada minuto mientras está a la vista: la grilla cambia de a ratos, no por
 * segundo, pero publicarla, apagarla o mover una tanda tiene que reflejarse sin
 * recargar la página.
 *
 * Una vez que hubo grilla, un pedido que falla NO la esconde: se conserva la
 * última buena hasta el próximo intento. En el primer pedido, en cambio, si
 * falla la sección simplemente no se muestra: una grilla ausente es honesta,
 * una a medias no.
 *
 * Si la respuesta no cambió se conserva el mismo objeto, así nada se vuelve a
 * dibujar ni a animar; `updatedAt` sí avanza en cada pedido bueno, y dice
 * cuándo se confirmó por última vez.
 */
export function usePublicEventSchedule(eventSlug, { enabled = true } = {}) {
  const [schedule, setSchedule] = useState(EMPTY)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const [updatedAt, setUpdatedAt] = useState(null)
  const signature = useRef('')

  useEffect(() => {
    if (!enabled || !eventSlug) {
      signature.current = ''
      setSchedule(EMPTY)
      setStatus('idle')
      setUpdatedAt(null)
      return undefined
    }

    let active = true
    let hasLoaded = false
    const load = () => {
      fetchPublicEventSchedule(eventSlug)
        .then((next) => {
          if (!active) return
          hasLoaded = true
          const nextSignature = JSON.stringify(next)
          if (nextSignature !== signature.current) {
            signature.current = nextSignature
            setSchedule(next)
          }
          setStatus('ready')
          setUpdatedAt(Date.now())
        })
        .catch(() => {
          if (!active || hasLoaded) return
          signature.current = ''
          setSchedule(EMPTY)
          setStatus('error')
        })
    }

    setStatus('loading')
    load()

    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(onVisible, PUBLIC_SCHEDULE_REFRESH_MS)
    return () => {
      active = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, eventSlug])

  return { schedule, status, updatedAt }
}
