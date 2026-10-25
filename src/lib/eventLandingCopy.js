import { normalizeEventLanding } from './eventLanding.js'

/**
 * Copiar la landing de otro evento — PLU ARG
 *
 * Armar un meet parecido a uno anterior no debería costar rehacer la página:
 * se trae el diseño (plantilla, tema, colores, animación y bloques, incluidos
 * los propios con su contenido) y, si se pide, los textos de las secciones.
 *
 * Lo que es de ESTE evento no se pisa nunca: el título de la portada, la foto
 * principal, el SEO, si la página se ve o no y la fase de Submission.
 */

/** Textos que identifican al evento: aunque se copien los textos, quedan los propios. */
const OWN_SLOTS = Object.freeze(['heroTitle', 'heroImagePath', 'metaTitle', 'metaDescription'])

function startsAtOf(event) {
  const value = event?.startsAt ?? event?.starts_at ?? event?.dateISO ?? null
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : 0
}

/**
 * Eventos de los que se puede copiar: todos menos el que se edita, los más
 * recientes primero (lo habitual es partir del último meet).
 */
export function landingCopySources(events = [], currentEventId = null) {
  return events
    .filter((event) => event && (event.id ?? event.slug) && event.id !== currentEventId)
    .filter((event) => event.landing)
    .slice()
    .sort((a, b) => startsAtOf(b) - startsAtOf(a))
}

/**
 * La landing del evento destino con el diseño (y opcionalmente los textos) del
 * evento origen. Devuelve una landing normalizada lista para `patchLanding`.
 */
export function copyLandingFrom(targetLanding, sourceEvent, { includeTexts = false } = {}) {
  const target = normalizeEventLanding(targetLanding)
  const source = normalizeEventLanding(sourceEvent?.landing, {
    publicCopy: sourceEvent?.publicCopy,
    slug: sourceEvent?.slug,
  })

  const slots = includeTexts
    ? {
        ...source.slots,
        ...Object.fromEntries(OWN_SLOTS.map((key) => [key, target.slots[key]])),
      }
    : target.slots

  const copied = {
    ...target,
    templateId: source.templateId,
    themeId: source.themeId,
    slots,
  }
  if (source.layout) copied.layout = source.layout
  else delete copied.layout

  return normalizeEventLanding(copied)
}
