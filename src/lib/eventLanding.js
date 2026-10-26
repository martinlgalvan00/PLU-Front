/**
 * Landings de evento por plantilla + slots — PLU ARG
 *
 * El layout vive en código (`meet` / `editorial`). El staff solo elige plantilla
 * y completa slots acotados. Sin HTML libre ni page builder.
 *
 * Compat: si no hay `landing` en rules, default `meet` y los slots del hero
 * se rellenan desde `publicCopy` (el copy histórico del panel).
 */

import { normalizeEventPublicCopy } from './eventPublicSurface.js'
import { layoutPayloadForMerge, normalizeLandingLayout } from './eventLandingLayout.js'
import { hasCustomLandingMotion, normalizeLandingMotion } from './eventLandingMotion.js'
import { normalizeLandingPalette } from './eventLandingPalette.js'

/** Compat pre-migración: mismo slug canónico que `eventNavigation`. */
const LEGACY_EDITORIAL_SLUG = 'pitbull-classic-2026'
const BARBELL_SUBMISSION_SLUG_PREFIX = 'barbell-submission'

export const EVENT_LANDING_TEMPLATES = Object.freeze(['meet', 'editorial', 'submission', 'builder'])

export const EVENT_LANDING_PHASES = Object.freeze(['coming_soon', 'published'])

export const DEFAULT_EVENT_LANDING_TEMPLATE = 'meet'

/** Temas de acento por evento (tokens de palette.css, sin colores inventados). */
export const EVENT_LANDING_THEMES = Object.freeze([
  'plu-default',
  'night-steel',
  'ember',
  'clean-light',
])

export const DEFAULT_EVENT_LANDING_THEME = 'plu-default'

/** Límites espejo de Zod / RPC. */
export const EVENT_LANDING_SLOT_LIMITS = Object.freeze({
  heroTitle: 120,
  heroLead: 240,
  ctaLabel: 40,
  inscriptionMark: 40,
  inscriptionNote: 160,
  experienceTitle: 120,
  experienceBody: 800,
  categoriesTitle: 120,
  categoriesBody: 800,
  locationTitle: 120,
  locationBody: 800,
  heroImagePath: 200,
  metaTitle: 70,
  metaDescription: 160,
  faq1Question: 120,
  faq1Answer: 400,
  faq2Question: 120,
  faq2Answer: 400,
  faq3Question: 120,
  faq3Answer: 400,
})

/** Pares pregunta/respuesta de la FAQ, en orden de lectura. */
export const FAQ_SLOT_KEYS = Object.freeze([
  'faq1Question',
  'faq1Answer',
  'faq2Question',
  'faq2Answer',
  'faq3Question',
  'faq3Answer',
])

export const EMPTY_EVENT_LANDING_SLOTS = Object.freeze({
  heroTitle: '',
  heroLead: '',
  ctaLabel: '',
  inscriptionMark: '',
  inscriptionNote: '',
  experienceTitle: '',
  experienceBody: '',
  categoriesTitle: '',
  categoriesBody: '',
  locationTitle: '',
  locationBody: '',
  heroImagePath: '',
  metaTitle: '',
  metaDescription: '',
  faq1Question: '',
  faq1Answer: '',
  faq2Question: '',
  faq2Answer: '',
  faq3Question: '',
  faq3Answer: '',
})

/** Slots del hero / cupo (comunes). */
const COMMON_SLOTS = [
  'heroTitle',
  'heroLead',
  'ctaLabel',
  'inscriptionMark',
  'inscriptionNote',
  'heroImagePath',
  'metaTitle',
  'metaDescription',
  'faq1Question',
  'faq1Answer',
  'faq2Question',
  'faq2Answer',
  'faq3Question',
  'faq3Answer',
]

/** Slots que se muestran / editan por plantilla. */
export const EVENT_LANDING_SLOTS_BY_TEMPLATE = Object.freeze({
  meet: [...COMMON_SLOTS],
  editorial: [
    ...COMMON_SLOTS,
    'experienceTitle',
    'experienceBody',
    'categoriesTitle',
    'categoriesBody',
    'locationTitle',
    'locationBody',
  ],
  submission: [
    ...COMMON_SLOTS,
    'experienceTitle',
    'experienceBody',
    'categoriesTitle',
    'categoriesBody',
    'locationTitle',
    'locationBody',
  ],
  builder: [
    ...COMMON_SLOTS,
    'experienceTitle',
    'experienceBody',
    'categoriesTitle',
    'categoriesBody',
    'locationTitle',
    'locationBody',
  ],
})

/**
 * Recorta al tope sin tocar los espacios: el panel normaliza en cada tecla y
 * recortar acá se comía el espacio de "uno dos" apenas se escribía. El `trim`
 * se hace al guardar (`landingPayloadForMerge`).
 */
function clipSlot(value, max) {
  return String(value ?? '').slice(0, max)
}

function isSafeHeroImagePath(path) {
  if (!path) return true
  if (path.length > EVENT_LANDING_SLOT_LIMITS.heroImagePath) return false
  if (path.includes('..')) return false
  return /^[A-Za-z0-9._()+/-]+$/.test(path)
}

/**
 * @param {unknown} raw
 * @returns {'meet' | 'editorial' | 'submission' | 'builder'}
 */
export function normalizeEventLandingTemplateId(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
  return EVENT_LANDING_TEMPLATES.includes(value) ? value : DEFAULT_EVENT_LANDING_TEMPLATE
}

export function normalizeEventLandingPhase(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
  return EVENT_LANDING_PHASES.includes(value) ? value : 'coming_soon'
}

/**
 * @param {unknown} raw
 * @returns {(typeof EVENT_LANDING_THEMES)[number]}
 */
export function normalizeEventLandingThemeId(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
  return EVENT_LANDING_THEMES.includes(value) ? value : DEFAULT_EVENT_LANDING_THEME
}

/**
 * @param {unknown} raw
 * @param {{ publicCopy?: unknown }} [compat]
 */
export function normalizeEventLandingSlots(raw, compat = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const fromCopy = normalizeEventPublicCopy(compat.publicCopy)
  const text = (key) => {
    const max = EVENT_LANDING_SLOT_LIMITS[key]
    const own = source[key]
    if (own != null && String(own).trim() !== '') return clipSlot(own, max)
    if (key === 'heroTitle' && fromCopy.publicTitle) return fromCopy.publicTitle
    if (key === 'heroLead' && fromCopy.heroLead) return fromCopy.heroLead
    if (key === 'ctaLabel' && fromCopy.ctaLabel) return fromCopy.ctaLabel
    if (key === 'inscriptionMark' && fromCopy.inscriptionMark) return fromCopy.inscriptionMark
    if (key === 'inscriptionNote' && fromCopy.inscriptionNote) return fromCopy.inscriptionNote
    return ''
  }

  const heroImagePath = clipSlot(source.heroImagePath, EVENT_LANDING_SLOT_LIMITS.heroImagePath)
  return {
    heroTitle: text('heroTitle'),
    heroLead: text('heroLead'),
    ctaLabel: text('ctaLabel'),
    inscriptionMark: text('inscriptionMark'),
    inscriptionNote: text('inscriptionNote'),
    experienceTitle: text('experienceTitle'),
    experienceBody: text('experienceBody'),
    categoriesTitle: text('categoriesTitle'),
    categoriesBody: text('categoriesBody'),
    locationTitle: text('locationTitle'),
    locationBody: text('locationBody'),
    heroImagePath: isSafeHeroImagePath(heroImagePath) ? heroImagePath : '',
    metaTitle: text('metaTitle'),
    metaDescription: text('metaDescription'),
    faq1Question: text('faq1Question'),
    faq1Answer: text('faq1Answer'),
    faq2Question: text('faq2Question'),
    faq2Answer: text('faq2Answer'),
    faq3Question: text('faq3Question'),
    faq3Answer: text('faq3Answer'),
  }
}

/**
 * @param {unknown} raw
 * @param {{ publicCopy?: unknown, slug?: string }} [compat]
 */
export function normalizeEventLanding(raw, compat = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  let templateId = normalizeEventLandingTemplateId(source.templateId)

  if (
    (!source.templateId || String(source.templateId).trim() === '') &&
    compat.slug === LEGACY_EDITORIAL_SLUG
  ) {
    templateId = 'editorial'
  }
  if (
    (!source.templateId || String(source.templateId).trim() === '') &&
    String(compat.slug ?? '')
      .toLowerCase()
      .startsWith(BARBELL_SUBMISSION_SLUG_PREFIX)
  ) {
    templateId = 'submission'
  }

  return {
    templateId,
    themeId: normalizeEventLandingThemeId(source.themeId),
    publicVisible: source.publicVisible !== false,
    phase: normalizeEventLandingPhase(source.phase),
    slots: normalizeEventLandingSlots(source.slots, { publicCopy: compat.publicCopy }),
    ...normalizeLayoutField(templateId, source.layout),
  }
}

/**
 * `layout` solo viaja cuando hace falta: el Constructor siempre lo lleva (bloques
 * + paleta + animaciones); el resto de las plantillas solo si el staff les puso
 * colores o animaciones propias. Así las landings existentes conservan su forma.
 */
function normalizeLayoutField(templateId, rawLayout) {
  if (templateId === 'builder') return { layout: normalizeLandingLayout(rawLayout) }
  const palette = normalizeLandingPalette(rawLayout?.palette)
  const customMotion = hasCustomLandingMotion(rawLayout?.motion)
  if (Object.keys(palette).length === 0 && !customMotion) return {}
  return {
    layout: { blocks: [], palette, motion: normalizeLandingMotion(rawLayout?.motion) },
  }
}

/** Landing normalizada desde un evento ya mapeado. */
export function eventLandingFromEvent(event) {
  return normalizeEventLanding(event?.landing, {
    publicCopy: event?.publicCopy,
    slug: event?.slug,
  })
}

export function eventLandingTemplateId(event) {
  return eventLandingFromEvent(event).templateId
}

export function eventLandingThemeId(event) {
  return eventLandingFromEvent(event).themeId
}

export function eventHasEditorialLanding(event) {
  return eventLandingTemplateId(event) === 'editorial'
}

export function eventHasSubmissionLanding(event) {
  return eventLandingTemplateId(event) === 'submission'
}

export function eventHasBuilderLanding(event) {
  return eventLandingTemplateId(event) === 'builder'
}

/** Colores propios del evento (vacío = rige el tema). */
export function eventLandingPalette(event) {
  return eventLandingFromEvent(event).layout?.palette ?? {}
}

export function eventLandingIsPublic(event) {
  return eventLandingFromEvent(event).publicVisible
}

/** Interruptor apagado: el público ve "Plataforma en construcción". */
export function eventLandingUnderConstruction(event) {
  return !eventLandingFromEvent(event).publicVisible
}

export function eventLandingPhase(event) {
  return eventLandingFromEvent(event).phase
}

/**
 * FAQ con pregunta y respuesta. Vacío o incompleto no se publica.
 * @param {object} [slots]
 * @returns {{ question: string, answer: string }[]}
 */
export function eventLandingFaqItems(slots) {
  const normalized = normalizeEventLandingSlots(slots)
  return [1, 2, 3]
    .map((index) => ({
      question: normalized[`faq${index}Question`],
      answer: normalized[`faq${index}Answer`],
    }))
    .filter((item) => item.question && item.answer)
}

/**
 * Meta SEO de la landing. Vacío = caer a i18n / título del evento.
 * @param {object} [event]
 */
export function eventLandingSeo(event) {
  const landing = eventLandingFromEvent(event)
  const titleFallback = landing.slots.heroTitle || event?.title || ''
  return {
    title: landing.slots.metaTitle || titleFallback,
    description: landing.slots.metaDescription || landing.slots.heroLead || '',
    hasCustomTitle: Boolean(landing.slots.metaTitle),
    hasCustomDescription: Boolean(landing.slots.metaDescription),
  }
}

/**
 * Proyecta slots del hero al shape `publicCopy` que ya consumen ficha / Pitbull /
 * inscripción. Así el guardado de landing mantiene compatibilidad.
 */
export function publicCopyFromLandingSlots(slots) {
  const normalized = normalizeEventLandingSlots(slots)
  return normalizeEventPublicCopy({
    publicTitle: normalized.heroTitle,
    heroLead: normalized.heroLead,
    ctaLabel: normalized.ctaLabel,
    inscriptionMark: normalized.inscriptionMark,
    inscriptionNote: normalized.inscriptionNote,
  })
}

/**
 * Une un patch de publicCopy al landing del draft (hero slots).
 */
export function syncLandingSlotsFromPublicCopy(landing, publicCopy) {
  const current = normalizeEventLanding(landing)
  const copy = normalizeEventPublicCopy(publicCopy)
  return {
    templateId: current.templateId,
    themeId: current.themeId,
    publicVisible: current.publicVisible,
    phase: current.phase,
    slots: {
      ...current.slots,
      heroTitle: copy.publicTitle,
      heroLead: copy.heroLead,
      ctaLabel: copy.ctaLabel,
      inscriptionMark: copy.inscriptionMark,
      inscriptionNote: copy.inscriptionNote,
    },
    ...(current.layout ? { layout: current.layout } : {}),
  }
}

/**
 * Payload listo para la RPC `staff_merge_event_landing`.
 */
export function landingPayloadForMerge(landing) {
  const normalized = normalizeEventLanding(landing)
  return {
    templateId: normalized.templateId,
    themeId: normalized.themeId,
    publicVisible: normalized.publicVisible,
    phase: normalized.phase,
    slots: Object.fromEntries(
      Object.entries(normalized.slots).map(([key, value]) => [key, String(value ?? '').trim()]),
    ),
    ...(normalized.layout
      ? { layout: layoutPayloadForMerge(normalized.layout, { templateId: normalized.templateId }) }
      : {}),
  }
}

export function emptyEventLanding(
  templateId = DEFAULT_EVENT_LANDING_TEMPLATE,
  themeId = DEFAULT_EVENT_LANDING_THEME,
) {
  return {
    templateId: normalizeEventLandingTemplateId(templateId),
    themeId: normalizeEventLandingThemeId(themeId),
    publicVisible: true,
    phase: 'coming_soon',
    slots: { ...EMPTY_EVENT_LANDING_SLOTS },
    ...(normalizeEventLandingTemplateId(templateId) === 'builder'
      ? { layout: normalizeLandingLayout(null) }
      : {}),
  }
}
