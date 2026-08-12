import { isAppProduction, resolvePaidCheckoutOverride } from './featureAvailability.js'
import { isRegistrationOpen } from './status.js'

function toValidMs(value) {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * Fecha/hora de apertura administrada en el evento (`registrationOpensAt` /
 * "Abre la inscripción" en el panel). Fuente de verdad del countdown y del
 * gate de cobros en producción — sin variables de entorno de fecha.
 */
export function resolveRegistrationOpensAt(event, { targetDate = null } = {}) {
  const raw = targetDate || event?.registrationOpensAt || null
  if (!raw) return null
  return toValidMs(raw) == null ? null : String(raw)
}

/**
 * La ventana de inscripción del evento ya empezó según la fecha del admin.
 * Si no hay fecha, cae al status público.
 */
export function hasRegistrationScheduleStarted(event, now = new Date()) {
  const opensAt = resolveRegistrationOpensAt(event)
  if (!opensAt) return isRegistrationOpen(event?.status)

  const opensMs = toValidMs(opensAt)
  if (opensMs == null) return isRegistrationOpen(event?.status)
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  return nowMs >= opensMs
}

/** Countdown: solo la fecha del admin del evento. */
export function resolveLaunchOpenAt({ event, targetDate = null } = {}) {
  return resolveRegistrationOpensAt(event, { targetDate })
}

/**
 * Fecha futura para countdown de marketing (teaser soft-launch).
 * Prefiere `registrationOpensAt` del evento si todavía no venció;
 * si ya pasó o falta, usa `fallback` (catálogo local / fecha de campaña).
 */
export function resolveFutureLaunchAt(event, { fallback = null, now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  for (const raw of [event?.registrationOpensAt, fallback]) {
    if (!raw) continue
    const ms = toValidMs(raw)
    if (ms != null && ms > nowMs) return String(raw)
  }
  return null
}

/**
 * Label legible para datetime ISO completo (no usa formatShortDate date-only).
 */
export function formatRegistrationOpenMoment(iso, locale = 'es') {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return null

  const tag = locale === 'en' ? 'en-US' : 'es-AR'
  const timeZone = 'America/Argentina/Buenos_Aires'
  const day = date
    .toLocaleDateString(tag, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone,
    })
    .replace(/\.$/, '')
  const time = date.toLocaleTimeString(tag, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })

  return { day, time }
}

/**
 * Cobros/inscripciones de pago abiertos:
 * - override env PAID_CHECKOUT_ENABLED (kill switch opcional)
 * - fuera de producción: abierto (dev/preview)
 * - en producción: solo si `registrationOpensAt` del admin ya pasó
 *
 * No cae al status público (`inscripcion_abierta`): con APP_PRODUCTION=true
 * sin fecha de apertura los cobros quedan cerrados (“Próximamente”).
 * Crear cuenta / perfil no usa este gate.
 */
export function isPaidCheckoutOpen(event, envLike, now = new Date()) {
  const override = resolvePaidCheckoutOverride(envLike)
  if (override !== null) return override
  if (!isAppProduction(envLike)) return true
  if (!event) return false

  const opensAt = resolveRegistrationOpensAt(event)
  if (!opensAt) return false

  const opensMs = toValidMs(opensAt)
  if (opensMs == null) return false
  const nowMs = now instanceof Date ? now.getTime() : Number(now)
  return nowMs >= opensMs
}
