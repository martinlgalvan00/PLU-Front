import { HttpError } from '../lib/errors.js'

function enabledFlag(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

// Lanzamiento separado del toggle operativo: hasta que se habilite de forma
// explícita en el entorno, ninguna configuración de evento puede abrir ventas
// de espectadores por accidente. En tests se conserva abierto para ejercitar
// los contratos de tickets existentes.
export function isSpectatorTicketSalesLaunched(env = process.env) {
  const raw = env?.TICKET_SALES_ENABLED ?? env?.ticketSalesEnabled
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return (env?.NODE_ENV ?? process.env.NODE_ENV) === 'test'
  }
  return enabledFlag(raw)
}

/**
 * Cortes controlados desde el panel, en tres ejes independientes:
 *
 *   - ALTA (`checkout`, `membership`, `registration`, `ticket`): nadie crea una
 *     orden nueva de ese tipo, tenga o no código de tanda.
 *   - CANAL MANUAL (`*_manual`): transferencia y efectivo salen del checkout y
 *     sólo queda Mercado Pago. Las órdenes manuales ya creadas se siguen
 *     pudiendo validar.
 *   - VALIDACIÓN (`*_validation`): Finanzas no acredita ni activa nada de ese
 *     concepto, aunque la cuenta tenga el permiso. Sirve para cierre de caja,
 *     auditoría o sospecha de comprobantes falsos, sin tocar roles.
 *
 * Todo esto es independiente de `PAID_CHECKOUT_ENABLED` (legacy: sigue en el
 * código como freno de emergencia si Supabase no respondiera, pero ya no es la
 * vía operativa) y de `registration_access_gates` (tanda con código).
 *
 * Los validadores son sync y reciben el `toggles` ya leído: una ruta que
 * necesita más de uno (el combo exige cuatro) hace una sola consulta a Supabase
 * y la reusa, en vez de repetirla por cada assert.
 *
 * Las altas conservan el default abierto para no interrumpir cobros ante una
 * lectura incompleta. Los canales manuales de afiliación e inscripción, en
 * cambio, requieren habilitación explícita: el lanzamiento actual admite
 * únicamente Mercado Pago y el panel puede reabrirlos cuando corresponda.
 */

const ALTA = {
  membership: ['membershipEnabled', 'Las afiliaciones están cerradas temporalmente.', 'MEMBERSHIP_CHECKOUT_DISABLED'],
  registration: ['registrationEnabled', 'Las inscripciones están cerradas temporalmente.', 'REGISTRATION_CHECKOUT_DISABLED'],
  ticket: ['ticketEnabled', 'La venta de entradas está pausada temporalmente.', 'TICKET_CHECKOUT_DISABLED'],
}

const MANUAL = {
  membership: [
    'membershipManualEnabled',
    'La afiliación por transferencia o efectivo está pausada. Podés pagar con Mercado Pago.',
    'MEMBERSHIP_MANUAL_DISABLED',
  ],
  registration: [
    'registrationManualEnabled',
    'La inscripción por transferencia o efectivo está pausada. Podés pagar con Mercado Pago.',
    'REGISTRATION_MANUAL_DISABLED',
  ],
  ticket: [
    'ticketManualEnabled',
    'La compra de entradas por transferencia está pausada. Podés pagar con Mercado Pago.',
    'TICKET_MANUAL_DISABLED',
  ],
}

const VALIDATION = {
  membership: [
    'membershipValidationEnabled',
    'La validación de afiliaciones está pausada desde el panel.',
    'MEMBERSHIP_VALIDATION_DISABLED',
  ],
  registration: [
    'registrationValidationEnabled',
    'La validación de inscripciones está pausada desde el panel.',
    'REGISTRATION_VALIDATION_DISABLED',
  ],
  ticket: [
    'ticketValidationEnabled',
    'La validación de entradas está pausada desde el panel.',
    'TICKET_VALIDATION_DISABLED',
  ],
}

function assertToggle(toggles, table, scope) {
  const entry = table[scope]
  if (!entry) throw new HttpError(500, `Alcance de interruptor desconocido: ${scope}`)
  const [key, message, code] = entry
  if (toggles?.[key] === false) throw new HttpError(409, message, { code })
}

export function assertCheckoutEnabled(toggles) {
  if (toggles?.checkoutEnabled === false) {
    throw new HttpError(409, 'Los cobros están pausados temporalmente.', {
      code: 'CHECKOUT_DISABLED',
    })
  }
}

export function assertMembershipCheckoutEnabled(toggles) {
  assertToggle(toggles, ALTA, 'membership')
}

export function assertRegistrationCheckoutEnabled(toggles) {
  assertToggle(toggles, ALTA, 'registration')
}

export function assertTicketCheckoutEnabled(toggles, env = process.env) {
  if (!isSpectatorTicketSalesLaunched(env)) {
    throw new HttpError(409, 'La venta de entradas para espectadores estará disponible próximamente.', {
      code: 'TICKET_SALES_COMING_SOON',
    })
  }
  assertToggle(toggles, ALTA, 'ticket')
}

/**
 * `scope` es 'membership' | 'registration' | 'ticket'. El combo pasa por los dos
 * primeros: si cualquiera de los dos canales está cerrado no hay combo manual.
 */
export function assertManualChannelEnabled(toggles, scope) {
  const entry = MANUAL[scope]
  if (!entry) throw new HttpError(500, `Alcance de interruptor desconocido: ${scope}`)
  const [key, message, code] = entry
  // Afiliaciones e inscripciones empiezan solamente con Mercado Pago. Las
  // entradas conservan su contrato previo y sólo se cierran explícitamente.
  const enabled = scope === 'ticket' ? toggles?.[key] !== false : toggles?.[key] === true
  if (!enabled) throw new HttpError(409, message, { code })
}

export function assertValidationEnabled(toggles, scope) {
  assertToggle(toggles, VALIDATION, scope)
}

/**
 * Concepto de una orden de atleta -> alcances de validación que la cubren. El
 * combo acredita afiliación e inscripción en la misma transacción, así que
 * alcanza con que uno de los dos esté congelado para no poder aprobarlo.
 */
export function validationScopesForConcept(concept) {
  if (concept === 'combo') return ['membership', 'registration']
  if (concept === 'membership' || concept === 'registration') return [concept]
  return []
}

export function assertConceptValidationEnabled(toggles, concept) {
  for (const scope of validationScopesForConcept(concept)) {
    assertValidationEnabled(toggles, scope)
  }
}

/**
 * Lo que el checkout público necesita saber para no ofrecer un medio de pago que
 * el backend va a rechazar. `checkoutEnabled` es maestro: apagado, todo cierra.
 */
export function resolvePublicCheckoutAvailability(toggles, env = process.env) {
  const checkoutEnabled = toggles?.checkoutEnabled !== false
  const open = (key) => checkoutEnabled && toggles?.[key] !== false
  const ticketLaunched = isSpectatorTicketSalesLaunched(env)
  return {
    membershipEnabled: open('membershipEnabled'),
    registrationEnabled: open('registrationEnabled'),
    ticketEnabled: ticketLaunched && open('ticketEnabled'),
    membershipManualEnabled: open('membershipEnabled') && toggles?.membershipManualEnabled === true,
    registrationManualEnabled: open('registrationEnabled') && toggles?.registrationManualEnabled === true,
    ticketManualEnabled: ticketLaunched && open('ticketEnabled') && toggles?.ticketManualEnabled !== false,
  }
}
