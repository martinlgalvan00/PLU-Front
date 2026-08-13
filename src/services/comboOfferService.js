import { isComboOfferLive } from '../lib/eventPricing.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'

export function getEventComboAvailability(
  event,
  {
    hasActiveMembership = false,
    now = new Date(),
    envLike = env,
  } = {},
) {
  const rawOffer = event?.comboOffer ?? null
  const live = isComboOfferLive(rawOffer, now)
  const offer = live
    ? { ...rawOffer, active: true, price: Number(rawOffer.price) }
    : null
  const relevant = Boolean(offer) && !hasActiveMembership
  const paidCheckoutOpen = isPaidCheckoutOpen(event, envLike, now, { checkoutKind: 'combo' })

  return {
    offer,
    enabled: relevant && paidCheckoutOpen,
    comingSoon: relevant && !paidCheckoutOpen,
  }
}
