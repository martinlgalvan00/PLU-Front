import { registrationCheckinStatus, scheduleDayIndexes } from './checkinScanService.js'
import { findOpenManualOrderForRegistration } from './paymentValidationService.js'

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
  // Subconjunto de "sin habilitar": los que la puerta puede resolver cobrando.
  if (status === 'to_validate') return Boolean(row.pendingOrder)
  return row.status !== 'usada' && row.status !== 'pagada'
}

function isCoachCredential(label) {
  return /entrenador/i.test(label ?? '')
}

function matchesType(row, type) {
  if (type === 'all') return true
  if (type === 'coach') return isCoachCredential(row.credentialLabel)
  return row.type === type
}

function matchesCredential(row, credential) {
  if (!credential || credential === 'all') return true
  return (row.credentialLabel ?? '').toLocaleLowerCase('es') === credential.toLocaleLowerCase('es')
}

/**
 * La puerta de seguridad no lee el snapshot admin (no tiene
 * `admin.athletes.read`). Esta es la proyección que sí puede pedir:
 * `staff_get_event_checkin_allowlist`.
 */
export function mapAllowlistToCheckinSources(allowlist, eventSlug) {
  const registrations = (allowlist?.registrations ?? []).map((entry) => ({
    id: entry.registrationId,
    athleteId: entry.registrationId,
    eventSlug,
    category: entry.category ?? null,
    division: entry.division ?? null,
    status: entry.status,
    checkedInAt: entry.checkedInAt ?? null,
  }))
  const athletes = (allowlist?.registrations ?? []).map((entry) => ({
    id: entry.registrationId,
    fullName: entry.athleteName,
    documentId: entry.athleteDocument,
  }))
  const tickets = (allowlist?.tickets ?? []).map((entry) => ({
    id: entry.qrToken ?? entry.ticketCode,
    eventSlug,
    qrToken: entry.qrToken,
    ticketCode: entry.ticketCode,
    attendeeName: entry.attendeeName,
    attendeeDni: entry.attendeeDni,
    ticketTypeId: entry.ticketTypeId,
    ticketTypeName: entry.ticketTypeName,
    credentialLabel: entry.credentialLabel ?? null,
    credentialScopes: entry.credentialScopes ?? [],
    status: entry.status,
    checkedInAt: entry.checkedInAt ?? null,
  }))
  return { athletes, registrations, tickets }
}

const STATUS_ORDER = { pagada: 0, pendiente: 1, pendiente_pago: 1, confirmada: 1, usada: 2 }

export function buildCheckinRows({
  athletes = [],
  payments = [],
  registrations = [],
  tickets = [],
  eventSlug,
  ticketTypes = [],
}) {
  const athleteRows = registrations
    .filter(
      (registration) =>
        registration.status !== 'cancelada' && belongsToEvent(registration, eventSlug),
    )
    .map((registration) => {
      const athlete = athletes.find((item) => item.id === registration.athleteId)
      return {
        id: `reg-${registration.id}`,
        registrationId: registration.id,
        athleteId: registration.athleteId,
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
        // La orden manual que traba el ingreso, si la hay. Sin esto la puerta
        // veía "sin habilitar" y no tenía con qué resolverlo: el efectivo que
        // se cobra ahí mismo obligaba a ir a Finanzas desde otro dispositivo.
        pendingOrder: findOpenManualOrderForRegistration(payments, registration),
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
      credentialLabel: ticket.credentialLabel ?? null,
      credentialScopes: ticket.credentialScopes ?? [],
      dayIndexes: ticketDayIndexes(ticket, ticketTypes),
      status: ticket.checkedInAt ? 'usada' : ticket.status,
      checkedInAt: ticket.checkedInAt,
      addons: ticket.addons ?? [],
    }))

  return [...athleteRows, ...ticketRows].sort((left, right) => {
    const statusDifference = (STATUS_ORDER[left.status] ?? 1) - (STATUS_ORDER[right.status] ?? 1)
    if (statusDifference !== 0) return statusDifference
    return (left.name ?? '').localeCompare(right.name ?? '', 'es')
  })
}

export function formatCheckinRowDay(row, eventDays = [], t) {
  if (row.dayIndexes === 'all' || !eventDays.length) {
    return row.type === 'atleta'
      ? t('admin.checkin.scheduleUnassigned')
      : t('admin.checkin.bothDays')
  }
  const labels = row.dayIndexes
    .map((dayIndex) => eventDays.find((item) => item.dayIndex === dayIndex)?.label)
    .filter(Boolean)
  const dayLabel = labels.length ? labels.join(' · ') : '—'
  return row.schedule?.sessionName ? `${dayLabel} · ${row.schedule.sessionName}` : dayLabel
}

export function summarizeCheckinRows(rows = [], eventDays = []) {
  const count = (predicate) => rows.filter(predicate).length

  return {
    total: rows.length,
    ready: count((row) => row.status === 'pagada'),
    done: count((row) => row.status === 'usada'),
    pending: count((row) => row.status !== 'usada' && row.status !== 'pagada'),
    // Cuántos de los que no pueden ingresar se destraban cobrando en la puerta.
    toValidate: count((row) => Boolean(row.pendingOrder)),
    athletes: count((row) => row.type === 'atleta'),
    spectators: count((row) => row.type === 'espectador'),
    byDay: Object.fromEntries(
      eventDays.map((day) => [day.dayIndex, count((row) => matchesDay(row, day.dayIndex))]),
    ),
  }
}

export function filterCheckinRows(
  rows = [],
  { query = '', type = 'all', day = 'all', status = 'all', credential = 'all' } = {},
) {
  const normalizedQuery = query.trim().toLocaleLowerCase('es')

  return rows.filter((row) => {
    const typeMatch = matchesType(row, type)
    const dayMatch = matchesDay(row, day)
    const statusMatch = matchesStatus(row, status)
    const credentialMatch = matchesCredential(row, credential)
    const queryMatch =
      !normalizedQuery ||
      row.name?.toLocaleLowerCase('es').includes(normalizedQuery) ||
      row.document?.includes(normalizedQuery) ||
      row.meta?.toLocaleLowerCase('es').includes(normalizedQuery) ||
      row.credentialLabel?.toLocaleLowerCase('es').includes(normalizedQuery)

    return typeMatch && dayMatch && statusMatch && credentialMatch && queryMatch
  })
}
