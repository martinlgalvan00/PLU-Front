/**
 * Qué bloques del evento se muestran en el sitio público.
 * Ausente o incompleto = todo encendido: no cambia el catálogo actual.
 *
 * `all`: ficha genérica y páginas custom.
 * `custom`: landings de formato propio (`editorial` o `submission`).
 *
 * No importar `eventLanding.js` acá: ese módulo ya importa `normalizeEventPublicCopy`
 * de este archivo (compat hero ← publicCopy).
 */

/** Compat pre-migración: mismo slug que `eventNavigation.PITBULL_CLASSIC_SLUG`. */
const LEGACY_EDITORIAL_SLUG = 'pitbull-classic-2026'

export const EVENT_PUBLIC_SURFACE_MODULES = [
  { key: 'calendar', scope: 'all' },
  { key: 'weighIns', scope: 'all' },
  { key: 'schedule', scope: 'all' },
  { key: 'recentRegistrants', scope: 'all' },
  { key: 'livestream', scope: 'all' },
  { key: 'faq', scope: 'all' },
  { key: 'experience', scope: 'custom' },
  { key: 'categories', scope: 'custom' },
  { key: 'location', scope: 'custom' },
  { key: 'tickets', scope: 'custom' },
  { key: 'countdown', scope: 'custom' },
]

export const DEFAULT_EVENT_PUBLIC_SURFACE = Object.fromEntries(
  EVENT_PUBLIC_SURFACE_MODULES.map((module) => [module.key, true]),
)

export function eventHasCustomPublicPage(event) {
  const templateId = String(event?.landing?.templateId ?? '')
    .trim()
    .toLowerCase()
  if (templateId === 'editorial' || templateId === 'submission') return true
  if (templateId === 'meet') return false
  return event?.slug === LEGACY_EDITORIAL_SLUG
}

export function normalizeEventPublicSurface(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const next = {}
  for (const module of EVENT_PUBLIC_SURFACE_MODULES) {
    next[module.key] = source[module.key] !== false
  }
  return next
}

export function eventPublicSurfaceFromEvent(event) {
  return normalizeEventPublicSurface(event?.publicSurface)
}

export function publicSurfaceModulesForEvent(event) {
  const custom = eventHasCustomPublicPage(event)
  return EVENT_PUBLIC_SURFACE_MODULES.filter((module) => module.scope === 'all' || custom)
}

export function eventShowsPublicCalendar(event) {
  return eventPublicSurfaceFromEvent(event).calendar
}

export function eventShowsPublicWeighIns(event) {
  return eventPublicSurfaceFromEvent(event).weighIns
}

export function eventShowsPublicSchedule(event) {
  return eventPublicSurfaceFromEvent(event).schedule
}

export function eventShowsPublicRecentRegistrants(event) {
  return eventPublicSurfaceFromEvent(event).recentRegistrants
}

export function eventShowsPublicLivestream(event) {
  return eventPublicSurfaceFromEvent(event).livestream
}

export function eventShowsPublicExperience(event) {
  return eventPublicSurfaceFromEvent(event).experience
}

export function eventShowsPublicCategories(event) {
  return eventPublicSurfaceFromEvent(event).categories
}

export function eventShowsPublicLocation(event) {
  return eventPublicSurfaceFromEvent(event).location
}

export function eventShowsPublicFaq(event) {
  return eventPublicSurfaceFromEvent(event).faq
}

export function eventShowsPublicTickets(event) {
  return eventPublicSurfaceFromEvent(event).tickets
}

export function eventShowsPublicCountdown(event) {
  return eventPublicSurfaceFromEvent(event).countdown
}

/** Los textos del hero y del cupo público que cambian por evento. Vacío = cae al default. */
export const EMPTY_EVENT_PUBLIC_COPY = Object.freeze({
  publicTitle: '',
  heroLead: '',
  ctaLabel: '',
  inscriptionMark: '',
  inscriptionNote: '',
})

/**
 * Copy público normalizado. Recorta y no inventa: un campo vacío queda vacío
 * para que el front caiga a su default de diseño en vez de pintar un string
 * a medias.
 */
export function normalizeEventPublicCopy(source) {
  const value = source && typeof source === 'object' ? source : {}
  const text = (key, max) => String(value[key] ?? '').trim().slice(0, max)
  return {
    publicTitle: text('publicTitle', 120),
    heroLead: text('heroLead', 240),
    ctaLabel: text('ctaLabel', 40),
    inscriptionMark: text('inscriptionMark', 40),
    inscriptionNote: text('inscriptionNote', 160),
  }
}

/** Título con el que se presenta el evento en público. */
export function eventPublicTitle(event) {
  return normalizeEventPublicCopy(event?.publicCopy).publicTitle || (event?.title ?? '')
}
