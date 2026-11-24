/**
 * Secciones de la landing de un evento — PLU ARG
 *
 * Une en un solo mapa lo que antes vivía repartido: qué módulo se puede
 * apagar (`publicSurface`) y qué textos lo alimentan (`landing.slots` /
 * `publicCopy`). El editor lo usa para mostrar cada sección con su interruptor
 * y su contenido juntos. No guarda nada nuevo: los datos siguen siendo los de
 * `eventPublicSurface.js` y `eventLanding.js`.
 */

import { eventHasCustomPublicPage, normalizeEventPublicSurface } from './eventPublicSurface.js'
import { FAQ_SLOT_KEYS } from './eventLanding.js'

/**
 * `surfaceKey`: módulo de `publicSurface` que la apaga (null = siempre visible).
 * `scope`: `all` aplica a la ficha genérica y a las landings propias; `custom`
 * solo a las landings propias (editorial / submission).
 * `fields`: slots de `landing.slots` que edita la sección.
 * `copyFields`: campos de `publicCopy` (cupo público).
 * Orden = orden sugerido de lectura en la landing propia.
 */
export const EVENT_LANDING_SECTIONS = Object.freeze([
  { id: 'hero', surfaceKey: null, scope: 'all', fields: ['heroTitle', 'heroLead', 'ctaLabel'] },
  { id: 'countdown', surfaceKey: 'countdown', scope: 'custom', fields: [] },
  {
    id: 'experience',
    surfaceKey: 'experience',
    scope: 'custom',
    fields: ['experienceTitle', 'experienceBody'],
  },
  {
    id: 'inscription',
    surfaceKey: null,
    scope: 'all',
    fields: [],
    copyFields: ['inscriptionMark', 'inscriptionNote'],
  },
  {
    id: 'categories',
    surfaceKey: 'categories',
    scope: 'custom',
    fields: ['categoriesTitle', 'categoriesBody'],
  },
  { id: 'weighIns', surfaceKey: 'weighIns', scope: 'all', fields: [] },
  { id: 'schedule', surfaceKey: 'schedule', scope: 'all', fields: [] },
  {
    id: 'location',
    surfaceKey: 'location',
    scope: 'custom',
    fields: ['locationTitle', 'locationBody'],
  },
  { id: 'tickets', surfaceKey: 'tickets', scope: 'custom', fields: [] },
  { id: 'recentRegistrants', surfaceKey: 'recentRegistrants', scope: 'all', fields: [] },
  { id: 'livestream', surfaceKey: 'livestream', scope: 'all', fields: [] },
  { id: 'calendar', surfaceKey: 'calendar', scope: 'all', fields: [] },
  { id: 'faq', surfaceKey: 'faq', scope: 'all', fields: [...FAQ_SLOT_KEYS] },
])

/**
 * Secciones que existen para este evento según su plantilla.
 * @param {object} [event] evento o borrador (usa `landing.templateId` y `slug`)
 */
export function landingSectionsForEvent(event) {
  const custom = eventHasCustomPublicPage(event)
  return EVENT_LANDING_SECTIONS.filter((section) => section.scope === 'all' || custom)
}

/** ¿La sección se muestra? Las que no tienen interruptor siempre se muestran. */
export function isLandingSectionVisible(section, publicSurface) {
  if (!section.surfaceKey) return true
  return normalizeEventPublicSurface(publicSurface)[section.surfaceKey]
}

/**
 * Cuántos textos propios cargó el staff en la sección (sobre el total que
 * admite). Sirve para distinguir "texto propio" de "texto por defecto".
 * @param {{ fields: string[], copyFields?: string[] }} section
 * @param {{ slots?: object }} landing landing normalizada
 * @param {object} [publicCopy]
 * @returns {{ filled: number, total: number }}
 */
export function landingSectionContent(section, landing, publicCopy) {
  const slots = landing?.slots ?? {}
  const copy = publicCopy ?? {}
  const values = [
    ...section.fields.map((key) => slots[key]),
    ...(section.copyFields ?? []).map((key) => copy[key]),
  ]
  return {
    filled: values.filter((value) => String(value ?? '').trim() !== '').length,
    total: values.length,
  }
}
