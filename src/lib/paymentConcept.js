/**
 * paymentConcept.js — PLU ARG
 *
 * Cómo se declara un cobro, en un solo lugar: el título del ítem que viaja a
 * Mercado Pago (y por lo tanto al resumen de la tarjeta y a la app del
 * vendedor), el que sale en el email y el que se ve en pantalla.
 *
 * Hasta acá los tres decían `Afiliación PLU` — el mismo texto para el plan
 * anual, para el combo con inscripción y para una renovación. Mirando el cobro
 * no había forma de saber qué se pagó: ni el atleta en su resumen, ni Finanzas
 * en la app de Mercado Pago, donde todas las ventas se llamaban igual.
 *
 * Es pura a propósito y no toca i18n: la importan el adaptador de Mercado Pago,
 * los emails y la UI. El texto que ve el proveedor es el mismo para todos, y en
 * el resumen de una tarjeta argentina va en español.
 */

/** Modalidad del plan tal como se nombra en el cobro. */
const PLAN_MODALITY = {
  annual: 'anual',
  monthly: 'mensual',
  quarterly: 'trimestral',
  biannual: 'semestral',
}

function clean(value) {
  const text = String(value ?? '').trim()
  return text || null
}

/** Año declarado del ciclo: el de la afiliación, o el de la orden. */
function resolveYear({ membershipYear, fallbackYear }) {
  const year = clean(membershipYear) ?? clean(fallbackYear)
  if (!year) return null
  const match = year.match(/\d{4}/)
  return match ? match[0] : null
}

function membershipLabel({ planFrequency, membershipYear, fallbackYear, renewal }) {
  const modality = PLAN_MODALITY[String(planFrequency ?? '').toLowerCase()] ?? null
  const year = resolveYear({ membershipYear, fallbackYear })
  return [
    renewal ? 'Renovación de afiliación PLU' : 'Afiliación PLU',
    modality,
    year,
  ]
    .filter(Boolean)
    .join(' ')
}

function registrationLabel({ eventTitle }) {
  const title = clean(eventTitle)
  return title ? `Inscripción ${title}` : 'Inscripción a competencia'
}

function ticketsLabel({ eventTitle, ticketQuantity }) {
  const title = clean(eventTitle)
  const base = title ? `Entradas ${title}` : 'Entradas PLU ARG'
  const quantity = Number(ticketQuantity)
  return Number.isInteger(quantity) && quantity > 1 ? `${base} ×${quantity}` : base
}

/** Categoría y división de la inscripción, cuando ya están asignadas. */
function registrationDetail({ division, category }) {
  const parts = [clean(division), clean(category)].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/**
 * Descripción declarada de un cobro.
 *
 * @param {{
 *   concept?: string,
 *   planFrequency?: string|null,
 *   membershipYear?: string|number|null,
 *   fallbackYear?: string|number|null,
 *   renewal?: boolean,
 *   eventTitle?: string|null,
 *   division?: string|null,
 *   category?: string|null,
 *   ticketQuantity?: number|null,
 * }} input
 * @returns {{ title: string, detail: string|null, items: Array<{ kind: string, label: string, detail: string|null }> }}
 */
export function describePaymentConcept(input = {}) {
  const concept = String(input.concept ?? '').trim()
  const items = []

  if (concept === 'membership' || concept === 'combo') {
    items.push({ kind: 'membership', label: membershipLabel(input), detail: null })
  }
  if (concept === 'registration' || concept === 'combo') {
    items.push({
      kind: 'registration',
      label: registrationLabel(input),
      detail: registrationDetail(input),
    })
  }
  if (concept === 'tickets') {
    items.push({ kind: 'tickets', label: ticketsLabel(input), detail: null })
  }

  if (!items.length) {
    return { title: 'Pago PLU ARG', detail: null, items: [] }
  }

  return {
    title: items.map((item) => item.label).join(' + '),
    // El detalle no se mete en el título: Mercado Pago lo recorta y la división
    // sólo le importa a quien ya sabe a qué torneo se anotó.
    detail: items.map((item) => item.detail).filter(Boolean).join(' · ') || null,
    items,
  }
}

/** Título declarado, listo para el ítem de Mercado Pago o el asunto del email. */
export function paymentConceptTitle(input = {}) {
  return describePaymentConcept(input).title
}

/**
 * Traduce una fila de orden (snake_case de Supabase o camelCase de la API) a la
 * entrada de `describePaymentConcept`. Vive acá para que backend y frontend
 * armen la misma descripción a partir de la misma fila.
 */
export function paymentConceptInputFromOrder(order = {}, extra = {}) {
  const registration = Array.isArray(order.registration)
    ? (order.registration[0] ?? null)
    : (order.registration ?? null)
  const membership = Array.isArray(order.membership)
    ? (order.membership[0] ?? null)
    : (order.membership ?? null)
  const event = registration?.event ?? order.event ?? null
  const createdAt = order.created_at ?? order.createdAt ?? null

  return {
    concept: order.concept ?? null,
    planFrequency:
      extra.planFrequency ?? order.plan?.billing_frequency ?? order.planFrequency ?? null,
    membershipYear: membership?.year ?? extra.membershipYear ?? null,
    fallbackYear: createdAt ? String(createdAt).slice(0, 4) : null,
    eventTitle: event?.title ?? extra.eventTitle ?? null,
    division: registration?.division ?? null,
    category: registration?.category ?? null,
    ticketQuantity: extra.ticketQuantity ?? null,
  }
}
