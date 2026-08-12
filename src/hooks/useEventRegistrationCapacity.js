import { useEffect, useRef, useState } from 'react'
import { registrationSummaryStore } from '../services/eventLiveStore.js'

const DEFAULT_POLL_MS = 20_000

/**
 * Cupos de inscripción live.
 * - El dato lo reparte `registrationSummaryStore`: Home y Pitbull comparten
 *   un solo request y el contador se actualiza solo cuando alguien se inscribe
 *   (la inscripción invalida la clave, no hace falta esperar el próximo tick).
 * - Polling solo mientras el target está en viewport Y la pestaña está visible.
 * - `loading` | `live` | `fallback`
 */
export function useEventRegistrationCapacity(
  eventSlug,
  {
    enabled = true,
    pollMs = DEFAULT_POLL_MS,
    fallbackRegistered = 0,
    fallbackSlots = 0,
    observeRoot = null,
  } = {},
) {
  const [summary, setSummary] = useState(
    () => registrationSummaryStore.read(eventSlug)?.data ?? null,
  )
  const [status, setStatus] = useState(() =>
    registrationSummaryStore.read(eventSlug)?.data ? 'live' : 'loading',
  )
  const [inView, setInView] = useState(!observeRoot)
  const observeNodeRef = useRef(null)

  useEffect(() => {
    if (!enabled || !eventSlug || !observeRoot) {
      setInView(true)
      return undefined
    }

    const node =
      typeof observeRoot === 'string'
        ? document.getElementById(observeRoot)
        : (observeRoot?.current ?? null)

    if (!node) {
      setInView(true)
      return undefined
    }

    if (!('IntersectionObserver' in window)) {
      setInView(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting)
      },
      { rootMargin: '120px', threshold: 0.05 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, eventSlug, observeRoot])

  // Suscripción al dato compartido: se monta una vez por slug y sobrevive a
  // los cambios de `inView` (antes cada entrada/salida de viewport disparaba
  // un fetch nuevo porque el efecto de carga dependía de esa bandera).
  useEffect(() => {
    if (!enabled || !eventSlug) return undefined

    const apply = (snapshot) => {
      if (snapshot.data) {
        setSummary(snapshot.data)
        setStatus('live')
        return
      }
      if (snapshot.failed) setStatus((prev) => (prev === 'live' ? 'live' : 'fallback'))
    }

    const unsubscribe = registrationSummaryStore.subscribe(eventSlug, apply)
    const current = registrationSummaryStore.read(eventSlug)
    if (current) apply(current)
    registrationSummaryStore.load(eventSlug).catch(() => {
      setStatus((prev) => (prev === 'live' ? 'live' : 'fallback'))
    })

    return unsubscribe
  }, [enabled, eventSlug])

  // Refresco periódico: en viewport y con la pestaña adelante. Una pestaña en
  // segundo plano no gasta red ni batería, y al volver se pide una vez.
  useEffect(() => {
    if (!enabled || !eventSlug || !inView) return undefined

    let timerId = null

    const refresh = () => {
      registrationSummaryStore.load(eventSlug, { force: true }).catch(() => {})
    }

    const start = () => {
      if (timerId != null) return
      timerId = window.setInterval(refresh, pollMs)
    }

    const stop = () => {
      if (timerId == null) return
      window.clearInterval(timerId)
      timerId = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh()
        start()
        return
      }
      stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, eventSlug, inView, pollMs])

  const registered = status === 'live' && summary ? summary.registered : fallbackRegistered
  const slots =
    status === 'live' && summary && summary.capacity != null ? summary.capacity : fallbackSlots
  const recent = status === 'live' && summary ? summary.recent : []

  return {
    status,
    registered,
    slots,
    recent,
    remaining: status === 'live' ? (summary?.remaining ?? null) : null,
    inView,
    observeRef: observeNodeRef,
  }
}
