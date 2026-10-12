import { useEffect, useState } from 'react'

/** setTimeout no acepta más de 2^31-1 ms: pasado ese tope se reintenta. */
const MAX_TIMEOUT_MS = 2_147_483_647
/** Margen para que el reloj del navegador ya esté del otro lado de la frontera. */
const BOUNDARY_PADDING_MS = 250

const SCHEDULE_FIELDS = ['registrationOpensAt', 'registrationClosesAt']

/**
 * Próximo instante (ms) en que alguna ventana de inscripción cambia de lado, o
 * `null` si no hay ninguna por delante.
 *
 * @param {Array<object>} events
 * @param {number} nowMs
 */
export function nextScheduleBoundary(events, nowMs) {
  let next = null
  for (const event of events ?? []) {
    for (const field of SCHEDULE_FIELDS) {
      const raw = event?.[field]
      if (!raw) continue
      const ms = new Date(raw).getTime()
      if (Number.isFinite(ms) && ms > nowMs && (next == null || ms < next)) next = ms
    }
  }
  return next
}

/**
 * Re-renderiza justo cuando vence o abre una ventana de inscripción.
 *
 * El estado público de un evento depende de la hora (cierre y apertura
 * programados), pero nada en la app cambia al pasar el tiempo: una pestaña
 * abierta seguía diciendo "Inscripción abierta" pasada la hora de cierre hasta
 * que algo la re-renderizara. En vez de un intervalo que despierta a toda la app
 * cada minuto, se agenda un único timeout al próximo cambio.
 *
 * @param {Array<object>} events Lista estable (la identidad dispara el reagendado).
 */
export function useScheduleClock(events) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const now = Date.now()
    const boundary = nextScheduleBoundary(events, now)
    if (boundary == null) return undefined
    const delay = Math.min(boundary - now + BOUNDARY_PADDING_MS, MAX_TIMEOUT_MS)
    const id = window.setTimeout(() => setTick((value) => value + 1), delay)
    return () => window.clearTimeout(id)
  }, [events, tick])

  return tick
}
