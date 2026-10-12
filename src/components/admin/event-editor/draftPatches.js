import { DEFAULT_EVENT_PRICING } from '../../../lib/eventPricing.js'
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
