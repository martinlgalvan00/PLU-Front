import { DEFAULT_EVENT_PRICING } from '../../../lib/eventPricing.js'
import { normalizeEventLanding, syncLandingSlotsFromPublicCopy } from '../../../lib/eventLanding.js'
import { normalizeEventPublicSurface } from '../../../lib/eventPublicSurface.js'

/** Parches puros sobre el borrador del evento: devuelven un borrador nuevo. */

export function updatePricingField(draft, field, value) {
  return {
    ...draft,
    pricing: {
      ...DEFAULT_EVENT_PRICING,
      ...(draft.pricing ?? {}),
      [field]: value,
    },
  }
}

export function patchPublicSurface(draft, key, value) {
  return {
    ...draft,
    publicSurface: {
      ...normalizeEventPublicSurface(draft.publicSurface),
      [key]: value,
    },
  }
}

/** Un patch de `publicCopy` también actualiza los slots del hero de `landing`. */
export function patchDraftPublicCopy(draft, publicCopyPatch) {
  const publicCopy = { ...(draft.publicCopy ?? {}), ...publicCopyPatch }
  return {
    ...draft,
    publicCopy,
    landing: syncLandingSlotsFromPublicCopy(draft.landing, publicCopy),
  }
}

/**
 * Reemplaza la landing del borrador. El copy del hero y del cupo vive también en
 * `publicCopy` (lo leen la ficha, Pitbull y la inscripción), así que se
 * proyecta desde los slots para que no diverjan.
 */
export function patchDraftLanding(draft, nextLanding) {
  const landing = normalizeEventLanding(nextLanding, {
    publicCopy: draft.publicCopy,
    slug: draft.slug,
  })
  return {
    ...draft,
    landing,
    publicCopy: {
      ...(draft.publicCopy ?? {}),
      publicTitle: landing.slots.heroTitle,
      heroLead: landing.slots.heroLead,
      ctaLabel: landing.slots.ctaLabel,
      inscriptionMark: landing.slots.inscriptionMark,
      inscriptionNote: landing.slots.inscriptionNote,
    },
  }
}

/**
 * Cambia los bloques del Constructor. Si se prendió o apagó un bloque integrado
 * con módulo público (grilla, FAQ, lugar…), el switch de `publicSurface` viaja en
 * el mismo parche: lo que se oculta tampoco se consulta ni se expone.
 *
 * @param {object} draft
 * @param {object} landing landing ya normalizada del borrador
 * @param {object[]} blocks
 * @param {{ key: string, visible: boolean } | null} [surfaceChange]
 */
export function patchDraftLandingBlocks(draft, landing, blocks, surfaceChange = null) {
  const next = {
    ...draft,
    landing: normalizeEventLanding(
      { ...landing, layout: { ...(landing.layout ?? {}), blocks } },
      { publicCopy: draft.publicCopy, slug: draft.slug },
    ),
  }
  return surfaceChange?.key
    ? patchPublicSurface(next, surfaceChange.key, surfaceChange.visible)
    : next
}
