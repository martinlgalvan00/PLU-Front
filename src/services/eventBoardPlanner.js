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

/** "19–23 años" / "19 años"; vacío si ninguno cargó fecha de nacimiento. */
export function formatAgeRange(athletes) {
  const ages = athletes
    .map((athlete) => athlete?.age)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number)
  if (ages.length === 0) return ''
  const min = Math.min(...ages)
  const max = Math.max(...ages)
  return min === max ? `${min} años` : `${min}–${max} años`
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
    formatAgeRange(athletes),
  ]
    .filter(Boolean)
    .join(' · ')
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
        // Sin la clave el RPC enlaza por nombre; con ella (incluso null) manda el id.
        ...(session.platformId !== undefined ? { platformId: session.platformId } : {}),
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
    ...(session.platformId !== undefined ? { platformId: session.platformId } : {}),
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

function inRange(value, min, max) {
  const hasMin = min !== '' && min !== null && min !== undefined && Number.isFinite(Number(min))
  const hasMax = max !== '' && max !== null && max !== undefined && Number.isFinite(Number(max))
  if (!hasMin && !hasMax) return true
  // Sin dato no se puede afirmar que entre en el rango: queda afuera del filtro.
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return false
  const number = Number(value)
  if (hasMin && number < Number(min)) return false
  if (hasMax && number > Number(max)) return false
  return true
}

export const EMPTY_POOL_FILTERS = Object.freeze({
  query: '',
  sex: '',
  category: '',
  division: '',
  weightMin: '',
  weightMax: '',
  ageMin: '',
  ageMax: '',
})

export function hasActivePoolFilters(filters) {
  return Object.keys(EMPTY_POOL_FILTERS).some((key) => text(filters?.[key]) !== '')
}

/** Filtro combinado de la bolsa: búsqueda, facets, peso y edad. */
export function matchesPoolFilters(athlete, filters = EMPTY_POOL_FILTERS) {
  if (!matchesQuery(athlete, filters.query)) return false
  for (const kind of ['sex', 'category', 'division']) {
    if (!matchesFacet(athlete, { kind, value: text(filters[kind]) })) return false
  }
  return (
    inRange(athlete?.bodyweightKg, filters.weightMin, filters.weightMax) &&
    inRange(athlete?.age, filters.ageMin, filters.ageMax)
  )
}

/** Cuántos de la tanda hay vs el tope, y si mezcla sexos (aviso al operador). */
export function sessionStats(athletes = [], maxPerSession = DEFAULT_FLIGHT_SIZE) {
  const sexes = uniqueValues(athletes, 'sex')
  return {
    count: athletes.length,
    capacity: maxPerSession,
    over: athletes.length > maxPerSession,
    mixedSex: sexes.length > 1,
    composition: summarizeComposition(athletes),
  }
}

function dayLabelOf(days, dayIndex) {
  return days.find((day) => day.dayIndex === dayIndex)?.label ?? `Día ${Number(dayIndex) + 1}`
}

/* ── Armado automático ───────────────────────────────────────────────────
   El plan es una función pura de (bolsa, días, tablados, criterios): la UI
   muestra la propuesta y recién al confirmar se escribe nada. */

export const PLAN_GROUP_KEYS = ['sex', 'category', 'division']

export const DEFAULT_PLAN_OPTIONS = Object.freeze({
  maxPerSession: DEFAULT_FLIGHT_SIZE,
  /** Qué separa a dos atletas en tandas distintas (de más a menos fuerte). */
  groupBy: ['sex', 'category'],
  /** Orden dentro de un grupo: define quiénes quedan juntos al partirlo. */
  sortBy: 'weight',
  /** Completar primero las tandas que ya existen. */
  useExisting: true,
  /** Juntar restos chicos de grupos vecinos en una sola tanda. */
  mergeSmall: true,
  /** 'alternate' reparte las tandas entre tablados; 'sex' fija un sexo por tablado. */
  platformMode: 'alternate',
  /** Días a usar; null = todos. */
  dayIndexes: null,
})

const numberOrInfinity = (value) =>
  value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value)
    : Number.POSITIVE_INFINITY

function groupKeyOf(athlete, keys) {
  return keys.map((key) => text(athlete?.[key])).join('|')
}

/** Orden total para armar: llaves de grupo (sexo → categoría → división) y luego el criterio. */
function planComparator(keys, sortBy) {
  const secondary =
    sortBy === 'age'
      ? [(row) => numberOrInfinity(row?.age), (row) => numberOrInfinity(row?.bodyweightKg)]
      : [(row) => numberOrInfinity(row?.bodyweightKg), (row) => numberOrInfinity(row?.age)]
  return (a, b) => {
    for (const key of PLAN_GROUP_KEYS) {
      if (!keys.includes(key)) continue
      const diff =
        key === 'sex'
          ? sexRank(a?.sex) - sexRank(b?.sex)
          : text(a?.[key]).localeCompare(text(b?.[key]), 'es')
      if (diff !== 0) return diff
    }
    for (const pick of secondary) {
      const diff = pick(a) - pick(b)
      if (diff !== 0 && !Number.isNaN(diff)) return diff
    }
    return text(a?.fullName).localeCompare(text(b?.fullName), 'es')
  }
}

/**
 * Parte una lista en la menor cantidad de tandas que respeta el tope y las
 * deja parejas: 13 con tope 12 son 7 + 6, no 12 + 1. Una tanda de uno es un
 * mal armado aunque "cumpla" el tope.
 */
export function balancedChunks(list, cap) {
  if (list.length === 0) return []
  const count = Math.ceil(list.length / cap)
  const base = Math.floor(list.length / count)
  const extra = list.length % count
  const chunks = []
  let cursor = 0
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < extra ? 1 : 0)
    chunks.push(list.slice(cursor, cursor + size))
    cursor += size
  }
  return chunks
}

function singleSex(athletes) {
  const sexes = uniqueValues(athletes, 'sex')
  return sexes.length === 1 ? sexes[0] : null
}

/** Tandas candidatas (todavía sin día, tablado ni nombre), en orden de competencia. */
function buildBuckets(athletes, { groupBy, sortBy, maxPerSession, mergeSmall }) {
  const sorted = [...athletes].sort(planComparator(groupBy, sortBy))
  const groups = []
  for (const athlete of sorted) {
    const key = groupKeyOf(athlete, groupBy)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.athletes.push(athlete)
    else groups.push({ key, athletes: [athlete] })
  }

  const buckets = groups.flatMap((group) =>
    balancedChunks(group.athletes, maxPerSession).map((chunk) => ({
      athletes: chunk,
      // Llaves que NO pueden mezclarse al juntar restos: todas menos la menos
      // fuerte (se mezclan divisiones, no categorías ni sexos).
      lock: groupKeyOf(chunk[0], groupBy.slice(0, Math.max(0, groupBy.length - 1))),
      sex: singleSex(chunk),
    })),
  )
  if (!mergeSmall) return buckets

  const merged = []
  for (const bucket of buckets) {
    const last = merged[merged.length - 1]
    const sexSafe = !groupBy.includes('sex') || last?.sex === bucket.sex
    if (
      last &&
      sexSafe &&
      last.lock === bucket.lock &&
      last.athletes.length + bucket.athletes.length <= maxPerSession
    ) {
      last.athletes.push(...bucket.athletes)
      last.sex = singleSex(last.athletes)
    } else {
      merged.push({ ...bucket, athletes: [...bucket.athletes] })
    }
  }
  return merged
}

function existingSlots(days, dayIndexes, maxPerSession) {
  return days
    .filter((day) => !dayIndexes || dayIndexes.includes(day.dayIndex))
    .flatMap((day) =>
      (day.sessions ?? []).map((session) => {
        const current = session.athletes ?? []
        return {
          id: session.id,
          name: session.name,
          platformId: session.platformId ?? null,
          platform: session.platform ?? '',
          dayIndex: day.dayIndex,
          dayLabel: day.label,
          room: Math.max(0, maxPerSession - current.length),
          sex: singleSex(current) ?? (current.length === 0 ? null : 'mixed'),
          category: uniqueValues(current, 'category').length === 1 ? current[0].category : null,
          additions: [],
          existingCount: current.length,
        }
      }),
    )
}

function placeInExisting(bucket, slots, groupBy) {
  const size = bucket.athletes.length
  const keepSex = groupBy.includes('sex')
  const keepCategory = groupBy.includes('category')
  const category = uniqueValues(bucket.athletes, 'category')[0] ?? ''
  const open = slots.filter((slot) => {
    if (slot.room < size) return false
    if (keepSex && slot.sex === 'mixed') return false
    if (keepSex && slot.sex && bucket.sex && slot.sex !== bucket.sex) return false
    if (keepCategory && slot.category && slot.category !== category) return false
    return true
  })
  // Una tanda con gente del mismo grupo gana a una vacía: así no se abren
  // tandas de más mientras hay una compatible a medio llenar.
  const slot = open.find((item) => item.existingCount + item.additions.length > 0) ?? open[0]
  if (!slot) return false
  slot.additions.push(...bucket.athletes)
  slot.room -= size
  if (!slot.sex) slot.sex = bucket.sex
  if (!slot.category) slot.category = category
  return true
}

/** Corta la lista de tandas nuevas en tantos tramos contiguos como días, parejos en atletas. */
function dayForBuckets(buckets, dayIndexes) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.athletes.length, 0) || 1
  let before = 0
  return buckets.map((bucket) => {
    const middle = before + bucket.athletes.length / 2
    before += bucket.athletes.length
    return dayIndexes[Math.min(dayIndexes.length - 1, Math.floor((middle / total) * dayIndexes.length))]
  })
}

function platformForBucket(bucket, positionInDay, platforms, mode) {
  if (platforms.length === 0) return null
  if (mode === 'sex' && platforms.length > 1 && bucket.sex) {
    return platforms[sexRank(bucket.sex) % platforms.length]
  }
  return platforms[positionInDay % platforms.length]
}

/**
 * Arma el plan. `unassigned` tiene que ser solo gente sin día: el planificador
 * no mira el resto del tablero para no "devolver" a alguien.
 *
 * Devuelve placements (a quién, dónde), newSessions (tandas a crear, ya con
 * tablado), summaries (lo que muestra el preview) y leftover (quién no entró).
 */
export function planEventBoard({
  unassigned = [],
  days = [],
  platforms = [],
  ...overrides
} = {}) {
  const options = { ...DEFAULT_PLAN_OPTIONS, ...overrides }
  const cap = Math.max(1, Number(options.maxPerSession) || DEFAULT_FLIGHT_SIZE)
  const groupBy = PLAN_GROUP_KEYS.filter((key) => options.groupBy?.includes(key))
  const dayIndexes = (options.dayIndexes ?? days.map((day) => day.dayIndex)).filter((index) =>
    days.some((day) => day.dayIndex === index),
  )

  const pending = unassigned.filter((athlete) => athlete?.registrationId)
  const buckets = buildBuckets(pending, {
    groupBy,
    sortBy: options.sortBy,
    maxPerSession: cap,
    mergeSmall: options.mergeSmall,
  })

  const slots = options.useExisting ? existingSlots(days, dayIndexes, cap) : []
  const toCreate = []
  for (const bucket of buckets) {
    if (!placeInExisting(bucket, slots, groupBy)) toCreate.push(bucket)
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
      platformId: slot.platformId,
      platformName: slot.platform,
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

  if (dayIndexes.length === 0) {
    leftover.push(...toCreate.flatMap((bucket) => bucket.athletes))
    return { placements, newSessions, leftover, summaries, placed: placements.length }
  }

  const names = days.flatMap((day) => (day.sessions ?? []).map((session) => session.name))
  const bucketDays = dayForBuckets(toCreate, dayIndexes)
  const positionByDay = new Map()

  toCreate.forEach((bucket, index) => {
    const dayIndex = bucketDays[index]
    const position = positionByDay.get(dayIndex) ?? 0
    positionByDay.set(dayIndex, position + 1)
    const platform = platformForBucket(bucket, position, platforms, options.platformMode)
    const name = nextSessionName(names)
    names.push(name)
    const tempId = `new|${dayIndex}|${name}`
    const composition = summarizeComposition(bucket.athletes)

    newSessions.push({
      tempId,
      dayIndex,
      name,
      platformId: platform?.id ?? null,
      platform: platform?.name ?? '',
      composition,
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
      platformId: platform?.id ?? null,
      platformName: platform?.name ?? '',
      sessionId: null,
      tempId,
      name,
      composition,
      added: bucket.athletes.length,
      total: bucket.athletes.length,
      capacity: cap,
      isNew: true,
    })
  })

  return { placements, newSessions, leftover, summaries, placed: placements.length }
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
