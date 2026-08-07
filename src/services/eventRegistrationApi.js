import { apiGet, apiPost } from '../lib/api.js'
import { toCamelEventSchedule } from '../lib/eventSchedule.js'

/**
 * Summary público de cupos de inscripción de atletas + recientes sanitizados.
 * Fallback al mock lo resuelve el hook consumidor.
 */
export async function fetchEventRegistrationSummary(eventSlug) {
  const { summary } = await apiGet(
    `/api/events/${encodeURIComponent(eventSlug)}/registration-summary`,
  )
  return {
    capacity: summary?.capacity ?? null,
    registered: Number(summary?.registered ?? 0),
    remaining: summary?.remaining ?? null,
    recent: Array.isArray(summary?.recent)
      ? summary.recent.map((item) => ({
          displayName: String(item.displayName ?? item.display_name ?? '').trim() || 'Atleta',
          gym: String(item.gym ?? '').trim(),
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
  const { schedule } = await apiGet(
    `/api/events/${encodeURIComponent(eventSlug)}/schedule`,
  )
  return toCamelEventSchedule(schedule)
}

/** Reemplaza el set completo de tandas del evento. */
export async function saveEventSessions(eventSlug, sessions) {
  const { schedule } = await apiPost(
    `/api/events/${encodeURIComponent(eventSlug)}/sessions`,
    { sessions },
  )
  return toCamelEventSchedule(schedule)
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
    status: row.status,
    checkedIn: Boolean(row.checkedIn ?? row.checked_in),
  }
}

function toCamelBoardSession(row) {
  return {
    id: row.id,
    name: row.name ?? '',
    platform: row.platform ?? '',
    weighInAt: row.weighInAt ?? row.weigh_in_at ?? null,
    startsAt: row.startsAt ?? row.starts_at ?? null,
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    athletes: (row.athletes ?? []).map(toCamelBoardAthlete),
  }
}

export function toCamelEventBoard(payload) {
  return {
    event: payload?.event ?? null,
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
  const result = await apiPost(
    `/api/events/${encodeURIComponent(eventSlug)}/schedule/autofill`,
    { dayIndex, maxPerSession },
  )
  return {
    placed: Number(result?.placed ?? 0),
    remaining: Number(result?.remaining ?? 0),
    board: toCamelEventBoard(result?.board),
  }
}
