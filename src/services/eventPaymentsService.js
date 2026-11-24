import { apiGet } from '../lib/api.js'
import { mapTicketOrderRow } from './ticketApi.js'

/**
 * Cobros de UN evento, para el panel de un organizador.
 *
 * Un organizador no puede leer los listados globales de pagos (traen todos los
 * eventos y el servidor se los niega): este endpoint devuelve solo las órdenes de
 * entradas y de inscripción de su evento. Se normalizan a la MISMA forma que usan el
 * triage y los diálogos de validación, que ya aceptan los campos en camelCase y en
 * snake_case, así que no hay una segunda pantalla de cobros.
 */
function mapRegistrationOrder(row, event) {
  return {
    ...row,
    athleteId: row.athlete_id ?? null,
    eventSlug: event?.slug ?? null,
    manualPaymentChannel: row.manual_payment_channel ?? null,
    paymentProofPath: row.payment_proof_path ?? null,
    paymentProofUploadedAt: row.payment_proof_uploaded_at ?? null,
    createdAt: row.created_at ?? null,
    currency: row.currency ?? 'ARS',
  }
}

function mapAthlete(row) {
  if (!row?.id) return null
  return {
    id: row.id,
    fullName: row.full_name ?? row.fullName ?? '',
    documentId: row.document_id ?? row.documentId ?? null,
    email: row.email ?? null,
  }
}

export async function fetchEventPayments(eventSlug) {
  const result = await apiGet(`/api/events/${encodeURIComponent(eventSlug)}/payments`)
  const event = result?.event ?? { slug: eventSlug }
  const registrationOrders = result?.registrationOrders ?? []

  const athletes = new Map()
  for (const order of registrationOrders) {
    const athlete = mapAthlete(order.athlete)
    if (athlete) athletes.set(athlete.id, athlete)
  }

  return {
    event,
    summary: result?.summary ?? null,
    // Todas las órdenes del evento (cualquier estado): el triage las clasifica por estado.
    pendingTicketOrders: (result?.ticketOrders ?? []).map(mapTicketOrderRow),
    payments: registrationOrders.map((order) => mapRegistrationOrder(order, event)),
    athletes: [...athletes.values()],
  }
}
