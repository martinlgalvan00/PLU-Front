import { registrationCheckinStatus, scheduleDayIndexes } from './checkinScanService.js'

function belongsToEvent(record, eventSlug) {
  if (!eventSlug) return true
  return record.eventSlug === eventSlug
}

/** Días a los que da acceso un ticket, resueltos vía su tipo de entrada.
 * 'all' = sin restricción de día (un atleta al que todavía no le asignaron
 * grilla entra en cualquiera; ver scheduleDayIndexes). */
function ticketDayIndexes(ticket, ticketTypes) {
  const type = ticketTypes.find((item) => item.id === ticket.ticketTypeId)
  return type?.dayIndexes ?? []
}

function matchesDay(row, dayIndex) {
  if (dayIndex === 'all') return true
  if (row.dayIndexes === 'all') return true
  return (row.dayIndexes ?? []).includes(dayIndex)
}

function matchesStatus(row, status) {
  if (status === 'all') return true
  if (status === 'done') return row.status === 'usada'
  if (status === 'ready') return row.status === 'pagada'
  return row.status !== 'usada' && row.status !== 'pagada'
}

const STATUS_ORDER = { pagada: 0, pendiente: 1, pendiente_pago: 1, confirmada: 1, usada: 2 }

export function buildCheckinRows({ athletes = [], registrations = [], tickets = [], eventSlug, ticketTypes = [] }) {
  const athleteRows = registrations
    .filter((registration) => registration.status !== 'cancelada' && belongsToEvent(registration, eventSlug))
    .map((registration) => {
      const athlete = athletes.find((item) => item.id === registration.athleteId)
      return {
        id: `reg-${registration.id}`,
        registrationId: registration.id,
        type: 'atleta',
        name: athlete?.fullName,
        document: athlete?.documentId,
        meta: [registration.category, registration.division].filter(Boolean).join(' · '),
        // Antes todos los atletas iban a 'all' y aparecían en la pestaña de
        // cada día. Con la grilla asignada el roster de un día es el de ese día.
        dayIndexes: scheduleDayIndexes(registration.schedule),
        schedule: registration.schedule ?? null,
        status: registrationCheckinStatus(registration),
        checkedInAt: registration.checkedInAt,
      }
    })

  const ticketRows = tickets
    .filter((ticket) => belongsToEvent(ticket, eventSlug))
    .map((ticket) => ({
      id: `tkt-${ticket.id}`,
      ticketCode: ticket.ticketCode,
      qrToken: ticket.qrToken,
      type: 'espectador',
      name: ticket.attendeeName,
      document: ticket.attendeeDni,
      meta: ticket.ticketTypeName ?? ticket.ticketCode,
      dayIndexes: ticketDayIndexes(ticket, ticketTypes),
      status: ticket.status,
      checkedInAt: ticket.checkedInAt,
      addons: ticket.addons ?? [],
    }))

  return [...athleteRows, ...ticketRows].sort((left, right) => {
    const statusDifference = (STATUS_ORDER[left.status] ?? 1) - (STATUS_ORDER[right.status] ?? 1)
    if (statusDifference !== 0) return statusDifference
    return (left.name ?? '').localeCompare(right.name ?? '', 'es')
  })
}

export function summarizeCheckinRows(rows = [], eventDays = []) {
  const count = (predicate) => rows.filter(predicate).length

  return {
    total: rows.length,
    ready: count((row) => row.status === 'pagada'),
    done: count((row) => row.status === 'usada'),
    pending: count((row) => row.status !== 'usada' && row.status !== 'pagada'),
    athletes: count((row) => row.type === 'atleta'),
    spectators: count((row) => row.type === 'espectador'),
    byDay: Object.fromEntries(
      eventDays.map((day) => [day.dayIndex, count((row) => matchesDay(row, day.dayIndex))]),
    ),
  }
}

export function filterCheckinRows(rows = [], { query = '', type = 'all', day = 'all', status = 'all' } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase('es')

  return rows.filter((row) => {
    const typeMatch = type === 'all' || row.type === type
    const dayMatch = matchesDay(row, day)
    const statusMatch = matchesStatus(row, status)
    const queryMatch =
      !normalizedQuery ||
      row.name?.toLocaleLowerCase('es').includes(normalizedQuery) ||
      row.document?.includes(normalizedQuery) ||
      row.meta?.toLocaleLowerCase('es').includes(normalizedQuery)

    return typeMatch && dayMatch && statusMatch && queryMatch
  })
}
