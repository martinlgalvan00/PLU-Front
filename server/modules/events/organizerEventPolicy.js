import { HttpError } from '../../lib/errors.js'
import { assertEventAccess, canAccessEvent, eventScopeOf } from '../../lib/eventScope.js'
import {
  EVENT_PAYMENT_CONCEPTS,
  isEventChannelForcedOpen,
  normalizeEventPaymentChannelOverrides,
} from '../../../src/lib/eventPaymentChannels.js'
import { PAYMENT_CHANNELS } from '../../services/platformFeatureToggleService.js'

/**
 * Qué puede cambiar un organizador al guardar SU evento.
 *
 * Reglas (decididas con Finanzas/PLU):
 * - Edita datos, cupos, precios y entradas de los eventos que se le asignaron.
 * - NO crea eventos, NO cambia el slug, NO publica ni abre/cierra inscripciones
 *   (`published`, `status`), NO lo destaca (`featured`) y NO cambia si exige
 *   afiliación. Esos campos se FUERZAN al valor actual del lado del servidor: no
 *   se confía en que el navegador no los mande.
 * - Puede CERRAR medios de pago de su evento, pero no forzar abrir uno que la
 *   plataforma tiene cerrado: saltearía la política de canales manuales cerrados.
 * - Elige la cuenta de cobro entre las cargadas por PLU. No carga alias sueltos
 *   (eso crearía una cuenta global como efecto lateral).
 */
const CURRENT_COLUMNS =
  'id, slug, published, status, requires_membership, rules, payment_channel_overrides, bank_transfer_alias, bank_transfer_cbu, bank_transfer_holder'

const FORBIDDEN_CODE = 'event_scope_forbidden_change'

function forbid(message) {
  return new HttpError(403, message, { code: FORBIDDEN_CODE })
}

function trimText(value) {
  return String(value ?? '').trim()
}

/** Deja solo los eventos del alcance de la cuenta (o todos si no tiene restricción). */
export function filterEventsForScope(req, events) {
  if (!eventScopeOf(req)) return events
  return (Array.isArray(events) ? events : []).filter((event) =>
    canAccessEvent(req, { eventId: event?.id ?? null, slug: event?.slug ?? null }),
  )
}

/**
 * Valida y sanea el cuerpo de `POST /api/events/upsert` de una cuenta por evento.
 * Devuelve el cuerpo con los campos protegidos fijados al valor actual del evento.
 */
export async function applyOrganizerUpsertPolicy({ req, client, body }) {
  if (!body?.id) throw forbid('Tu cuenta no puede crear eventos nuevos.')
  assertEventAccess(req, { eventId: body.id })

  const result = await client.from('events').select(CURRENT_COLUMNS).eq('id', body.id).maybeSingle()
  if (result.error) throw new HttpError(503, 'No se pudo leer el evento.')
  const current = result.data
  if (!current) throw new HttpError(404, 'El evento no existe.')
  // El slug que viaja es el del evento asignado: un id propio con el slug de otro
  // evento no puede mover los datos de aquel.
  assertEventAccess(req, { eventId: current.id, slug: current.slug })

  const incoming = normalizeEventPaymentChannelOverrides(body.paymentChannelOverrides)
  const existing = normalizeEventPaymentChannelOverrides(current.payment_channel_overrides)
  for (const concept of EVENT_PAYMENT_CONCEPTS) {
    for (const channel of PAYMENT_CHANNELS) {
      if (
        isEventChannelForcedOpen(incoming, concept, channel) &&
        !isEventChannelForcedOpen(existing, concept, channel)
      ) {
        throw forbid(
          'Tu cuenta puede cerrar medios de pago de este evento, pero no abrir uno que PLU tiene cerrado.',
        )
      }
    }
  }

  if (!body.bankTransferProfileId) {
    const bank = body.bankTransfer ?? {}
    const loose = [bank.alias, bank.cbu, bank.holder].some((value) => trimText(value))
    const unchanged =
      trimText(bank.alias) === trimText(current.bank_transfer_alias) &&
      trimText(bank.cbu) === trimText(current.bank_transfer_cbu) &&
      trimText(bank.holder) === trimText(current.bank_transfer_holder)
    if (loose && !unchanged) {
      throw forbid('Elegí una cuenta de transferencia de la lista: no podés cargar datos sueltos.')
    }
  }

  return {
    ...body,
    slug: current.slug,
    published: current.published === true,
    status: current.status,
    featured: current.rules?.featured === true,
    requiresMembership: current.requires_membership !== false,
  }
}
