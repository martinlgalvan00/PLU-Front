/**
 * eventSchedule.js — PLU ARG
 *
 * Grilla de competencia de una inscripción: qué día y en qué tanda entra a
 * plataforma ese atleta. Lo lee la credencial que escanea seguridad en la
 * puerta, el roster de check-in y el panel de inscripciones, así que el mapeo
 * y el formato viven acá y no repetidos en cada consumidor.
 *
 * Los dos niveles son opcionales por diseño: al inscribirse y pagar todavía no
 * hay grilla armada, y la organización asigna primero el día y más cerca de la
 * fecha la tanda. "A confirmar" es un estado legítimo que hay que poder
 * mostrar, no la ausencia de un dato.
 *
 * Ojo con `sessionDisplayName` de `format.js`: esa "sesión" es la de la cuenta
 * logueada, no la tanda de competencia.
 */

/** Proyección `schedule` de Supabase (snake_case) → forma de la UI. */
export function toCamelSchedule(row) {
  if (!row) return null
  return {
    dayId: row.day_id ?? row.dayId ?? null,
    dayIndex: row.day_index ?? row.dayIndex ?? null,
    dayLabel: row.day_label ?? row.dayLabel ?? null,
    dayDate: row.day_date ?? row.dayDate ?? null,
    sessionId: row.session_id ?? row.sessionId ?? null,
    sessionName: row.session_name ?? row.sessionName ?? null,
    platform: row.platform ?? null,
    weighInAt: row.weigh_in_at ?? row.weighInAt ?? null,
    startsAt: row.starts_at ?? row.startsAt ?? null,
  }
}

/** Tanda del catálogo del evento (staff_get_event_schedule). */
export function toCamelEventSession(row) {
  if (!row) return null
  return {
    id: row.id,
    eventDayId: row.eventDayId ?? row.event_day_id ?? null,
    dayIndex: row.dayIndex ?? row.day_index ?? null,
    name: row.name ?? '',
    platform: row.platform ?? '',
    weighInAt: row.weighInAt ?? row.weigh_in_at ?? null,
    startsAt: row.startsAt ?? row.starts_at ?? null,
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    assignedCount: Number(row.assignedCount ?? row.assigned_count ?? 0),
  }
}

export function toCamelScheduleDay(row) {
  if (!row) return null
  return {
    id: row.id,
    dayIndex: row.dayIndex ?? row.day_index ?? null,
    label: row.label ?? '',
    date: row.date ?? null,
    assignedCount: Number(row.assignedCount ?? row.assigned_count ?? 0),
  }
}

export function toCamelEventSchedule(payload) {
  return {
    eventSlug: payload?.eventSlug ?? payload?.event_slug ?? null,
    days: (payload?.days ?? []).map(toCamelScheduleDay),
    sessions: (payload?.sessions ?? []).map(toCamelEventSession),
    unassignedCount: Number(payload?.unassignedCount ?? payload?.unassigned_count ?? 0),
  }
}

/** ¿Esta inscripción ya tiene día asignado? */
export function hasScheduledDay(schedule) {
  return Boolean(schedule?.dayId)
}

function localeTag(locale) {
  return locale === 'en' ? 'en-US' : 'es-AR'
}

/** "sáb 14 nov" — la fecha del día de competencia, sin el año, que ya se sabe. */
export function formatScheduleDate(schedule, locale = 'es') {
  if (!schedule?.dayDate) return ''
  const date = new Date(`${String(schedule.dayDate).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  // es-AR devuelve "sáb, 14 nov": el punto de la abreviatura y la coma sobran
  // en una línea que ya está separada por medios puntos.
  return date
    .toLocaleDateString(localeTag(locale), { weekday: 'short', day: 'numeric', month: 'short' })
    .replaceAll('.', '')
    .replace(',', '')
}

/**
 * "08:30" — horario de pesaje o de inicio de tanda.
 *
 * 24 h fijo: es-AR sale en 12 h por defecto ("08:30 a. m.") y una grilla de
 * competencia no se lee así en ningún lado.
 */
export function formatScheduleTime(iso, locale = 'es') {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(localeTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/**
 * Línea principal para la puerta: "Día 2 · sáb 14 nov · Tanda B".
 * Devuelve '' cuando no hay día asignado — el consumidor decide qué decir en
 * ese caso, porque el copy cambia según dónde se muestre.
 */
export function formatScheduleSummary(schedule, locale = 'es') {
  if (!hasScheduledDay(schedule)) return ''
  return [schedule.dayLabel, formatScheduleDate(schedule, locale), schedule.sessionName]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Segunda línea, la logística de la tanda: "Pesaje 08:30 · Plataforma 1".
 * Se separa del resumen porque en la credencial va en otra jerarquía y porque
 * suele llegar más tarde que la asignación de tanda.
 */
export function formatSessionDetail(schedule, locale = 'es', labels = {}) {
  if (!schedule?.sessionId) return ''
  const weighIn = formatScheduleTime(schedule.weighInAt, locale)
  const starts = formatScheduleTime(schedule.startsAt, locale)

  return [
    weighIn && `${labels.weighIn ?? 'Pesaje'} ${weighIn}`,
    starts && `${labels.starts ?? 'Inicio'} ${starts}`,
    schedule.platform,
  ]
    .filter(Boolean)
    .join(' · ')
}
