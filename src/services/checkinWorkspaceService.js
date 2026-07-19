import { registrationCheckinStatus } from './checkinScanService.js'

function belongsToEvent(record, eventSlug) {
  if (!eventSlug) return true
  return record.eventSlug === eventSlug
}

function registrationDay(registration) {
  return registration.competitionDay ?? registration.eventDay ?? registration.day ?? 'both'
}

function matchesDay(row, day) {
  if (day === 'all') return true
  if (day === 'day1' || day === 'day2') return row.day === day || row.day === 'both'
  return row.day === day
}

function matchesStatus(row, status) {
  if (status === 'all') return true
  if (status === 'done') return row.status === 'usada'
  if (status === 'ready') return row.status === 'pagada'
  return row.status !== 'usada' && row.status !== 'pagada'
}

const STATUS_ORDER = { pagada: 0, pendiente: 1, pendiente_pago: 1, confirmada: 1, usada: 2 }

export function buildCheckinRows({ athletes = [], registrations = [], tickets = [], eventSlug }) {
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
        day: registrationDay(registration),
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
      meta: ticket.ticketCode,
      day: ticket.dayPass,
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

export function summarizeCheckinRows(rows = []) {
  const count = (predicate) => rows.filter(predicate).length

  return {
    total: rows.length,
    ready: count((row) => row.status === 'pagada'),
    done: count((row) => row.status === 'usada'),
    pending: count((row) => row.status !== 'usada' && row.status !== 'pagada'),
    athletes: count((row) => row.type === 'atleta'),
    spectators: count((row) => row.type === 'espectador'),
    day1: count((row) => row.day === 'day1' || row.day === 'both'),
    day2: count((row) => row.day === 'day2' || row.day === 'both'),
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
