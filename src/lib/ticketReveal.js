import { MAX_TICKET_ACCESS_DURATION_MINUTES } from './ticketValidityPolicy.js'

/**
 * Cuándo el comprador puede ver el QR y el código de puerta.
 *
 * No es la vigencia de ingreso: `validFrom` sigue siendo el instante en que
 * la puerta acepta el scan. Esta anticipación sólo abre la visualización,
 * como en Venti y Movistar Arena. `0` muestra el pase al acreditar.
 */

export const DEFAULT_TICKET_REVEAL_LEAD_MINUTES = 24 * 60

export const MAX_TICKET_REVEAL_LEAD_MINUTES = MAX_TICKET_ACCESS_DURATION_MINUTES

export const MAX_TICKET_REVEAL_LEAD_HOURS = MAX_TICKET_REVEAL_LEAD_MINUTES / 60

export const TICKET_REVEAL_LEAD_HOUR_PRESETS = Object.freeze([0, 12, 24, 48])

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires'

function timestamp(value) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function clampLeadMinutes(value) {
  const minutes = Number(value)
  if (!Number.isFinite(minutes) || minutes < 0) return null
  return Math.min(Math.round(minutes), MAX_TICKET_REVEAL_LEAD_MINUTES)
}

/**
 * Minutos de anticipación del evento. Sin dato, 24 horas: es el protocolo
 * nuevo, no el pase visible al pagar.
 */
export function resolveTicketRevealLeadMinutes(event) {
  const raw = event?.ticket_reveal_lead_minutes ?? event?.ticketRevealLeadMinutes
  return clampLeadMinutes(raw) ?? DEFAULT_TICKET_REVEAL_LEAD_MINUTES
}

export function ticketRevealLeadHoursFromMinutes(minutes) {
  const clamped = clampLeadMinutes(minutes)
  if (clamped == null) return DEFAULT_TICKET_REVEAL_LEAD_MINUTES / 60
  return Math.round(clamped / 60)
}

export function ticketRevealLeadMinutesFromHours(hours) {
  const whole = Number(hours)
  if (!Number.isFinite(whole) || whole < 0) return DEFAULT_TICKET_REVEAL_LEAD_MINUTES
  return Math.min(Math.round(whole) * 60, MAX_TICKET_REVEAL_LEAD_MINUTES)
}

/**
 * @param {object} ticket
 * @param {number} [leadMinutes]
 * @param {Date} [now]
 * @returns {{ sealed: boolean, revealAt: string | null, validFrom: string | null }}
 *
 * Sin `validFrom` no hay reloj que correr: la entrada se ve. Cubre filas
 * viejas y cualquier lectura que todavía no congeló la vigencia.
 */
export function ticketRevealState(ticket, leadMinutes = DEFAULT_TICKET_REVEAL_LEAD_MINUTES, now = new Date()) {
  const validFromMs = timestamp(ticket?.validFrom ?? ticket?.valid_from)
  const lead = clampLeadMinutes(leadMinutes) ?? DEFAULT_TICKET_REVEAL_LEAD_MINUTES
  if (validFromMs == null) {
    return { sealed: false, revealAt: null, validFrom: null }
  }
  const validFrom = new Date(validFromMs).toISOString()
  // 0 es el escape: el pase se ve al acreditar, aunque la puerta todavía
  // no abra. No es "se ve en validFrom".
  if (lead === 0) {
    return { sealed: false, revealAt: null, validFrom }
  }
  const current = now instanceof Date ? now.getTime() : timestamp(now)
  const revealMs = validFromMs - lead * 60 * 1000
  return {
    sealed: current != null && current < revealMs,
    revealAt: new Date(revealMs).toISOString(),
    validFrom,
  }
}

/**
 * Parte una compra en pases ya visibles y pases todavía reservados.
 * `revealAt` es el primero que se habilita entre los que faltan.
 */
export function partitionTicketsByReveal(tickets = [], event = null, now = new Date()) {
  const leadMinutes = resolveTicketRevealLeadMinutes(event)
  const visible = []
  const sealed = []
  for (const ticket of Array.isArray(tickets) ? tickets : []) {
    const state = ticketRevealState(ticket, leadMinutes, now)
    const entry = { ticket, ...state }
    if (state.sealed) sealed.push(entry)
    else visible.push(entry)
  }
  const revealAt =
    sealed
      .map((entry) => entry.revealAt)
      .filter(Boolean)
      .sort()[0] ?? null
  return {
    leadMinutes,
    visible,
    sealed,
    revealAt,
    revealComplete: sealed.length === 0,
  }
}

/** Día y hora en Argentina, para el wallet y el mail. */
export function formatTicketRevealWhen(iso, locale = 'es') {
  const ms = timestamp(iso)
  if (ms == null) return ''
  const label = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ARGENTINA_TZ,
  }).format(new Date(ms))
  return locale === 'en' ? label : label.replace(',', '')
}
