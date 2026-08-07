import { useEffect, useRef, useState } from 'react'
import { fetchEventRegistrationSummary } from '../services/eventRegistrationApi.js'

const DEFAULT_POLL_MS = 20_000

/**
 * Cupos de inscripción live.
 * - Fetch inicial apenas hay slug.
 * - Polling solo mientras el target está en viewport (o siempre si no hay observeRoot).
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
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState('loading')
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
        : observeRoot?.current ?? null

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

  useEffect(() => {
    if (!enabled || !eventSlug) return undefined

    let active = true
    let timerId = null

    const load = () => {
      fetchEventRegistrationSummary(eventSlug)
        .then((next) => {
          if (!active) return
          setSummary(next)
          setStatus('live')
        })
        .catch(() => {
          if (!active) return
          setStatus((prev) => (prev === 'live' ? 'live' : 'fallback'))
        })
    }

    load()

    if (inView) {
      timerId = window.setInterval(load, pollMs)
    }

    return () => {
      active = false
      if (timerId) window.clearInterval(timerId)
    }
  }, [enabled, eventSlug, inView, pollMs])

  const registered =
    status === 'live' && summary ? summary.registered : fallbackRegistered
  const slots =
    status === 'live' && summary && summary.capacity != null
      ? summary.capacity
      : fallbackSlots
  const recent = status === 'live' && summary ? summary.recent : []

  return {
    status,
    registered,
    slots,
    recent,
    remaining: status === 'live' ? summary?.remaining ?? null : null,
    inView,
    observeRef: observeNodeRef,
  }
}
