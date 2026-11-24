import { apiDelete, apiGet, apiPost } from '../lib/api.js'
import { toCamelEventPlatform, toCamelEventSchedule } from '../lib/eventSchedule.js'
import { normalizePublicSchedule } from '../lib/publicSchedule.js'

/**
 * Summary público de cupos de inscripción de atletas + recientes sanitizados.
 * Fallback al mock lo resuelve el hook consumidor.
 */
function sanitizePublicGym(value) {
  const gym = String(value ?? '').trim()
  if (!gym || /^[.\s\-_/·•]+$/.test(gym)) return ''
  return gym
}

export async function fetchEventRegistrationSummary(eventSlug) {
  const { summary } = await apiGet(
    `/api/events/${encodeURIComponent(eventSlug)}/registration-summary`,
  )
  const progressPublicRaw = summary?.progressPublic ?? summary?.progress_public
  const totalPublicRaw = summary?.totalPublic ?? summary?.total_public
  const registeredTodayRaw = summary?.registeredToday ?? summary?.registered_today
  return {
    capacity: summary?.capacity ?? null,
    registered: Number(summary?.registered ?? 0),
    registeredToday: Number(registeredTodayRaw ?? 0),
    remaining: summary?.remaining ?? null,
    progressPublic: progressPublicRaw !== false,
    totalPublic: totalPublicRaw !== false,
    recent: Array.isArray(summary?.recent)
      ? summary.recent.map((item) => ({
          displayName: String(item.displayName ?? item.display_name ?? '').trim() || 'Atleta',
          gym: sanitizePublicGym(item.gym),
          photoUrl:
            typeof item.photoUrl === 'string' && item.photoUrl.trim() ? item.photoUrl : null,
          registeredAt: item.registeredAt ?? item.registered_at ?? null,
        }))
      : [],
  }
}

/**
 * Grilla de competencia del evento: días, tandas y cuántos atletas hay
 * asignados a cada uno. Requiere sesión de staff con `admin.registrations.read`.
 */
export async function fetchEventSchedule(eventSlug) {
  const { schedule } = await apiGet(`/api/events/${encodeURIComponent(eventSlug)}/schedule`)
  return toCamelEventSchedule(schedule)
}

/** Reemplaza el set completo de tandas del evento. */
export async function saveEventSessions(eventSlug, sessions) {
  const { schedule } = await apiPost(`/api/events/${encodeURIComponent(eventSlug)}/sessions`, {
    sessions,
  })
  return toCamelEventSchedule(schedule)
}

/**
 * Reemplaza el set de tablados del evento. Los que traen `id` se renombran; los
 * que no, se crean; los que faltan se quitan y sus tandas quedan sin tablado.
 */
export async function saveEventPlatforms(eventSlug, platforms) {
  const { schedule } = await apiPost(`/api/events/${encodeURIComponent(eventSlug)}/platforms`, {
    platforms,
  })
  return toCamelEventSchedule(schedule)
}

/** Plantillas de grilla de la organización (cualquier evento las ve). */
export async function fetchGridTemplates(eventSlug) {
  const { templates } = await apiGet(`/api/events/${encodeURIComponent(eventSlug)}/grid-templates`)
  return Array.isArray(templates) ? templates : []
}

/** Guarda una plantilla; con un nombre existente la pisa. Devuelve la lista. */
export async function saveGridTemplate(eventSlug, { name, config }) {
  const { templates } = await apiPost(
    `/api/events/${encodeURIComponent(eventSlug)}/grid-templates`,
    { name, config },
  )
  return Array.isArray(templates) ? templates : []
}

export async function deleteGridTemplate(eventSlug, templateId) {
  const { templates } = await apiDelete(
    `/api/events/${encodeURIComponent(eventSlug)}/grid-templates/${encodeURIComponent(templateId)}`,
  )
  return Array.isArray(templates) ? templates : []
}

/**
 * Grilla publicada del evento, sin sesión. Apagada o con el evento sin publicar
 * llega `enabled: false` y no hay nada que mostrar.
 */
export async function fetchPublicEventSchedule(eventSlug) {
  const { schedule } = await apiGet(`/api/events/${encodeURIComponent(eventSlug)}/schedule-public`)
  return normalizePublicSchedule(schedule)
}

/**
 * Publica o retira la grilla del sitio oficial. Devuelve el estado resultante.
 * Requiere `admin.events.write`.
 */
export async function setEventSchedulePublic(eventSlug, isPublic) {
  const result = await apiPost(`/api/events/${encodeURIComponent(eventSlug)}/schedule-public`, {
    public: Boolean(isPublic),
  })
  return Boolean(result?.schedulePublic)
}

/**
 * Asigna día/tanda a un lote de inscripciones. Con `dayIndex` y `sessionId` en
 * null la asignación se limpia y vuelven a "a confirmar".
 *
 * `updated` puede ser menor que `requested`: el backend descarta las canceladas
 * y las que no son de este evento, y esa diferencia se reporta en el panel en
 * vez de dar la operación por completa.
 */
export async function assignRegistrationSchedule(
  eventSlug,
  { registrationIds, dayIndex = null, sessionId = null },
) {
  const result = await apiPost(
    `/api/events/${encodeURIComponent(eventSlug)}/registrations/schedule`,
    { registrationIds, dayIndex, sessionId },
  )
  return {
    updated: Number(result?.updated ?? 0),
    requested: Number(result?.requested ?? registrationIds.length),
    schedule: toCamelEventSchedule(result?.schedule),
  }
}

function optionalBoardKg(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function optionalBoardFirstMeet(value) {
  if (value === true) return true
  if (value === false) return false
  return null
}

/** Fila de atleta en el tablero de armado de grilla. */
function toCamelBoardAthlete(row) {
  return {
    registrationId: row.registrationId ?? row.registration_id,
    athleteId: row.athleteId ?? row.athlete_id,
    fullName: row.fullName ?? row.full_name ?? '',
    gym: row.gym ?? '',
    division: row.division ?? '',
    category: row.category ?? '',
    bodyweightKg: row.bodyweightKg ?? row.bodyweight_kg ?? null,
    isFirstMeet: optionalBoardFirstMeet(row.isFirstMeet ?? row.is_first_meet),
    competitionBestTotalKg: optionalBoardKg(
      row.competitionBestTotalKg ?? row.competition_best_total_kg,
    ),
    trainingBestTotalKg: optionalBoardKg(row.trainingBestTotalKg ?? row.training_best_total_kg),
    sex: row.sex ?? null,
    // Edad al día que arranca el evento; null si el atleta no cargó nacimiento.
    age: row.age === null || row.age === undefined ? null : Number(row.age),
    status: row.status,
    checkedIn: Boolean(row.checkedIn ?? row.checked_in),
  }
}

function toCamelBoardSession(row) {
  return {
    id: row.id,
    name: row.name ?? '',
    platform: row.platform ?? '',
    platformId: row.platformId ?? row.platform_id ?? null,
    weighInAt: row.weighInAt ?? row.weigh_in_at ?? null,
    startsAt: row.startsAt ?? row.starts_at ?? null,
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    athletes: (row.athletes ?? []).map(toCamelBoardAthlete),
  }
}

export function toCamelEventBoard(payload) {
  return {
    event: payload?.event ?? null,
    schedulePublic: Boolean(payload?.schedulePublic),
    platforms: (payload?.platforms ?? []).map(toCamelEventPlatform),
    totals: {
      registered: Number(payload?.totals?.registered ?? 0),
      assigned: Number(payload?.totals?.assigned ?? 0),
      unassigned: Number(payload?.totals?.unassigned ?? 0),
    },
    days: (payload?.days ?? []).map((day) => ({
      id: day.id,
      dayIndex: day.dayIndex ?? day.day_index,
      label: day.label ?? '',
      date: day.date ?? null,
      assignedCount: Number(day.assignedCount ?? day.assigned_count ?? 0),
      sessions: (day.sessions ?? []).map(toCamelBoardSession),
      // Con día pero sin tanda: estado intermedio legítimo del armado.
      withoutSession: (day.withoutSession ?? day.without_session ?? []).map(toCamelBoardAthlete),
    })),
    unassigned: (payload?.unassigned ?? []).map(toCamelBoardAthlete),
  }
}

/** Tablero completo: días, tandas con su roster y los que faltan ubicar. */
export async function fetchEventBoard(eventSlug) {
  const { board } = await apiGet(`/api/events/${encodeURIComponent(eventSlug)}/board`)
  return toCamelEventBoard(board)
}

/**
 * Reparto sugerido de un día. Solo ubica a los que todavía no tienen día:
 * nunca mueve a alguien que la organización ya puso a mano.
 */
export async function autofillEventDay(eventSlug, { dayIndex, maxPerSession }) {
  const result = await apiPost(`/api/events/${encodeURIComponent(eventSlug)}/schedule/autofill`, {
    dayIndex,
    maxPerSession,
  })
  return {
    placed: Number(result?.placed ?? 0),
    remaining: Number(result?.remaining ?? 0),
    board: toCamelEventBoard(result?.board),
  }
}
