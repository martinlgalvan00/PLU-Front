import { isDefaultOffering, normalizeEventOffering } from '../../shared/eventOffering.js'
import { eventLandingFromEvent } from './eventLanding.js'
import { normalizeEventPublicCopy } from './eventPublicSurface.js'
import { resolveEventSalesReadiness } from './eventSalesReadiness.js'

/**
 * Checklist de contenido «Listo para publicar» — PLU ARG
 *
 * Una sola vista de si lo que el público va a ver está completo: datos
 * básicos, landing (una oferta clara, una CTA, una imagen), ventana de
 * inscripción y cobro. El cobro NO se reevalúa acá: la fila `sales` sale del
 * semáforo de `resolveEventSalesReadiness`.
 *
 * Es informativo, igual que los avisos de cobro: nunca bloquea publicar.
 * `ready` solo dice que no queda nada en `todo`; los `warning` no cuentan, y la
 * imagen (`image`) se marca `todo` si falta pero tampoco frena el `ready`.
 *
 * Puro: sin DOM ni i18n. El copy vive en `admin.eventEditor.readiness.*`.
 * Acepta tanto el draft del editor (`buildAdminEventDraft`) como un evento
 * mapeado (`mapSupabaseEventRow`); ninguno se muta.
 */

export const PUBLISH_READINESS_GROUPS = Object.freeze(['basics', 'landing', 'registration', 'sales'])

/** Pestaña del editor donde se arregla cada ítem (para el «Ir a …»). */
export const PUBLISH_READINESS_TARGET_TAB = Object.freeze({
  title: 'basics',
  dates: 'basics',
  venue: 'basics',
  // Cupo y ventana viven en Ventas y cupos › Cupo, no en Datos.
  capacity: 'sales',
  offering: 'basics',
  landingLead: 'visibility',
  landingCta: 'visibility',
  image: 'visibility',
  registrationWindow: 'sales',
  sales: 'sales',
})

// Mismos estados que `OPEN_REGISTRATION_STATUSES` de eventAdminService; se
// repiten acá para que esta lib no dependa del servicio (que arrastra I/O).
const OPEN_REGISTRATION_STATUSES = new Set(['inscripcion_abierta', 'cupos_limitados'])

const SALES_STATE_BY_LEVEL = Object.freeze({ green: 'ok', yellow: 'warning', red: 'todo' })

/** Faltantes que se muestran como `todo` pero no cuentan para `ready` (nunca bloquean). */
const NON_BLOCKING_KEYS = new Set(['image'])

const hasText = (value) => String(value ?? '').trim() !== ''

/** Acepta `datetime-local` del draft ("2026-10-23T10:00") e ISO del evento. */
function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function datesState(event, now) {
  const startsAt = parseDate(event.startsAt)
  const endsAt = parseDate(event.endsAt)
  if (!startsAt || !endsAt || endsAt < startsAt) return 'todo'
  return startsAt < now ? 'warning' : 'ok'
}

function registrationWindowState(event, now) {
  if (!OPEN_REGISTRATION_STATUSES.has(event.status)) return 'ok'
  const closesAt = parseDate(event.registrationClosesAt)
  if (!closesAt) return 'ok'
  const opensAt = parseDate(event.registrationOpensAt)
  if (closesAt <= now) return 'todo'
  if (opensAt && closesAt <= opensAt) return 'todo'
  return 'ok'
}

/**
 * ¿El evento cobra algo? Inscripción con cobro (salvo modo «solo anuncio») o
 * entradas habilitadas. Mismo criterio que los avisos de cobro.
 */
function eventCharges(event) {
  return event.salesIntent !== 'announce' || event.pricing?.ticketsEnabled === true
}

/**
 * @param {object|null|undefined} draftOrEvent draft del editor o evento mapeado
 * @param {{ platform?: object|null, mpProfiles?: Array<object>, now?: Date }} [options]
 * @returns {{
 *   items: Array<{
 *     key: string,
 *     state: 'ok'|'todo'|'warning',
 *     group: 'basics'|'landing'|'registration'|'sales',
 *     target: string,
 *     detail?: string,
 *   }>,
 *   doneCount: number,
 *   total: number,
 *   ready: boolean,
 * }}
 */
export function resolveEventPublishReadiness(
  draftOrEvent,
  { platform = null, mpProfiles, now = new Date() } = {},
) {
  const event = draftOrEvent && typeof draftOrEvent === 'object' ? draftOrEvent : {}
  const landing = eventLandingFromEvent(event)
  const publicCopy = normalizeEventPublicCopy(event.publicCopy)

  // Draft: `slots`. Evento mapeado: `slots` (= capacity) o `capacity` crudo.
  const capacity = Number(event.slots ?? event.capacity)

  const hasLead =
    hasText(landing.slots.heroLead) || hasText(publicCopy.heroLead) || hasText(event.description)

  // CTA: el sitio tiene un texto por defecto («Inscribirme»), así que un
  // evento sin cobro puede dejarlo vacío sin que el público note nada. Si el
  // evento cobra, la CTA es la acción que lleva al pago: pedimos que el staff
  // la haya escrito a propósito (`todo` si falta). No bloquea.
  const hasCtaText = hasText(landing.slots.ctaLabel) || hasText(publicCopy.ctaLabel)
  const ctaState = hasCtaText || !eventCharges(event) ? 'ok' : 'todo'

  const hasImage =
    hasText(event.logoUrl) ||
    hasText(event.logoPath) ||
    hasText(event.heroImageUrl) ||
    hasText(landing.slots.heroImagePath)

  const offering = normalizeEventOffering(event.offering)

  const sales = resolveEventSalesReadiness(event, platform, { mpProfiles })

  const make = (key, group, state, extra = {}) => ({
    key,
    state,
    group,
    target: PUBLISH_READINESS_TARGET_TAB[key],
    ...extra,
  })

  const items = [
    make('title', 'basics', hasText(event.title) ? 'ok' : 'todo'),
    make('dates', 'basics', datesState(event, now)),
    make('venue', 'basics', hasText(event.venue) || hasText(event.location) ? 'ok' : 'todo'),
    make('capacity', 'basics', capacity > 0 ? 'ok' : 'todo'),
    // Informativo: la UI dice «todo se ofrece» vs «restringido» según `detail`.
    make('offering', 'basics', 'ok', {
      detail: isDefaultOffering(offering) ? 'default' : 'restricted',
    }),
    make('landingLead', 'landing', hasLead ? 'ok' : 'todo'),
    make('landingCta', 'landing', ctaState),
    make('image', 'landing', hasImage ? 'ok' : 'todo'),
    make('registrationWindow', 'registration', registrationWindowState(event, now)),
    make('sales', 'sales', SALES_STATE_BY_LEVEL[sales.level] ?? 'ok', { detail: sales.level }),
  ]

  // Los `warning` están «hechos» pero con reparo: no suman al contador.
  const doneCount = items.filter((item) => item.state === 'ok').length
  return {
    items,
    doneCount,
    total: items.length,
    ready: items.every((item) => item.state !== 'todo' || NON_BLOCKING_KEYS.has(item.key)),
  }
}
