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
      return {
        dayIndex: Number(day.dayIndex ?? day.day_index ?? 0),
        label: day.label ?? '',
        date: day.date ?? null,
        lanes: buildPublicLanes(sessions, platforms),
        sessionCount: sessions.length,
      }
    })
    .filter((day) => day.sessionCount > 0)
  return { enabled: true, platforms, days, hasContent: days.length > 0 }
}

function formatRange(min, max, unit) {
  if (min === null && max === null) return ''
  const low = min ?? max
  const high = max ?? min
  const body = low === high ? String(low) : `${low}–${high}`
  return `${body} ${unit}`
}

/**
 * "Femenino · Raw · Junior / Open · 52–63 kg · 19–24 años".
 * `labels` resuelve el sexo en el idioma activo y el sufijo de edad; lo que no
 * tiene dato se omite en vez de inventarse.
 */
export function formatPublicComposition(session, labels = {}) {
  const sex = session.sexes.map((value) => labels.sex?.[value] ?? value).join(' / ')
  return [
    sex,
    session.categories.join(' / '),
    session.divisions.join(' / '),
    formatRange(session.weightMin, session.weightMax, 'kg'),
    formatRange(session.ageMin, session.ageMax, labels.years ?? 'años'),
  ]
    .filter(Boolean)
    .join(' · ')
}
