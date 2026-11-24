import {
  resolveEventPublishChecks,
  INFORMATIONAL_PUBLISH_CHECKS,
} from './eventPublishChecks.js'
import { normalizeSalesIntent } from './eventSalesIntent.js'

export { EVENT_SALES_INTENTS, normalizeSalesIntent } from './eventSalesIntent.js'

/** Impiden cobrar bien: el semáforo va en rojo. */
export const SALES_READINESS_RED = new Set([
  'mpProfileMissing',
  'mpProfileNeedsReconnect',
  'noSellableTicketType',
  'noTicketChannel',
])

/** Cobro incompleto pero no bloqueante duro: amarillo. */
export const SALES_READINESS_YELLOW = new Set([
  'noRegistrationChannel',
  'transferWithoutDestination',
])

/**
 * Semáforo de venta del evento.
 *
 * - `announce` + sin rojos → verde (modo anuncio intencional).
 * - algún código rojo → rojo.
 * - algún amarillo (y no rojo) → amarillo.
 * - resto → verde (listo para cobrar).
 *
 * Los informativos (`mpUsingPlatformDefault`, `salesAnnounceMode`) no pintan.
 *
 * @returns {{
 *   level: 'green'|'yellow'|'red',
 *   mode: 'charge'|'announce',
 *   codes: string[],
 * }}
 */
export function resolveEventSalesReadiness(event, platform = null, options = {}) {
  const mode = normalizeSalesIntent(event?.salesIntent)
  const codes = resolveEventPublishChecks(event, platform, options)
  const actionable = codes.filter((code) => !INFORMATIONAL_PUBLISH_CHECKS.has(code))
  const hasRed = actionable.some((code) => SALES_READINESS_RED.has(code))
  const hasYellow = actionable.some((code) => SALES_READINESS_YELLOW.has(code))

  if (hasRed) return { level: 'red', mode, codes }
  if (mode === 'announce') return { level: 'green', mode, codes }
  if (hasYellow) return { level: 'yellow', mode, codes }
  return { level: 'green', mode, codes }
}
