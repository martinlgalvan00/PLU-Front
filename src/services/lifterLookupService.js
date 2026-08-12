/**
 * lifterLookupService.js — PLU ARG
 *
 * Búsqueda pública mínima sobre planillas publicadas (no padrón de afiliados).
 * Respeta privacidad: solo nombres ya expuestos en resultados oficiales.
 */

import { listPublishedEventResults } from './resultsService.js'

/**
 * @param {string} query
 * @param {{ limit?: number }} [options]
 * @returns {Array<{
 *   id: string
 *   name: string
 *   division: string
 *   meet: string
 *   meetSlug: string
 *   total: number
 *   totalLabel: string
 * }>}
 */
export function searchPublishedLifters(query = '', { limit = 24 } = {}) {
  const normalized = String(query).trim().toLowerCase()
  if (normalized.length < 2) return []

  const matches = []

  for (const meet of listPublishedEventResults()) {
    for (const division of meet.divisions ?? []) {
      for (const lifter of division.lifters ?? []) {
        const name = String(lifter.name ?? '').trim()
        if (!name || !name.toLowerCase().includes(normalized)) continue

        const total = Number(lifter.total)
        matches.push({
          id: `${meet.slug}:${division.name}:${name}:${lifter.place ?? matches.length}`,
          name,
          division: division.name,
          meet: meet.eventTitle ?? meet.slug,
          meetSlug: meet.slug,
          total: Number.isFinite(total) ? total : 0,
          totalLabel: Number.isFinite(total) ? `${total} kg` : '—',
        })
      }
    }
  }

  return matches
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
    .slice(0, limit)
}
