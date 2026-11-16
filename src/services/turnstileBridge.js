import { env } from '../config/env.js'

const DEFAULT_TURNSTILE_URL = 'http://127.0.0.1:4877'
const OPEN_TIMEOUT_MS = 800

/** El molinete sólo se pulsa cuando el servidor ya registró el ingreso. */
export function shouldPulseTurnstile(outcome) {
  return outcome === 'checked_in'
}

/**
 * Avisa al agente local de la notebook. Si no contesta, el ingreso queda
 * registrado igual: quien opera puede reenviar el pulso sin un segundo check-in.
 */
export async function openTurnstile({
  url = env.turnstileUrl || DEFAULT_TURNSTILE_URL,
  pulseMs = 800,
  timeoutMs = OPEN_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${String(url).replace(/\/+$/, '')}/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pulseMs }),
      signal: controller.signal,
    })
    if (!response.ok) return { opened: false, reason: 'rejected' }
    return { opened: true }
  } catch {
    return { opened: false, reason: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

export async function pulseTurnstileIfAdmitted(outcome, open = openTurnstile) {
  if (!shouldPulseTurnstile(outcome)) return { opened: false, reason: 'not_admitted' }
  return open()
}
