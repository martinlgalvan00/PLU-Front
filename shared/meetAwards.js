/**
 * Premios de un meet a partir de filas ya importadas.
 *
 * DOTS: polinomio de Tim Konertz (BVDK, 2019), el mismo que publica
 * OpenPowerlifting. El peso se recorta al rango de la fórmula (40–210 kg
 * hombres, 40–150 kg mujeres) antes de evaluar.
 *
 * McCulloch: coeficiente de edad para máster. Los valores de 42, 60 y 75
 * años son los ejemplos publicados por USAPL (1.020, 1.340 y 1.835).
 * Entre 40 y 80 se usa la tabla entera; fuera de ese rango, el extremo.
 */

const DOTS = {
  M: {
    a: -0.000001093,
    b: 0.0007391293,
    c: -0.1918759221,
    d: 24.0900756,
    e: -307.75076,
    min: 40,
    max: 210,
  },
  F: {
    a: -0.0000010706,
    b: 0.0005158568,
    c: -0.1126655495,
    d: 13.6175032,
    e: -57.96288,
    min: 40,
    max: 150,
  },
}

/** Índice 0 = 40 años. Fuente: tabla USAPL; 42 → 1.020, 60 → 1.340, 75 → 1.835. */
const MCCULLOCH_FROM_40 = [
  1, 1.01, 1.02, 1.031, 1.043, 1.055, 1.068, 1.082, 1.097, 1.113, 1.13, 1.147, 1.165, 1.184,
  1.204, 1.225, 1.246, 1.268, 1.291, 1.315, 1.34, 1.366, 1.393, 1.421, 1.45, 1.48, 1.511, 1.543,
  1.576, 1.61, 1.645, 1.681, 1.718, 1.756, 1.795, 1.835, 1.876, 1.918, 1.961, 2.005, 2.05,
]

const MASTER_DIVISION = /m[aá]ster|masters?/i

export function normalizeSex(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (['m', 'male', 'man', 'hombre', 'masculino', 'masc', 'mx'].includes(raw)) return 'M'
  if (['f', 'female', 'woman', 'mujer', 'femenino', 'fem'].includes(raw)) return 'F'
  return null
}

export function dotsScore(sex, bodyweightKg, totalKg) {
  const key = normalizeSex(sex)
  const bodyweight = Number(bodyweightKg)
  const total = Number(totalKg)
  if (!key || !Number.isFinite(bodyweight) || bodyweight <= 0 || !Number.isFinite(total) || total <= 0) {
    return null
  }
  const coeff = DOTS[key]
  const bw = Math.min(coeff.max, Math.max(coeff.min, bodyweight))
  const denom =
    coeff.a * bw ** 4 + coeff.b * bw ** 3 + coeff.c * bw ** 2 + coeff.d * bw + coeff.e
  if (!Number.isFinite(denom) || denom === 0) return null
  return (500 / denom) * total
}

/** 1 si no es máster por edad. `null` si la edad no alcanza para aplicar McCulloch. */
export function mccullochCoefficient(age) {
  if (age == null || age === '') return null
  const years = Number(age)
  if (!Number.isFinite(years)) return null
  if (years < 40) return 1
  const index = Math.min(MCCULLOCH_FROM_40.length - 1, Math.max(0, Math.floor(years) - 40))
  return MCCULLOCH_FROM_40[index]
}

function divisionSaysMaster(division) {
  return MASTER_DIVISION.test(String(division ?? ''))
}

function roundScore(value) {
  return Math.round(value * 10) / 10
}

/**
 * @param {Array<{
 *   athleteName?: string,
 *   sex?: string|null,
 *   age?: number|null,
 *   division?: string|null,
 *   bodyweightKg?: number|null,
 *   totalKg?: number|null,
 *   teamName?: string|null,
 *   equipment?: string|null,
 *   place?: number|null,
 * }>} rows
 */
export function computeMeetAwards(rows = []) {
  const lifters = []
  let mastersMissingAge = 0

  for (const row of rows) {
    const dots = dotsScore(row.sex, row.bodyweightKg, row.totalKg)
    const masterByDivision = divisionSaysMaster(row.division)
    const age = row.age == null || row.age === '' ? null : Number(row.age)
    const hasAge = Number.isFinite(age)
    const masterByAge = hasAge && age >= 40
    const missingMasterAge = masterByDivision && !hasAge
    if (missingMasterAge) mastersMissingAge += 1
    const coefficient = masterByAge ? mccullochCoefficient(age) : 1

    lifters.push({
      athleteName: String(row.athleteName ?? '').trim(),
      sex: normalizeSex(row.sex),
      age: Number.isFinite(age) ? age : null,
      division: row.division ?? null,
      bodyweightKg: row.bodyweightKg == null ? null : Number(row.bodyweightKg),
      totalKg: row.totalKg == null ? null : Number(row.totalKg),
      teamName: String(row.teamName ?? '').trim(),
      equipment: String(row.equipment ?? '').trim(),
      place: row.place ?? null,
      dots,
      score: dots == null || missingMasterAge ? null : dots * coefficient,
    })
  }

  const ranked = lifters
    .filter((lifter) => lifter.score != null && lifter.athleteName)
    .sort((a, b) => b.score - a.score || b.totalKg - a.totalKg || a.athleteName.localeCompare(b.athleteName))

  const winner = ranked[0] ?? null
  const bestLifter = winner
    ? {
        athleteName: winner.athleteName,
        score: roundScore(winner.score),
        dots: roundScore(winner.dots),
        totalKg: winner.totalKg,
        bodyweightKg: winner.bodyweightKg,
        sex: winner.sex,
        division: winner.division,
      }
    : null

  const withTeam = lifters.filter((lifter) => lifter.teamName && lifter.dots != null)
  const groups = new Map()
  for (const lifter of withTeam) {
    const key = `${lifter.teamName.toLocaleLowerCase('es')}\u0000${lifter.equipment.toLocaleLowerCase('es')}`
    const group = groups.get(key) ?? {
      teamName: lifter.teamName,
      equipment: lifter.equipment,
      lifters: [],
    }
    group.lifters.push(lifter)
    groups.set(key, group)
  }

  const qualifying = [...groups.values()].filter(
    (group) => group.lifters.length >= 4 && group.lifters.length <= 15,
  )
  const scored = qualifying
    .map((group) => {
      const top = [...group.lifters].sort((a, b) => b.dots - a.dots).slice(0, 5)
      const score = top.reduce((sum, lifter) => sum + lifter.dots, 0) / top.length
      return {
        teamName: group.teamName,
        equipment: group.equipment || null,
        lifterCount: group.lifters.length,
        score: roundScore(score),
        top: top.map((lifter) => ({
          athleteName: lifter.athleteName,
          dots: roundScore(lifter.dots),
        })),
      }
    })
    .sort((a, b) => b.score - a.score || a.teamName.localeCompare(b.teamName, 'es'))

  let bestTeamReason = null
  if (withTeam.length === 0) bestTeamReason = 'no_team_data'
  else if (scored.length < 3) bestTeamReason = 'not_enough_teams'

  return {
    bestLifter,
    mastersMissingAge,
    bestTeam: scored.length >= 3 ? scored[0] : null,
    bestTeamReason: scored.length >= 3 ? null : bestTeamReason,
    qualifyingTeamCount: scored.length,
    sheet: lifters
      .map((lifter) => ({
        athleteName: lifter.athleteName,
        place: lifter.place,
        totalKg: lifter.totalKg,
        dots: lifter.dots == null ? null : roundScore(lifter.dots),
        score: lifter.score == null ? null : roundScore(lifter.score),
        teamName: lifter.teamName || null,
        sex: lifter.sex,
        division: lifter.division,
      }))
      .sort((a, b) => {
        if (a.place != null && b.place != null && a.place !== b.place) return a.place - b.place
        if (a.dots != null && b.dots != null && a.dots !== b.dots) return b.dots - a.dots
        return a.athleteName.localeCompare(b.athleteName, 'es')
      }),
  }
}
