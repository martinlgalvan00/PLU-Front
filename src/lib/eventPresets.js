/**
 * Presets de evento — PLU ARG
 *
 * Atajo del alta rápida: fija SOLO decisiones de política (acceso, plantilla de
 * landing e intención de venta). No toca título, fechas, sede, ciudad, cupo,
 * logo, precios ni medios de cobro. El staff puede cambiar todo después.
 *
 * Puro: sin DOM ni i18n. La UI traduce las claves de `describeEventPreset`.
 */

import { emptyEventLanding, normalizeEventLanding } from './eventLanding.js'

/**
 * Cambia solo `templateId`: conserva slots, tema y layout que ya tenía el draft
 * (mismo criterio que el selector de plantilla del alta).
 */
function withLandingTemplate(draft, templateId) {
  return {
    ...draft,
    landing: {
      ...normalizeEventLanding(draft.landing ?? emptyEventLanding(templateId)),
      templateId,
    },
  }
}

/** @type {Readonly<Record<string, { id: string, apply: (draft: object) => object }>>} */
export const EVENT_PRESETS = Object.freeze({
  blank: Object.freeze({
    id: 'blank',
    apply: (draft) => draft,
  }),
  meet: Object.freeze({
    id: 'meet',
    apply: (draft) => ({
      ...withLandingTemplate(draft, 'meet'),
      requiresMembership: true,
      salesIntent: 'charge',
    }),
  }),
  seminar: Object.freeze({
    id: 'seminar',
    apply: (draft) => ({
      ...withLandingTemplate(draft, 'editorial'),
      requiresMembership: false,
      salesIntent: 'charge',
    }),
  }),
  invitational: Object.freeze({
    id: 'invitational',
    apply: (draft) => ({
      ...withLandingTemplate(draft, 'submission'),
      requiresMembership: true,
      salesIntent: 'announce',
    }),
  }),
})

export const EVENT_PRESET_IDS = Object.freeze(Object.keys(EVENT_PRESETS))

export const DEFAULT_EVENT_PRESET_ID = 'blank'

/**
 * Devuelve un draft nuevo con la política del preset. No muta el original.
 * Un id desconocido (o `blank`) deja el draft como está.
 */
export function applyEventPreset(draft, presetId) {
  const preset = Object.hasOwn(EVENT_PRESETS, presetId) ? EVENT_PRESETS[presetId] : null
  const base = draft ?? {}
  if (!preset || presetId === 'blank') return base
  return preset.apply(base)
}

/**
 * Qué fija un preset, como claves para que la UI las traduzca:
 * `access` (members | open), `landing` (plantilla) y `sales` (charge | announce).
 * `blank` y los ids desconocidos no fijan nada: lista vacía.
 *
 * @returns {{ key: 'access' | 'landing' | 'sales', value: string }[]}
 */
export function describeEventPreset(presetId) {
  if (!Object.hasOwn(EVENT_PRESETS, presetId) || presetId === 'blank') return []
  const result = EVENT_PRESETS[presetId].apply({})
  return [
    { key: 'access', value: result.requiresMembership ? 'members' : 'open' },
    { key: 'landing', value: result.landing.templateId },
    { key: 'sales', value: result.salesIntent },
  ]
}
