import { isComboOfferLive } from '../lib/eventPricing.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'

/**
 * `unlocked` lo prende el checkout cuando el atleta validó el código de un
 * combo restringido (`audience: 'code'`). Sin eso, un combo con código existe
 * pero no se ofrece: `requiresCode` avisa que hay un paquete detrás para que la
 * pantalla pueda pedirlo, sin revelar precio ni condiciones.
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
  const requiresCode = Boolean(offer) && rawOffer?.audience === 'code'
  const relevant = Boolean(offer) && !hasActiveMembership
  const paidCheckoutOpen = isPaidCheckoutOpen(event, envLike, now, { checkoutKind: 'combo' })
  const accessible = relevant && (!requiresCode || unlocked)

  return {
    offer,
    requiresCode,
    // Hay un combo restringido y todavía no se destrabó: la pantalla puede
    // ofrecer el campo de código en vez del paquete.
    locked: relevant && requiresCode && !unlocked && paidCheckoutOpen,
    enabled: accessible && paidCheckoutOpen,
    comingSoon: accessible && !paidCheckoutOpen,
  }
}
