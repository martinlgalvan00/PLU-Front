import { HttpError } from '../../lib/errors.js'
import { assertEventAccess, eventScopeOf } from '../../lib/eventScope.js'

/**
 * Las rutas de aprobar, rechazar y ver comprobante actúan sobre una orden por su
 * id, sin saber de qué evento es. Para una cuenta por evento hay que averiguarlo y
 * verificar que sea de un evento asignado ANTES de actuar. Para el resto del staff
 * (sin restricción) no se hace ninguna consulta: el costo es solo del organizador.
 *
 * Una orden sin evento (afiliación suelta) es de todos modos ajena al organizador:
 * no tiene un evento al que pertenecer, así que se deniega.
 */
async function ticketOrderEventId(client, orderId) {
  const { data, error } = await client
    .from('ticket_orders')
    .select('event_id')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new HttpError(503, 'No se pudo leer la orden.')
  if (!data) throw new HttpError(404, 'Orden no encontrada.')
  return data.event_id ?? null
}

/** Las órdenes de inscripción cuelgan del evento por `event_registrations.payment_order_id`. */
async function athleteOrderEventId(client, orderId) {
  const { data, error } = await client
    .from('event_registrations')
    .select('event_id')
    .eq('payment_order_id', orderId)
    .limit(1)
  if (error) throw new HttpError(503, 'No se pudo leer la orden.')
  return data?.[0]?.event_id ?? null
}

export async function assertTicketOrderInScope(req, client, orderId) {
  if (!eventScopeOf(req)) return
  assertEventAccess(req, { eventId: await ticketOrderEventId(client, orderId) })
}

/**
 * Un organizador gestiona SOLO inscripciones a sus eventos. Una orden combo
 * (afiliación + inscripción) cuelga de un evento pero incluye la afiliación, que es
 * ingreso de PLU: acreditarla es decisión de Finanzas, no del organizador.
 */
async function athleteOrderConcept(client, orderId) {
  const { data, error } = await client
    .from('athlete_payment_orders')
    .select('concept')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new HttpError(503, 'No se pudo leer la orden.')
  if (!data) throw new HttpError(404, 'Orden no encontrada.')
  return data.concept
}

export async function assertAthleteOrderInScope(req, client, orderId) {
  if (!eventScopeOf(req)) return
  assertEventAccess(req, { eventId: await athleteOrderEventId(client, orderId) })
  if ((await athleteOrderConcept(client, orderId)) !== 'registration') {
    throw new HttpError(
      403,
      'Tu cuenta gestiona las inscripciones y entradas de sus eventos, no las afiliaciones.',
      { code: 'event_scope_forbidden_change' },
    )
  }
}
