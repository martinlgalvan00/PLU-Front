import { previewCheckoutPrice } from './checkoutPricing.js'

/**
 * Oferta exclusiva: lo que desbloquea un código secreto.
 *
 * No es un descuento. Un cupón resta plata sobre un precio que ya se estaba
 * mostrando; una oferta exclusiva es un paquete distinto —afiliación +
 * inscripción a un precio propio— que sólo existe para quien tiene el código.
 * Por eso vive en su propia ficha de Mi cuenta y no en el campo de descuento del
 * checkout: el checkout la cobra, pero no es donde se entiende.
 *
 * El payload lo arma `plu_private.offer_code_payload` (20260902100000). Acá sólo
 * se lo interpreta: precio por canal, ahorro y si todavía se puede comprar.
 */

/** Modalidades que abren la ficha. Espejo de OFFER_UNLOCK_KINDS del backend. */
export const OFFER_UNLOCK_KINDS = ['offer', 'access']

export function isOfferUnlockKind(kind) {
  return OFFER_UNLOCK_KINDS.includes(kind)
}

/**
 * Un preview de código que en realidad es una llave. Lo usan las dos pantallas
 * de canje (afiliación e inscripción) para decidir si anuncian "canjeaste el
 * código secreto" en vez de "ahorrás $X".
 */
export function previewUnlocksOffer(preview) {
  return Boolean(preview?.valid) && isOfferUnlockKind(preview.kind)
}

/**
 * Precio de la oferta y su ahorro, resueltos para el canal que se está mirando.
 *
 * Sólo previsualización: el importe que se cobra sale de la respuesta del POST
 * que crea la orden, igual que en el resto del checkout. Un `kind = 'access'` no
 * trae precio propio — la oferta es el precio del combo del evento, y el ahorro
 * se mide igual contra la suma de las partes.
 */
export function resolveOfferPricing(offer, { paymentMethod = 'mercado_pago' } = {}) {
  const membership = Number(offer?.membershipPlan?.price) || 0
  const registration = Number(offer?.event?.registrationPrice) || 0
  const membershipManual = offer?.membershipPlan?.manualPrice ?? null
  const registrationManual = offer?.event?.registrationManualPrice ?? null

  const membershipPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: membershipManual,
    fallback: membership,
  })
  const registrationPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: registrationManual,
    fallback: registration,
  })

  // Un 'offer' fija su importe; un 'access' hereda el del combo del evento.
  const offerPrice =
    offer?.fixedPrice != null
      ? previewCheckoutPrice({
          paymentMethod,
          manualPrice: offer.fixedPriceManual ?? null,
          fallback: Number(offer.fixedPrice) || 0,
        })
      : previewCheckoutPrice({
          paymentMethod,
          manualPrice: offer?.comboOffer?.manualPrice ?? null,
          fallback: Number(offer?.comboOffer?.price) || 0,
        })

  const listTotal = membershipPrice + registrationPrice

  return {
    membershipPrice,
    registrationPrice,
    listTotal,
    offerPrice,
    // Nunca negativo: una oferta mal cargada no debe anunciar un "ahorro"
    // invertido. El alta ya la rechaza (staff_upsert_discount_code compara
    // contra el precio del combo), esto es el cinturón de la UI.
    savings: Math.max(listTotal - offerPrice, 0),
    currency: offer?.comboOffer?.currency ?? offer?.event?.currency ?? 'ARS',
  }
}

/**
 * ¿La oferta se puede comprar ahora?
 *
 * `redeemed` la cierra: la compra ya se hizo y la ficha pasa a ser el registro
 * de lo que se canjeó. El resto son las mismas condiciones que evalúa el
 * checkout — se replican para no ofrecer un botón que termina en error.
 */
export function getOfferState(offer, { now = new Date() } = {}) {
  if (!offer) return { available: false, reason: 'missing' }
  if (offer.redeemed) return { available: false, reason: 'redeemed' }

  const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null
  if (expiresAt && expiresAt < now) return { available: false, reason: 'expired' }
  const startsAt = offer.startsAt ? new Date(offer.startsAt) : null
  if (startsAt && startsAt > now) return { available: false, reason: 'not_started' }

  const combo = offer.comboOffer
  if (!combo || !combo.active) return { available: false, reason: 'offer_unavailable' }
  const comboStarts = combo.startsAt ? new Date(combo.startsAt) : null
  const comboEnds = combo.endsAt ? new Date(combo.endsAt) : null
  if (comboStarts && comboStarts > now) return { available: false, reason: 'offer_unavailable' }
  if (comboEnds && comboEnds < now) return { available: false, reason: 'offer_unavailable' }

  if (!offer.event?.slug) return { available: false, reason: 'offer_unavailable' }

  return { available: true, reason: null }
}

/**
 * La oferta que la ficha muestra primero: la comprable más reciente y, si no
 * quedó ninguna, la última canjeada — para que la ficha nunca aparezca vacía
 * después de haber anunciado un canje.
 */
export function pickPrimaryOffer(offers = [], options = {}) {
  const list = Array.isArray(offers) ? offers.filter(Boolean) : []
  return list.find((offer) => getOfferState(offer, options).available) ?? list[0] ?? null
}
