/**
 * publicSchedule.js — PLU ARG
 *
 * Grilla de competencia tal como la ve el público: tandas por tablado con su
 * composición. Es la proyección de `public_event_schedule`, que no trae
 * nombres, clubes ni fechas de nacimiento; este módulo no podría mostrarlos
 * aunque quisiera.
 *
 * Puro a propósito: el mapeo, el armado de carriles y el texto de composición
 * se prueban sin render.
 */

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== '') : []
}

function numberOrNull(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? null
    : Number(value)
}

function toSession(row) {
  return {
    name: row?.name ?? '',
    platform: row?.platform ?? '',
    platformId: row?.platformId ?? row?.platform_id ?? null,
    weighInAt: row?.weighInAt ?? row?.weigh_in_at ?? null,
    startsAt: row?.startsAt ?? row?.starts_at ?? null,
    athleteCount: Number(row?.athleteCount ?? row?.athlete_count ?? 0),
    sexes: list(row?.sexes),
    categories: list(row?.categories),
    divisions: list(row?.divisions),
    weightMin: numberOrNull(row?.weightMin),
    weightMax: numberOrNull(row?.weightMax),
    ageMin: numberOrNull(row?.ageMin),
    ageMax: numberOrNull(row?.ageMax),
  }
}

/**
 * Carriles de un día: uno por tablado definido (en su orden) y, al final, las
 * tandas que no apuntan a un tablado conocido, agrupadas por el texto legado de
 * plataforma. Sin tablados definidos y sin texto, un solo carril sin nombre.
 */
export function buildPublicLanes(sessions, platforms) {
  const known = new Map(platforms.map((platform) => [platform.id, platform]))
  const lanes = platforms.map((platform) => ({
    key: platform.id,
    name: platform.name,
    sessions: sessions.filter((session) => session.platformId === platform.id),
  }))

  const loose = sessions.filter((session) => !session.platformId || !known.has(session.platformId))
  const byText = new Map()
  for (const session of loose) {
    const key = session.platform || ''
    if (!byText.has(key)) byText.set(key, [])
    byText.get(key).push(session)
  }
  for (const [name, rows] of byText) {
    lanes.push({ key: `text:${name}`, name, sessions: rows })
  }
  // Un tablado sin tandas ese día no aporta una columna vacía.
  return lanes.filter((lane) => lane.sessions.length > 0)
}

function timeValue(iso) {
  if (!iso) return null
  const value = new Date(iso).getTime()
  return Number.isNaN(value) ? null : value
}

/**
 * Las tandas de un tablado en orden de inicio. Las que no tienen hora van al
 * final, en el orden en que llegaron: no se les inventa un lugar en el tiempo.
 * El orden es estable, así que dos tandas a la misma hora conservan el suyo.
 */
export function sortSessionsByStart(sessions) {
  return sessions
    .map((session, index) => ({ session, index, time: timeValue(session.startsAt) }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index
      if (a.time === null) return 1
      if (b.time === null) return -1
      return a.time - b.time || a.index - b.index
    })
    .map((entry) => entry.session)
}

/** Normaliza la respuesta pública. `enabled: false` o sin tandas = nada que mostrar. */
export function normalizePublicSchedule(payload) {
  if (!payload || payload.enabled !== true) {
    return { enabled: false, platforms: [], days: [], hasContent: false }
  }
  const platforms = list(payload.platforms).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
  }))
  const days = list(payload.days)
    .map((day) => {
      const sessions = list(day.sessions).map(toSession)
      const lanes = buildPublicLanes(sessions, platforms).map((lane) => ({
        ...lane,
        sessions: sortSessionsByStart(lane.sessions),
        athleteCount: lane.sessions.reduce((total, session) => total + session.athleteCount, 0),
      }))
      return {
        dayIndex: Number(day.dayIndex ?? day.day_index ?? 0),
        label: day.label ?? '',
        date: day.date ?? null,
        lanes,
        sessionCount: sessions.length,
      }
    })
    .filter((day) => day.sessionCount > 0)
  return { enabled: true, platforms, days, hasContent: days.length > 0 }
}

function sortedUnique(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )
}

function extremes(values) {
  const numbers = values.map(numberOrNull).filter((value) => value !== null)
  return numbers.length === 0 ? [null, null] : [Math.min(...numbers), Math.max(...numbers)]
}

/**
 * El tablero del admin como lo recibiría `normalizePublicSchedule`: la misma
 * forma que `public_event_schedule`, armada con los datos de hoy. Sirve para la
 * vista previa antes de publicar. Solo copia composición (sexo, categoría,
 * división, peso, edad): nombres y clubes no pasan, así la vista previa no puede
 * mostrar más de lo que mostraría el sitio.
 */
export function boardToPublicPayload(board) {
  return {
    enabled: true,
    platforms: (board?.platforms ?? [])
      .map(({ id, name, sortOrder }) => ({ id, name, sortOrder: sortOrder ?? 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')),
    days: (board?.days ?? []).map((day) => ({
      dayIndex: day.dayIndex,
      label: day.label,
      date: day.date,
      sessions: [...(day.sessions ?? [])]
        .sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'es'),
        )
        .map((session) => {
          const athletes = session.athletes ?? []
          const [weightMin, weightMax] = extremes(athletes.map((athlete) => athlete.bodyweightKg))
          const [ageMin, ageMax] = extremes(athletes.map((athlete) => athlete.age))
          return {
            name: session.name,
            platform: session.platform,
            platformId: session.platformId,
            weighInAt: session.weighInAt,
            startsAt: session.startsAt,
            athleteCount: athletes.length,
            sexes: sortedUnique(athletes.map((athlete) => athlete.sex)),
            categories: sortedUnique(athletes.map((athlete) => athlete.category)),
            divisions: sortedUnique(athletes.map((athlete) => athlete.division)),
            weightMin,
            weightMax,
            ageMin,
            ageMax,
          }
        }),
    })),
  }
}

/**
 * Qué conviene revisar del tablero antes de publicarlo, contado sobre lo que el
 * sitio va a mostrar. Solo hechos: nada de tiempos ni topes que la organización
 * no haya cargado.
 *
 * - `noStart`: tandas con atletas y sin hora de inicio ("Horario a confirmar").
 * - `noPlatform`: tandas sin tablado conocido, cuando el evento tiene tablados.
 * - `empty`: tandas sin atletas, que igual se publican.
 * - `small`: tandas con atletas pero menos que `MIN_ATHLETES_FOR_RANGES`: no
 *   muestran peso ni edad.
 */
export function publicScheduleChecks(board) {
  const platformIds = new Set((board?.platforms ?? []).map((platform) => platform.id))
  const checks = { noStart: 0, noPlatform: 0, empty: 0, small: 0 }
  for (const day of board?.days ?? []) {
    for (const session of day.sessions ?? []) {
      const count = (session.athletes ?? []).length
      if (count === 0) checks.empty += 1
      else if (!session.startsAt) checks.noStart += 1
      if (count > 0 && count < MIN_ATHLETES_FOR_RANGES) checks.small += 1
      if (platformIds.size > 0 && !platformIds.has(session.platformId)) checks.noPlatform += 1
    }
  }
  return checks
}

/**
 * Día que se abre primero: el de hoy si hay competencia hoy (en hora de Buenos
 * Aires, que es la del evento); si no, el primero. Devuelve el `dayIndex`.
 */
export function pickInitialDayIndex(days, now = new Date()) {
  if (!days.length) return null
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const match = days.find((day) => day.date && String(day.date).slice(0, 10) === today)
  return (match ?? days[0]).dayIndex
}

/**
 * Con menos atletas que esto, el rango de peso y de edad deja de ser un rango:
 * en una tanda de uno son el peso y la edad exactos de esa persona, y con sexo,
 * categoría y división alcanza para reconocerla. La grilla pública es
 * composición, no datos de nadie.
 */
export const MIN_ATHLETES_FOR_RANGES = 3

function formatRange(min, max, unit) {
  if (min === null && max === null) return ''
  const low = min ?? max
  const high = max ?? min
  const body = low === high ? String(low) : `${low}–${high}`
  return `${body} ${unit}`
}

/**
 * La composición en dos líneas: quiénes son ("Femenino · Raw · Junior / Open")
 * y su rango ("52–63 kg · 19–24 años"). `labels` resuelve el sexo en el idioma
 * activo y el sufijo de edad; lo que no tiene dato se omite en vez de
 * inventarse, y el rango se reserva en tandas con pocos atletas.
 */
export function formatPublicCompositionParts(session, labels = {}) {
  const sex = session.sexes.map((value) => labels.sex?.[value] ?? value).join(' / ')
  const showRanges = session.athleteCount >= MIN_ATHLETES_FOR_RANGES
  return {
    profile: [sex, session.categories.join(' / '), session.divisions.join(' / ')]
      .filter(Boolean)
      .join(' · '),
    range: showRanges
      ? [
          formatRange(session.weightMin, session.weightMax, 'kg'),
          formatRange(session.ageMin, session.ageMax, labels.years ?? 'años'),
        ]
          .filter(Boolean)
          .join(' · ')
      : '',
  }
}

/** "Femenino · Raw · Junior / Open · 52–63 kg · 19–24 años" en una sola línea. */
export function formatPublicComposition(session, labels = {}) {
  const { profile, range } = formatPublicCompositionParts(session, labels)
  return [profile, range].filter(Boolean).join(' · ')
}
