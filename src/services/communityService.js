import { getContent } from '../lib/content/index.js'
import { formatShortDate } from '../lib/format.js'
import { apiGet } from '../lib/api.js'

const FEED_LIMIT = 5
/** Pedimos solo lo que se muestra: priorizar fotos ya no justifica over-fetch. */
const SPOTLIGHT_FETCH_LIMIT = FEED_LIMIT

export function getAffiliatedGyms(locale = 'es') {
  return getContent(locale).COMMUNITY_AFFILIATED_GYMS
}

export function getRecentMembers(limit = FEED_LIMIT, locale = 'es') {
  return getContent(locale).COMMUNITY_RECENT_MEMBERS.slice(0, limit)
}

/**
 * Recorta al límite preservando el orden del backend (ya trae como máximo
 * un retrato; el resto son iniciales).
 */
export function pickSpotlightMembers(members = [], limit = FEED_LIMIT) {
  const list = Array.isArray(members) ? members : []
  return list.slice(0, limit)
}

export function getCommunityStats(locale = 'es') {
  const gyms = getAffiliatedGyms(locale)
  const activeGyms = gyms.filter((gym) => gym.status === 'active')
  const members = getContent(locale).COMMUNITY_RECENT_MEMBERS

  return {
    activeGymCount: activeGyms.length,
    memberCount: members.length,
    provinceCount: new Set(activeGyms.map((gym) => gym.province)).size,
  }
}

function fallbackSpotlight(limit = FEED_LIMIT, locale = 'es') {
  return {
    members: pickSpotlightMembers(getRecentMembers(SPOTLIGHT_FETCH_LIMIT, locale), limit),
    stats: getCommunityStats(locale),
    source: 'fallback',
  }
}

/**
 * Spotlight del home: intenta Supabase vía API; si falla, usa el mock editorial.
 */
export async function fetchCommunitySpotlight(limit = FEED_LIMIT, locale = 'es') {
  try {
    const data = await apiGet(
      `/api/community/spotlight?limit=${encodeURIComponent(SPOTLIGHT_FETCH_LIMIT)}`,
    )
    const members = pickSpotlightMembers(Array.isArray(data?.members) ? data.members : [], limit)
    return {
      members,
      stats: {
        activeGymCount: Number(data?.stats?.activeGymCount ?? 0) || 0,
        memberCount: Number(data?.stats?.memberCount ?? members.length) || members.length,
        provinceCount: Number(data?.stats?.provinceCount ?? 0) || 0,
      },
      source: 'supabase',
    }
  } catch {
    return fallbackSpotlight(limit, locale)
  }
}

export function formatMemberSince(isoDate, locale = 'es') {
  if (!isoDate) return ''
  return formatShortDate(isoDate, locale)
}

export function getGymMonogram(city) {
  const parts = city.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }
  return city.slice(0, 2).toUpperCase()
}

export function getMemberInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
