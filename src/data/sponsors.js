/**
 * Catálogo público de sponsors.
 * Cargar partners firmados acá; slots vacíos se muestran honestos.
 *
 * @typedef {{
 *   id: string
 *   tier: 'title' | 'official' | 'support'
 *   name: string
 *   url?: string
 *   logoSrc?: string
 *   blurbKey?: string
 * }} Sponsor
 */

/** @type {Sponsor[]} */
export const SPONSORS_CATALOG = []

export const SPONSOR_TIERS = Object.freeze(['title', 'official', 'support'])

/**
 * @param {'title' | 'official' | 'support'} tier
 * @returns {Sponsor[]}
 */
export function listSponsorsByTier(tier) {
  return SPONSORS_CATALOG.filter((sponsor) => sponsor.tier === tier)
}

export function hasPublishedSponsors() {
  return SPONSORS_CATALOG.length > 0
}
