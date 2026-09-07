/**
 * eventBoardPlanner.js — PLU ARG
 *
 * Plan de reparto de la grilla: agrupa inscriptos sin ubicar en tandas
 * comparables (sexo → equipo → división → peso) y propone tandas nuevas
 * cuando las que ya existen no alcanzan.
 *
 * Es puro a propósito. La UI muestra el preview; aplicar usa saveSessions +
 * assign. Nunca incluye a alguien que ya tiene día: el tablero solo le pasa
 * la bolsa de `unassigned`.
 */

export const DEFAULT_FLIGHT_SIZE = 12

const SEX_RANK = {
  Femenino: 0,
  Masculino: 1,
}

function sexRank(sex) {
  if (sex && Object.prototype.hasOwnProperty.call(SEX_RANK, sex)) return SEX_RANK[sex]
  return 2
}

function text(value) {
  return String(value ?? '').trim()
}

export function compareAthletes(a, b) {
  const bySex = sexRank(a?.sex) - sexRank(b?.sex)
  if (bySex !== 0) return bySex
  const byCategory = text(a?.category).localeCompare(text(b?.category), 'es')
  if (byCategory !== 0) return byCategory
  const byDivision = text(a?.division).localeCompare(text(b?.division), 'es')
  if (byDivision !== 0) return byDivision
  const weightA = a?.bodyweightKg
  const weightB = b?.bodyweightKg
  const byWeight =
    (Number.isFinite(Number(weightA)) ? Number(weightA) : Number.POSITIVE_INFINITY) -
    (Number.isFinite(Number(weightB)) ? Number(weightB) : Number.POSITIVE_INFINITY)
  if (byWeight !== 0) return byWeight
  return text(a?.fullName).localeCompare(text(b?.fullName), 'es')
}

function clusterKey(athlete) {
  const weight = Number.isFinite(Number(athlete?.bodyweightKg)) ? String(athlete.bodyweightKg) : ''
  return `${text(athlete?.sex)}|${text(athlete?.category)}|${text(athlete?.division)}|${weight}`
}

function clusterAthletes(sorted) {
  const clusters = []
  for (const athlete of sorted) {
    const key = clusterKey(athlete)
    const last = clusters[clusters.length - 1]
    if (last && last.key === key) last.athletes.push(athlete)
    else clusters.push({ key, athletes: [athlete] })
  }
  return clusters
}

function splitOversized(clusters, maxPerSession) {
  const chunks = []
  for (const cluster of clusters) {
    if (cluster.athletes.length <= maxPerSession) {
      chunks.push(cluster)
      continue
    }
    for (let index = 0; index < cluster.athletes.length; index += maxPerSession) {
      chunks.push({
        key: cluster.key,
        athletes: cluster.athletes.slice(index, index + maxPerSession),
      })
    }
  }
  return chunks
}

function uniqueValues(athletes, field) {
  const values = []
  const seen = new Set()
  for (const athlete of athletes) {
    const value = text(athlete?.[field])
    if (!value || seen.has(value)) continue
    seen.add(value)
    values.push(value)
  }
  return values
}

function formatWeightRange(athletes) {
  const weights = athletes
    .map((athlete) => Number(athlete?.bodyweightKg))
    .filter((value) => Number.isFinite(value))
  if (weights.length === 0) return ''
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const format = (value) => (Number.isInteger(value) ? String(value) : String(value))
  return min === max ? `${format(min)} kg` : `${format(min)}–${format(max)} kg`
}

export function summarizeComposition(athletes) {
  if (!athletes?.length) return ''
  const sexes = uniqueValues(athletes, 'sex')
  const categories = uniqueValues(athletes, 'category')
  const divisions = uniqueValues(athletes, 'division')
  return [
    sexes.length === 1 ? sexes[0] : null,
    categories.length === 1 ? categories[0] : null,
    divisions.length === 1 ? divisions[0] : null,
    formatWeightRange(athletes),
  ]
    .filter(Boolean)
    .join(' · ')
}

function sexLockOf(athletes) {
  const sexes = uniqueValues(athletes, 'sex')
  if (sexes.length === 0) return null
  if (sexes.length === 1) return sexes[0]
  return 'mixed'
}

function categoryLockOf(athletes) {
  const categories = uniqueValues(athletes, 'category')
  return categories.length === 1 ? categories[0] : null
}

function chunkSex(chunk) {
  return uniqueValues(chunk.athletes, 'sex')[0] ?? null
}

function chunkCategory(chunk) {
  return uniqueValues(chunk.athletes, 'category')[0] ?? ''
}

function existingSlots(days, maxPerSession) {
  return days.flatMap((day) =>
    (day.sessions ?? []).map((session) => {
      const current = session.athletes ?? []
      return {
        id: session.id,
        name: session.name,
        dayIndex: day.dayIndex,
        dayLabel: day.label,
        sortOrder: session.sortOrder ?? 0,
        room: Math.max(0, maxPerSession - current.length),
        sexLock: sexLockOf(current),
        categoryLock: categoryLockOf(current),
        additions: [],
        existingCount: current.length,
      }
    }),
  )
}

function compatibleSex(slot, chunk) {
  if (slot.sexLock === 'mixed') return false
  const sex = chunkSex(chunk)
  if (!slot.sexLock || !sex) return true
  return slot.sexLock === sex
}

function placeChunkInExisting(chunk, slots) {
  const size = chunk.athletes.length
  const open = slots.filter((slot) => slot.room >= size && compatibleSex(slot, chunk))
  if (open.length === 0) return false
  const category = chunkCategory(chunk)
  const preferred = open.find((slot) => !slot.categoryLock || slot.categoryLock === category)
  const slot = preferred ?? open[0]
  slot.additions.push(...chunk.athletes)
  slot.room -= size
  if (!slot.sexLock) slot.sexLock = chunkSex(chunk)
  if (!slot.categoryLock) slot.categoryLock = category
  return true
}

function packNewBuckets(chunks, maxPerSession) {
  const buckets = []
  for (const chunk of chunks) {
    const current = buckets[buckets.length - 1]
    const sex = chunkSex(chunk)
    const category = chunkCategory(chunk)
    if (
      current &&
      current.sex === sex &&
      current.category === category &&
      current.athletes.length + chunk.athletes.length <= maxPerSession
    ) {
      current.athletes.push(...chunk.athletes)
      continue
    }
    buckets.push({ sex, category, athletes: [...chunk.athletes] })
  }
  return buckets
}

export function nextSessionName(existingNames = []) {
  const used = new Set(existingNames.map((name) => text(name).toLowerCase()).filter(Boolean))
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const letter of letters) {
    const name = `Tanda ${letter}`
    if (!used.has(name.toLowerCase())) return name
  }
  let index = 27
  while (used.has(`tanda ${index}`)) index += 1
  return `Tanda ${index}`
}

export function sessionsPayloadFromBoard(days = [], { extra = [], omitIds = [] } = {}) {
  const omitted = new Set(omitIds)
  const existing = days.flatMap((day) =>
    (day.sessions ?? [])
      .filter((session) => session.id && !omitted.has(session.id))
      .map((session) => ({
        id: session.id,
        dayIndex: day.dayIndex,
        name: session.name,
        platform: session.platform ?? '',
        weighInAt: session.weighInAt ?? '',
        startsAt: session.startsAt ?? '',
        sortOrder: session.sortOrder ?? 0,
      })),
  )
  const maxSort = existing.reduce((max, session) => Math.max(max, Number(session.sortOrder) || 0), 0)
  const extras = extra.map((session, index) => ({
    dayIndex: session.dayIndex,
    name: session.name,
    platform: session.platform ?? '',
    weighInAt: session.weighInAt ?? '',
    startsAt: session.startsAt ?? '',
    sortOrder: maxSort + index + 1,
  }))
  return [...existing, ...extras]
}

export function groupAthletes(athletes = []) {
  const groups = []
  for (const athlete of [...athletes].sort(compareAthletes)) {
    const key = `${text(athlete.sex)}|${text(athlete.category)}|${text(athlete.division)}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.athletes.push(athlete)
      continue
    }
    groups.push({
      key,
      sex: text(athlete.sex),
      category: text(athlete.category),
      division: text(athlete.division),
      athletes: [athlete],
    })
  }
  return groups
}

function countBy(athletes, field) {
  const map = new Map()
  for (const athlete of athletes) {
    const value = text(athlete?.[field])
    if (!value) continue
    map.set(value, (map.get(value) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'es'))
}

export function compositionFacets(athletes = []) {
  return {
    sex: countBy(athletes, 'sex'),
    category: countBy(athletes, 'category'),
    division: countBy(athletes, 'division'),
  }
}

export function matchesFacet(athlete, facet) {
  if (!facet?.kind || !facet?.value) return true
  return text(athlete?.[facet.kind]) === facet.value
}

export function matchesQuery(athlete, query) {
  const needle = text(query).toLowerCase()
  if (!needle) return true
  return `${text(athlete.fullName)} ${text(athlete.gym)}`.toLowerCase().includes(needle)
}

function dayLabelOf(days, dayIndex) {
  return days.find((day) => day.dayIndex === dayIndex)?.label ?? `Día ${Number(dayIndex) + 1}`
}

/**
 * Arma el preview. `unassigned` tiene que ser solo gente sin día: el
 * planificador no mira el resto del tablero para no "devolver" a alguien.
 */
export function planEventBoard({ unassigned = [], days = [], maxPerSession = DEFAULT_FLIGHT_SIZE } = {}) {
  const cap = Math.max(1, Number(maxPerSession) || DEFAULT_FLIGHT_SIZE)
  const pending = unassigned.filter((athlete) => athlete?.registrationId)
  const sorted = [...pending].sort(compareAthletes)
  const chunks = splitOversized(clusterAthletes(sorted), cap)
  const slots = existingSlots(days, cap)
  const leftoverChunks = []

  for (const chunk of chunks) {
    if (!placeChunkInExisting(chunk, slots)) leftoverChunks.push(chunk)
  }

  const placements = []
  const summaries = []

  for (const slot of slots) {
    if (slot.additions.length === 0) continue
    for (const athlete of slot.additions) {
      placements.push({
        registrationId: athlete.registrationId,
        dayIndex: slot.dayIndex,
        sessionId: slot.id,
        sessionName: slot.name,
        tempId: null,
      })
    }
    summaries.push({
      key: slot.id,
      dayIndex: slot.dayIndex,
      dayLabel: slot.dayLabel,
      sessionId: slot.id,
      tempId: null,
      name: slot.name,
      composition: summarizeComposition(slot.additions),
      added: slot.additions.length,
      total: slot.existingCount + slot.additions.length,
      capacity: cap,
      isNew: false,
    })
  }

  const leftover = []
  const newSessions = []
  const dayIndexes = days.map((day) => day.dayIndex)

  if (dayIndexes.length === 0) {
    leftover.push(...leftoverChunks.flatMap((chunk) => chunk.athletes))
    return { placements, newSessions, leftover, summaries, placed: placements.length }
  }

  const names = days.flatMap((day) => (day.sessions ?? []).map((session) => session.name))
  let dayCursor = 0
  for (const bucket of packNewBuckets(leftoverChunks, cap)) {
    const dayIndex = dayIndexes[dayCursor % dayIndexes.length]
    dayCursor += 1
    const name = nextSessionName(names)
    names.push(name)
    const tempId = `new|${dayIndex}|${name}`
    newSessions.push({
      tempId,
      dayIndex,
      name,
      composition: summarizeComposition(bucket.athletes),
      count: bucket.athletes.length,
    })
    for (const athlete of bucket.athletes) {
      placements.push({
        registrationId: athlete.registrationId,
        dayIndex,
        sessionId: null,
        sessionName: name,
        tempId,
      })
    }
    summaries.push({
      key: tempId,
      dayIndex,
      dayLabel: dayLabelOf(days, dayIndex),
      sessionId: null,
      tempId,
      name,
      composition: summarizeComposition(bucket.athletes),
      added: bucket.athletes.length,
      total: bucket.athletes.length,
      capacity: cap,
      isNew: true,
    })
  }

  return {
    placements,
    newSessions,
    leftover,
    summaries,
    placed: placements.length,
  }
}

export function resolvePlacementBatches(board, plan) {
  const byName = new Map()
  for (const day of board?.days ?? []) {
    for (const session of day.sessions ?? []) {
      byName.set(`${day.dayIndex}|${session.name}`, { id: session.id, dayIndex: day.dayIndex })
    }
  }

  const groups = new Map()
  const unresolved = []
  for (const placement of plan?.placements ?? []) {
    const sessionId =
      placement.sessionId ?? byName.get(`${placement.dayIndex}|${placement.sessionName}`)?.id
    if (!sessionId) {
      unresolved.push(placement.registrationId)
      continue
    }
    const key = `${placement.dayIndex}|${sessionId}`
    const current = groups.get(key)
    if (current) current.registrationIds.push(placement.registrationId)
    else {
      groups.set(key, {
        dayIndex: placement.dayIndex,
        sessionId,
        registrationIds: [placement.registrationId],
      })
    }
  }

  return { batches: [...groups.values()], unresolved }
}
