import { useEffect, useState } from 'react'
import { fetchPublicEventSchedule } from '../services/eventRegistrationApi.js'

const EMPTY = Object.freeze({ enabled: false, platforms: [], days: [], hasContent: false })

/**
 * Grilla pública de un evento. Se pide una vez al montar y otra al volver a la
 * pestaña: la grilla cambia de a ratos, no por segundo, y apagarla tiene que
 * reflejarse al volver sin recargar. Si falla, la sección simplemente no se
 * muestra: una grilla ausente es honesta, una a medias no.
 */
export function usePublicEventSchedule(eventSlug, { enabled = true } = {}) {
  const [schedule, setSchedule] = useState(EMPTY)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (!enabled || !eventSlug) {
      setSchedule(EMPTY)
      setStatus('idle')
      return undefined
    }

    let active = true
    const load = () => {
      fetchPublicEventSchedule(eventSlug)
        .then((next) => {
          if (!active) return
          setSchedule(next)
          setStatus('ready')
        })
        .catch(() => {
          if (!active) return
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
    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, eventSlug])

  return { schedule, status }
}
