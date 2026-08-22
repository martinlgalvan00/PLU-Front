import { isComboOfferLive } from '../lib/eventPricing.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'

export const COMBO_VISIBILITY_STATES = ['public', 'code', 'private']

export function normalizeComboVisibility(value) {
  return COMBO_VISIBILITY_STATES.includes(value) ? value : 'public'
}

/**
 * `unlocked` lo prende el checkout cuando el atleta validó el código de un
 * combo restringido (`audience: 'code'`). Sin eso, un combo con código existe
 * pero no se ofrece. El único punto de entrada previo al canje es el campo
 * genérico de códigos: ni el paquete, ni su precio, ni un aviso de que existe
 * deben delatar el easter egg.
 *
 * El código nunca viaja en el payload público (ver `CATALOG_EVENT_SELECT` en
 * server/routes/events.js): quien valida es el servidor.
 */
export function getEventComboAvailability(
  event,
  { hasActiveMembership = false, now = new Date(), envLike = env, unlocked = false } = {},
) {
  const rawOffer = event?.comboOffer ?? null
  const live = isComboOfferLive(rawOffer, now)
  const offer = live ? { ...rawOffer, active: true, price: Number(rawOffer.price) } : null
  const visibility = normalizeComboVisibility(rawOffer?.audience)
  const privateOffer = Boolean(offer) && visibility === 'private'
  const requiresCode = Boolean(offer) && visibility === 'code'
  const relevant = Boolean(offer) && !hasActiveMembership
  const paidCheckoutOpen = isPaidCheckoutOpen(event, envLike, now, { checkoutKind: 'combo' })
  const accessible = relevant && !privateOffer && (!requiresCode || unlocked)

  return {
    // El objeto trae precio y vigencia. No se entrega antes del canje para que
    // ningun consumidor pueda mostrarlo por accidente al leer solo `offer`.
    offer: accessible ? offer : null,
    visibility,
    requiresCode,
    // Estado interno: permite distinguir "no existe" de "existe pero está
    // oculto" sin convertir esa distinción en contenido visible.
    locked: relevant && requiresCode && !unlocked && paidCheckoutOpen,
    hidden: relevant && privateOffer,
    enabled: accessible && paidCheckoutOpen,
    comingSoon: accessible && !paidCheckoutOpen,
  }
}
