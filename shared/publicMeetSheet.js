import { computeMeetAwards, dotsScore, normalizeSex } from './meetAwards.js'

const PODIUM_RANK = ['1°', '2°', '3°']

function asNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatKg(value) {
  if (value == null) return '—'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function sexLabel(sex) {
  const normalized = normalizeSex(sex)
  if (normalized === 'M') return 'Hombres'
  if (normalized === 'F') return 'Mujeres'
  return null
}

function divisionName(row) {
  const parts = [row.division, sexLabel(row.sex), row.category || row.equipment].filter(Boolean)
  return parts.join(' · ') || 'General'
}

function roundScore(value) {
  if (value == null) return null
  return Math.round(value * 10) / 10
}

/**
 * Planilla importada → la forma que ya renderiza la página pública.
 * El podio sale del coeficiente (DOTS, con McCulloch si es máster con edad).
 * La columna DOTS de cada categoría queda en DOTS crudo.
 * Si no hay ganador, el premio no viaja.
 */
export function toPublicMeetSheet({ title, rows = [] }) {
  const lifters = rows.map((row) => ({
    athleteName: String(row.athleteName ?? '').trim(),
    sex: row.sex ?? null,
    age: asNumber(row.age),
    division: row.division ?? null,
    category: row.category ?? null,
    bodyweightKg: asNumber(row.bodyweightKg),
    equipment: row.equipment ?? null,
    teamName: row.teamName ?? null,
    place: asNumber(row.place),
    totalKg: asNumber(row.totalKg),
    bestSquatKg: asNumber(row.bestSquatKg),
    bestBenchKg: asNumber(row.bestBenchKg),
    bestDeadliftKg: asNumber(row.bestDeadliftKg),
  }))

  const awards = computeMeetAwards(lifters)
  const podium = [...awards.sheet]
    .filter((entry) => entry.score != null && entry.athleteName)
    .sort((a, b) => b.score - a.score || (b.totalKg ?? 0) - (a.totalKg ?? 0))
    .slice(0, 3)
    .map((entry, index) => ({
      athlete: entry.athleteName,
      event: title,
      total: `${formatKg(entry.totalKg)} kg`,
      place: `${PODIUM_RANK[index]} ${entry.division || 'DOTS'}`.trim(),
    }))

  const groups = new Map()
  for (const lifter of lifters) {
    const name = divisionName(lifter)
    const list = groups.get(name) ?? []
    list.push(lifter)
    groups.set(name, list)
  }

  const divisions = [...groups.entries()].map(([name, group]) => ({
    name,
    lifters: [...group]
      .sort((a, b) => {
        if (a.place != null && b.place != null && a.place !== b.place) return a.place - b.place
        return (b.totalKg ?? 0) - (a.totalKg ?? 0)
      })
      .map((lifter, index) => ({
        place: lifter.place ?? index + 1,
        name: lifter.athleteName,
        bodyweight: lifter.bodyweightKg,
        squat: lifter.bestSquatKg,
        bench: lifter.bestBenchKg,
        deadlift: lifter.bestDeadliftKg,
        total: lifter.totalKg,
        dots: roundScore(dotsScore(lifter.sex, lifter.bodyweightKg, lifter.totalKg)),
      })),
  }))

  return {
    eventTitle: title,
    podium,
    divisions,
    awards: {
      bestLifter: awards.bestLifter
        ? { name: awards.bestLifter.athleteName, score: awards.bestLifter.score }
        : null,
      bestTeam: awards.bestTeam
        ? { name: awards.bestTeam.teamName, score: awards.bestTeam.score }
        : null,
    },
  }
}
