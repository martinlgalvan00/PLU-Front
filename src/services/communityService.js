import { getContent } from '../lib/content/index.js'
import { formatShortDate } from '../lib/format.js'

export function getAffiliatedGyms(locale = 'es') {
  return getContent(locale).COMMUNITY_AFFILIATED_GYMS
}

export function getRecentMembers(limit = 5, locale = 'es') {
  return getContent(locale).COMMUNITY_RECENT_MEMBERS.slice(0, limit)
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
