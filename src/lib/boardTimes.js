/**
 * boardTimes.js — PLU ARG
 *
 * Horas de una tanda en el formulario del tablero. Un día con fecha se edita
 * con "HH:MM" en hora de Buenos Aires (la de la organización, no la del
 * navegador); un día sin fecha no tiene a qué anclar una hora y cae al
 * `datetime-local` de siempre.
 */
import { isoFromLocalMinutes, minutesOfDay, parseClock } from '../services/eventBoardPlanner.js'

const pad = (n) => String(n).padStart(2, '0')

/** ISO → "HH:MM" del día dado, o '' si no hay hora o es de otra fecha. */
export function clockFromIso(iso, date) {
  const minutes = minutesOfDay(iso, date)
  return minutes === null ? '' : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

/** "HH:MM" + fecha del día → ISO UTC, o '' si falta algo. */
export function isoFromClock(clock, date) {
  const minutes = parseClock(clock)
  return minutes === null ? '' : isoFromLocalMinutes(date, minutes)
}

/** datetime-local trabaja en hora local; el backend guarda ISO con zona. */
export function toLocalInputValue(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function fromLocalInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/**
 * Borrador de las horas de una tanda. `initial` guarda lo que había: si la
 * persona no tocó un campo, se conserva el ISO original tal cual (una hora de
 * otra fecha, por ejemplo, no se pierde al guardar otra cosa).
 */
export function draftTimesFromSession(session, date) {
  const clock = Boolean(date)
  const read = (iso) => (clock ? clockFromIso(iso, date) : toLocalInputValue(iso))
  const startsAt = read(session.startsAt)
  const weighInAt = read(session.weighInAt)
  return {
    timeMode: clock ? 'clock' : 'datetime',
    dayDate: date ?? null,
    startsAt,
    weighInAt,
    initial: {
      startsAt,
      weighInAt,
      startsAtIso: session.startsAt ?? '',
      weighInIso: session.weighInAt ?? '',
    },
  }
}

/** Valor del borrador → ISO a guardar (o '' si se vació). */
export function isoFromDraftTime(draft, field) {
  const value = draft[field]
  const isoKey = field === 'startsAt' ? 'startsAtIso' : 'weighInIso'
  if (value === draft.initial[field]) return draft.initial[isoKey]
  if (!value) return ''
  return draft.timeMode === 'clock' ? isoFromClock(value, draft.dayDate) : fromLocalInputValue(value)
}

/**
 * Cambia la hora de inicio y, si el pesaje venía a una distancia fija del
 * inicio y nadie lo editó a mano (`weighTouched`), lo corre igual. Así mover una tanda no obliga a
 * retocar también el pesaje.
 */
export function shiftStart(draft, nextStart) {
  const patch = { startsAt: nextStart }
  if (draft.timeMode !== 'clock') return patch
  const oldStart = parseClock(draft.startsAt)
  const oldWeigh = parseClock(draft.weighInAt)
  const newStart = parseClock(nextStart)
  if (!draft.weighTouched && oldStart !== null && oldWeigh !== null && newStart !== null) {
    const lead = oldStart - oldWeigh
    const next = newStart - lead
    if (lead > 0 && next >= 0) patch.weighInAt = `${pad(Math.floor(next / 60))}:${pad(next % 60)}`
  }
  return patch
}
