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
   muestra la propuesta y recién al confirmar se escribe nada.

   Motor v2:
   - Partición óptima por programación dinámica: tandas parejas y cortes donde
     no se parte una clase de peso (o, sin clases, donde hay un hueco real).
   - Tablados por carga: cada tanda va al tablado con menos atletas del día,
     así ninguno termina horas antes que el otro.
   - Horarios opcionales: pesaje e inicio de cada tanda desde la hora del primer
     inicio, la duración y la pausa.                                           */

export const PLAN_GROUP_KEYS = ['sex', 'category', 'division']

/** Todo lo que define "cómo se arma una grilla": es también lo que guarda una plantilla. */
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
  /** 'balance' (carga), 'alternate' (una y una) o 'sex' (un sexo por tablado). */
  platformMode: 'balance',
  /** Días a usar; null = todos. */
  dayIndexes: null,
  /**
   * Clases de peso opcionales por sexo: topes en kg, de menor a mayor. Sin
   * clases cargadas no se inventan: el corte se apoya en huecos entre pesos.
   */
  weightClasses: null,
  /** { firstStart:'09:00', sessionMinutes:60, gapMinutes:10, weighInLeadMinutes:120 } o null. */
  schedule: null,
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
 * mal armado aunque "cumpla" el tope. (Versión sin criterio de corte.)
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

/** Índice de la clase de peso de `weight` (0 = la más liviana); null si no hay dato. */
export function weightClassIndex(weight, bounds) {
  if (!Array.isArray(bounds) || bounds.length === 0) return null
  const value = Number(weight)
  if (weight === null || weight === undefined || !Number.isFinite(value)) return null
  const index = bounds.findIndex((limit) => value <= Number(limit))
  return index === -1 ? bounds.length : index
}

/**
 * Partición contigua óptima en k = ceil(n / cap) tandas.
 *
 * Minimiza la suma de cuadrados del desvío de tamaño respecto de n/k (tandas
 * parejas) y le suma el costo de cada corte: partir a dos atletas que están en
 * la misma clase (`sameKey`) cuesta `cap * 1.5`, lo que equivale a "mover el
 * corte unos lugares antes que partir una clase"; cortar donde hay un hueco
 * (`gapAt`) es levemente más barato. Con n por grupo de unos cientos y tope ~12
 * son O(n·k·cap) operaciones: instantáneo.
 */
export function optimalChunks(list, cap, { sameKey = null, gapAt = null } = {}) {
  const n = list.length
  if (n === 0) return []
  const k = Math.ceil(n / cap)
  if (k === 1) return [list]

  const target = n / k
  // cutCost[i] = costo de cortar entre list[i - 1] y list[i].
  const cutCost = new Array(n + 1).fill(0)
  for (let i = 1; i < n; i += 1) {
    if (sameKey?.(list[i - 1], list[i])) {
      cutCost[i] = cap * 1.5
    } else if (gapAt) {
      cutCost[i] = -Math.min(Number(gapAt(list[i - 1], list[i])) || 0, 5) * 0.4
    }
  }

  const dp = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Number.POSITIVE_INFINITY))
  const from = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(0))
  dp[0][0] = 0
  for (let j = 1; j <= k; j += 1) {
    for (let t = j; t <= n; t += 1) {
      const maxSize = Math.min(cap, t - (j - 1))
      for (let size = 1; size <= maxSize; size += 1) {
        const start = t - size
        const previous = dp[j - 1][start]
        if (previous === Number.POSITIVE_INFINITY) continue
        const cost = previous + (size - target) ** 2 + (start > 0 ? cutCost[start] : 0)
        if (cost < dp[j][t]) {
          dp[j][t] = cost
          from[j][t] = start
        }
      }
    }
  }

  const chunks = []
  let end = n
  for (let j = k; j >= 1; j -= 1) {
    const start = from[j][end]
    chunks.unshift(list.slice(start, end))
    end = start
  }
  return chunks
}

function singleSex(athletes) {
  const sexes = uniqueValues(athletes, 'sex')
  return sexes.length === 1 ? sexes[0] : null
}

/** Criterio de corte del grupo según cómo se ordena y si hay clases de peso. */
function cutCriteria(sortBy, weightClasses) {
  if (sortBy === 'age') {
    return {
      sameKey: (a, b) => numberOrInfinity(a?.age) === numberOrInfinity(b?.age),
      gapAt: (a, b) => {
        const low = numberOrInfinity(a?.age)
        const high = numberOrInfinity(b?.age)
        return Number.isFinite(low) && Number.isFinite(high) ? high - low : 0
      },
    }
  }
  return {
    sameKey: (a, b) => {
      const bounds = weightClasses?.[a?.sex]
      const classA = weightClassIndex(a?.bodyweightKg, bounds)
      if (classA !== null) return classA === weightClassIndex(b?.bodyweightKg, bounds)
      return numberOrInfinity(a?.bodyweightKg) === numberOrInfinity(b?.bodyweightKg)
    },
    gapAt: (a, b) => {
      const low = numberOrInfinity(a?.bodyweightKg)
      const high = numberOrInfinity(b?.bodyweightKg)
      return Number.isFinite(low) && Number.isFinite(high) ? high - low : 0
    },
  }
}

/** Tandas candidatas (todavía sin día, tablado ni nombre), en orden de competencia. */
function buildBuckets(athletes, { groupBy, sortBy, maxPerSession, mergeSmall, weightClasses }) {
  const sorted = [...athletes].sort(planComparator(groupBy, sortBy))
  const groups = []
  for (const athlete of sorted) {
    const key = groupKeyOf(athlete, groupBy)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.athletes.push(athlete)
    else groups.push({ key, athletes: [athlete] })
  }

  const criteria = cutCriteria(sortBy, weightClasses)
  const buckets = groups.flatMap((group) =>
    optimalChunks(group.athletes, maxPerSession, criteria).map((chunk) => ({
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

/** Elige el tablado de una tanda nueva. `loads[i]` = atletas ya asignados al tablado i ese día. */
function pickPlatform(bucket, position, platforms, loads, mode) {
  if (platforms.length === 0) return null
  if (mode === 'sex' && platforms.length > 1 && bucket.sex) {
    return platforms[sexRank(bucket.sex) % platforms.length]
  }
  if (mode === 'alternate') return platforms[position % platforms.length]
  let best = 0
  for (let index = 1; index < platforms.length; index += 1) {
    if (loads[index] < loads[best]) best = index
  }
  return platforms[best]
}

/* ── Horarios ──────────────────────────────────────────────────────────── */

// Argentina no tiene horario de verano y la organización opera en Buenos
// Aires (20260930100000): el offset fijo evita depender de la zona del navegador.
const ORG_UTC_OFFSET = '-03:00'

/** "09:30" → 570. null si no es una hora válida. */
export function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes
}

/** Fecha 'YYYY-MM-DD' + minutos desde medianoche (hora de la organización) → ISO UTC. */
export function isoFromLocalMinutes(dateString, minutes) {
  const day = String(dateString ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(minutes)) return ''
  const base = Date.parse(`${day}T00:00:00${ORG_UTC_OFFSET}`)
  return Number.isNaN(base) ? '' : new Date(base + minutes * 60_000).toISOString()
}

/** Normaliza la configuración de horarios; null si falta algo para calcularlos. */
export function normalizeSchedule(schedule) {
  if (!schedule) return null
  const first = parseClock(schedule.firstStart)
  const duration = Number(schedule.sessionMinutes)
  if (first === null || !Number.isFinite(duration) || duration < 1) return null
  const gap = Number(schedule.gapMinutes)
  const lead = Number(schedule.weighInLeadMinutes)
  return {
    first,
    duration,
    gap: Number.isFinite(gap) && gap >= 0 ? gap : 0,
    lead: Number.isFinite(lead) && lead >= 0 ? lead : 0,
  }
}

function slotTimes(clock, date, index) {
  if (!clock || !date) return { startsAt: '', weighInAt: '' }
  const start = clock.first + index * (clock.duration + clock.gap)
  return {
    startsAt: isoFromLocalMinutes(date, start),
    weighInAt: clock.lead > 0 ? isoFromLocalMinutes(date, start - clock.lead) : '',
  }
}

/**
 * Candidatos y días para REHACER la grilla desde cero: todos los que no
 * registraron ingreso (a quien ya pasó por la puerta no se lo mueve) y las
 * tandas vaciadas de esa gente, que quedan como contenedores reutilizables.
 */
export function rebuildInput(board) {
  const movable = (athlete) => !athlete.checkedIn
  const days = (board?.days ?? []).map((day) => ({
    ...day,
    sessions: (day.sessions ?? []).map((session) => ({
      ...session,
      athletes: (session.athletes ?? []).filter((athlete) => !movable(athlete)),
    })),
  }))
  const placed = (board?.days ?? []).flatMap((day) => [
    ...(day.sessions ?? []).flatMap((session) => session.athletes ?? []),
    ...(day.withoutSession ?? []),
  ])
  return {
    days,
    candidates: [...(board?.unassigned ?? []), ...placed].filter(movable),
  }
}

/**
 * Arma el plan. `unassigned` son los candidatos (por defecto, la bolsa sin
 * día); el planificador no mira el resto del tablero.
 *
 * Devuelve placements (a quién, dónde), newSessions (tandas a crear, ya con
 * tablado y horario), summaries (lo que muestra el preview), leftover (quién no
 * entró) y stats (carga por tablado, tamaños).
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
  const clock = normalizeSchedule(options.schedule)

  const pending = unassigned.filter((athlete) => athlete?.registrationId)
  const buckets = buildBuckets(pending, {
    groupBy,
    sortBy: options.sortBy,
    maxPerSession: cap,
    mergeSmall: options.mergeSmall,
    weightClasses: options.weightClasses,
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
      mixedSex: uniqueValues(slot.additions, 'sex').length > 1,
    })
  }

  const leftover = []
  const newSessions = []

  if (dayIndexes.length === 0) {
    leftover.push(...toCreate.flatMap((bucket) => bucket.athletes))
    return {
      placements,
      newSessions,
      leftover,
      summaries,
      placed: placements.length,
      stats: buildStats(summaries, platforms),
    }
  }

  const names = days.flatMap((day) => (day.sessions ?? []).map((session) => session.name))
  const bucketDays = dayForBuckets(toCreate, dayIndexes)

  // Carga y cantidad de tandas por (día, tablado): arranca con lo que ya hay.
  const loadByDay = new Map()
  const lanesOf = (dayIndex) => {
    if (!loadByDay.has(dayIndex)) {
      const day = days.find((item) => item.dayIndex === dayIndex)
      const existing = day?.sessions ?? []
      loadByDay.set(dayIndex, {
        position: 0,
        loads: platforms.map((platform) =>
          existing
            .filter((session) => session.platformId === platform.id)
            .reduce((sum, session) => sum + (session.athletes?.length ?? 0), 0),
        ),
        counts: platforms.map(
          (platform) => existing.filter((session) => session.platformId === platform.id).length,
        ),
        none: existing.filter((session) => !session.platformId).length,
        date: day?.date ?? null,
      })
    }
    return loadByDay.get(dayIndex)
  }

  toCreate.forEach((bucket, index) => {
    const dayIndex = bucketDays[index]
    const lane = lanesOf(dayIndex)
    const platform = pickPlatform(bucket, lane.position, platforms, lane.loads, options.platformMode)
    lane.position += 1
    const platformIndex = platform ? platforms.indexOf(platform) : -1
    let slotIndex = lane.none
    if (platformIndex >= 0) {
      lane.loads[platformIndex] += bucket.athletes.length
      slotIndex = lane.counts[platformIndex]
      lane.counts[platformIndex] += 1
    } else {
      lane.none += 1
    }
    const times = slotTimes(clock, lane.date, slotIndex)

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
      weighInAt: times.weighInAt,
      startsAt: times.startsAt,
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
      mixedSex: uniqueValues(bucket.athletes, 'sex').length > 1,
      startsAt: times.startsAt,
      weighInAt: times.weighInAt,
    })
  })

  return {
    placements,
    newSessions,
    leftover,
    summaries,
    placed: placements.length,
    stats: buildStats(summaries, platforms),
  }
}

/** Resumen del plan: tamaños y carga por tablado (lo que dice si quedó parejo). */
function buildStats(summaries, platforms) {
  const sizes = summaries.map((row) => row.total)
  const byPlatform = platforms.map((platform) => {
    const rows = summaries.filter((row) => row.platformId === platform.id)
    return {
      id: platform.id,
      name: platform.name,
      sessions: rows.length,
      athletes: rows.reduce((sum, row) => sum + row.added, 0),
    }
  })
  return {
    sessions: summaries.length,
    newSessions: summaries.filter((row) => row.isNew).length,
    smallest: sizes.length ? Math.min(...sizes) : 0,
    largest: sizes.length ? Math.max(...sizes) : 0,
    mixedSex: summaries.filter((row) => row.mixedSex).length,
    byPlatform,
  }
}

/**
 * Dónde está hoy cada inscripción: registrationId → { dayIndex, sessionId }.
 * `null/null` es "sin día". Es la foto que hace falta para deshacer un reparto.
 */
export function locationIndex(board) {
  const index = new Map()
  for (const athlete of board?.unassigned ?? []) {
    index.set(athlete.registrationId, { dayIndex: null, sessionId: null })
  }
  for (const day of board?.days ?? []) {
    for (const athlete of day.withoutSession ?? []) {
      index.set(athlete.registrationId, { dayIndex: day.dayIndex, sessionId: null })
    }
    for (const session of day.sessions ?? []) {
      for (const athlete of session.athletes ?? []) {
        index.set(athlete.registrationId, { dayIndex: day.dayIndex, sessionId: session.id })
      }
    }
  }
  return index
}

/** Agrupa `[registrationId, ubicación]` en lotes por destino, de a `size` como máximo. */
export function batchesFromLocations(entries, size = 400) {
  const groups = new Map()
  for (const [registrationId, location] of entries) {
    const dayIndex = location?.dayIndex ?? null
    const sessionId = location?.sessionId ?? null
    const key = `${dayIndex}|${sessionId}`
    if (!groups.has(key)) groups.set(key, { dayIndex, sessionId, registrationIds: [] })
    groups.get(key).registrationIds.push(registrationId)
  }
  return [...groups.values()].flatMap((group) => {
    const batches = []
    for (let start = 0; start < group.registrationIds.length; start += size) {
      batches.push({ ...group, registrationIds: group.registrationIds.slice(start, start + size) })
    }
    return batches
  })
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
