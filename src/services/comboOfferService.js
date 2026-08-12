import { isComboOfferLive } from '../lib/eventPricing.js'

export function getEventComboAvailability(
  event,
  {
    hasActiveMembership = false,
    now = new Date(),
  } = {},
) {
  const rawOffer = event?.comboOffer ?? null
  const live = isComboOfferLive(rawOffer, now)
  const offer = live
    ? { ...rawOffer, active: true, price: Number(rawOffer.price) }
    : null
  const relevant = Boolean(offer) && !hasActiveMembership

  return {
    offer,
    enabled: relevant,
    comingSoon: false,
  }
}
