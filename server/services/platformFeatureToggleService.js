import { HttpError } from '../lib/errors.js'
import { resolvePaidCheckoutOverride } from '../lib/featureAvailability.js'

function disabledFlag(value) {
  return ['false', '0', 'no'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
}

/**
 * `TICKET_SALES_ENABLED` es freno de emergencia, no la vía operativa: sólo un
 * `false` explícito corta la venta de entradas. Ausente o vacío no opina y el
 * interruptor `ticket` del panel decide.
 *
 * Antes era lo contrario —sin variable, cerrado— y el resultado era un
 * interruptor del panel que se podía prender sin efecto alguno. Un control que
 * miente es peor que no tenerlo: ahora el panel manda y
 * `resolveEnvironmentHolds` avisa cuando una variable está frenando algo.
 */
export function isSpectatorTicketSalesLaunched(env = process.env) {
  const raw = env?.TICKET_SALES_ENABLED ?? env?.ticketSalesEnabled
  if (raw === undefined || raw === null || String(raw).trim() === '') return true
  return !disabledFlag(raw)
}

/**
 * Frenos que vienen del entorno y no del panel. El panel los muestra para que
 * nadie pelee contra un interruptor que está en ON y no tiene efecto.
 */
export function resolveEnvironmentHolds(env = process.env) {
  const holds = []
  if (resolvePaidCheckoutOverride(env) === false) {
    holds.push({ variable: 'PAID_CHECKOUT_ENABLED', scope: 'checkout' })
  }
  if (!isSpectatorTicketSalesLaunched(env)) {
    holds.push({ variable: 'TICKET_SALES_ENABLED', scope: 'ticket' })
  }
  return holds
}

export const PAYMENT_CONCEPTS = Object.freeze(['membership', 'registration', 'ticket'])
export const PAYMENT_CHANNELS = Object.freeze([
  'mercado_pago',
  'bank_transfer',
  'cash_pitbull',
  'wise_transfer',
])
/**
 * Los que dependen de que alguien acredite el cobro a mano. Wise queda
 * afuera a propósito: no comparte interruptor "los dos juntos" con
 * transferencia/efectivo ni el override por cupón — tiene su propia celda,
 * gobernada sólo por sí misma.
 */
export const MANUAL_PAYMENT_CHANNELS = Object.freeze(['bank_transfer', 'cash_pitbull'])

/**
 * Cortes controlados desde el panel, en tres ejes independientes:
 *
 *   - ALTA (`checkout`, `membership`, `registration`, `ticket`): nadie crea una
 *     orden nueva de ese tipo, tenga o no código de tanda.
 *   - CANAL (`paymentChannels[concepto][canal]`): qué medios de pago se ofrecen
 *     para ese concepto. Cada canal se abre y cierra por separado —Mercado Pago
 *     incluido—, así que se puede cobrar sólo por transferencia, sólo en
 *     efectivo, o cerrar la pasarela sin cerrar el concepto. Las órdenes ya
 *     creadas se siguen pudiendo validar.
 *   - VALIDACIÓN (`*_validation`): Finanzas no acredita ni activa nada de ese
 *     concepto, aunque la cuenta tenga el permiso. Sirve para cierre de caja,
 *     auditoría o sospecha de comprobantes falsos, sin tocar roles.
 *
 * Todo esto es independiente de `PAID_CHECKOUT_ENABLED` (freno de emergencia de
 * entorno) y de `registration_access_gates` (tanda con código).
 *
 * Los validadores son sync y reciben el `toggles` ya leído: una ruta que
 * necesita más de uno (el combo exige cuatro) hace una sola consulta a Supabase
 * y la reusa, en vez de repetirla por cada assert.
 *
 * Las altas conservan el default abierto para no interrumpir cobros ante una
 * lectura incompleta. Los canales tienen su propia política por omisión (ver
 * `defaultChannelState`).
 */

const ALTA = {
  membership: [
    'membershipEnabled',
    'Las afiliaciones están cerradas temporalmente.',
    'MEMBERSHIP_CHECKOUT_DISABLED',
  ],
  registration: [
    'registrationEnabled',
    'Las inscripciones están cerradas temporalmente.',
    'REGISTRATION_CHECKOUT_DISABLED',
  ],
  ticket: [
    'ticketEnabled',
    'La venta de entradas está pausada temporalmente.',
    'TICKET_CHECKOUT_DISABLED',
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

const CHANNEL_CODE = {
  mercado_pago: 'MERCADO_PAGO',
  bank_transfer: 'BANK_TRANSFER',
  cash_pitbull: 'CASH_PITBULL',
  wise_transfer: 'WISE_TRANSFER',
}

const CHANNEL_LABEL = {
  mercado_pago: 'Mercado Pago',
  bank_transfer: 'transferencia bancaria',
  cash_pitbull: 'efectivo en Pitbull',
  wise_transfer: 'Wise',
}

const CONCEPT_LABEL = {
  membership: 'la afiliación',
  registration: 'la inscripción',
  ticket: 'las entradas',
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
    throw new HttpError(
      409,
      'La venta de entradas para espectadores estará disponible próximamente.',
      {
        code: 'TICKET_SALES_COMING_SOON',
      },
    )
  }
  assertToggle(toggles, ALTA, 'ticket')
}

/**
 * Política cuando la matriz no trae la celda. Mercado Pago abierto y canales
 * manuales de afiliación e inscripción cerrados: es el estado con el que se
 * lanzó el cobro (20260823100000_mercado_pago_only_membership_registration.sql)
 * y el que preserva la migración de la matriz. Entradas conserva su contrato
 * previo, que sólo se cierra explícitamente.
 */
function defaultChannelState(concept, channel) {
  // Wise no existía antes de esta celda: nace cerrado en los tres conceptos,
  // sin heredar el estado de ningún interruptor previo.
  if (channel === 'wise_transfer') return false
  if (channel === 'mercado_pago') return true
  return concept === 'ticket'
}

/**
 * Estado de una celda, tolerando el contrato anterior.
 *
 * Un `toggles` sin `paymentChannels` puede venir de una lectura vieja o de un
 * doble de test que declara sólo `membershipManualEnabled`. En ese caso el
 * booleano único cubre los dos canales manuales —que es lo que significaba— y
 * Mercado Pago queda abierto, porque en ese contrato no era cerrable.
 */
export function resolveChannelState(toggles, concept, channel) {
  const cell = toggles?.paymentChannels?.[concept]?.[channel]
  if (typeof cell === 'boolean') return cell
  if (channel === 'mercado_pago') return true
  const legacy = toggles?.[`${concept}ManualEnabled`]
  if (typeof legacy === 'boolean') return legacy
  return defaultChannelState(concept, channel)
}

export function openPaymentChannels(toggles, concept) {
  return PAYMENT_CHANNELS.filter((channel) => resolveChannelState(toggles, concept, channel))
}

function channelDisabledMessage(toggles, concept, channel) {
  const remaining = openPaymentChannels(toggles, concept).map((item) => CHANNEL_LABEL[item])
  const head = `El pago con ${CHANNEL_LABEL[channel]} para ${CONCEPT_LABEL[concept]} está pausado.`
  if (remaining.length === 0) return head
  return `${head} Podés pagar con ${remaining.join(' o ')}.`
}

/**
 * `concept` es 'membership' | 'registration' | 'ticket'; `channel`, uno de
 * `PAYMENT_CHANNELS`. El combo pasa por afiliación e inscripción: si el canal
 * está cerrado en cualquiera de los dos, no hay combo por ese medio.
 *
 * `override` lo enciende un cupón puntual (`discount_codes.manual_channels`)
 * para una compra particular: no reemplaza el interruptor general, sólo lo
 * salta para quien tiene el cupón, y únicamente en canales manuales —un cupón
 * no reabre la pasarela que Administración cerró. Queda a cargo de quien llama
 * resolver ese override antes de invocar este assert.
 */
export function assertPaymentChannelEnabled(toggles, concept, channel, { override = false } = {}) {
  if (!PAYMENT_CONCEPTS.includes(concept)) {
    throw new HttpError(500, `Alcance de interruptor desconocido: ${concept}`)
  }
  if (!PAYMENT_CHANNELS.includes(channel)) {
    throw new HttpError(500, `Canal de pago desconocido: ${channel}`)
  }

  if (override && MANUAL_PAYMENT_CHANNELS.includes(channel)) return

  const upper = concept.toUpperCase()
  const open = openPaymentChannels(toggles, concept)
  // Los tres canales cerrados es un estado válido y configurable: equivale a
  // cerrar el alta, pero se informa distinto para que el checkout pueda decir
  // "próximamente" en vez de mostrar un selector vacío.
  if (open.length === 0) {
    throw new HttpError(
      409,
      `No hay medios de pago disponibles para ${CONCEPT_LABEL[concept]} en este momento.`,
      { code: `${upper}_NO_PAYMENT_CHANNEL` },
    )
  }

  if (resolveChannelState(toggles, concept, channel)) return

  // Los dos canales manuales cerrados juntos es exactamente lo que significaba
  // el interruptor `*_manual` anterior: se conserva su código para no romper a
  // quien ya lo distingue.
  if (
    MANUAL_PAYMENT_CHANNELS.includes(channel) &&
    MANUAL_PAYMENT_CHANNELS.every((item) => !resolveChannelState(toggles, concept, item))
  ) {
    throw new HttpError(409, channelDisabledMessage(toggles, concept, channel), {
      code: `${upper}_MANUAL_DISABLED`,
    })
  }

  throw new HttpError(409, channelDisabledMessage(toggles, concept, channel), {
    code: `${upper}_${CHANNEL_CODE[channel]}_DISABLED`,
  })
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
 *
 * `paymentChannels` ya viene cruzado con el maestro y con el alta del concepto,
 * así que la pantalla lee la celda y no tiene que repetir la lógica. Las claves
 * `*ManualEnabled` se conservan derivadas para los lectores del contrato
 * anterior.
 */
export function resolvePublicCheckoutAvailability(toggles, env = process.env) {
  const checkoutEnabled = toggles?.checkoutEnabled !== false
  const ticketLaunched = isSpectatorTicketSalesLaunched(env)
  const intake = {
    membership: checkoutEnabled && toggles?.membershipEnabled !== false,
    registration: checkoutEnabled && toggles?.registrationEnabled !== false,
    ticket: ticketLaunched && checkoutEnabled && toggles?.ticketEnabled !== false,
  }
  const paymentChannels = Object.fromEntries(
    PAYMENT_CONCEPTS.map((concept) => [
      concept,
      Object.fromEntries(
        PAYMENT_CHANNELS.map((channel) => [
          channel,
          intake[concept] && resolveChannelState(toggles, concept, channel),
        ]),
      ),
    ]),
  )
  const manual = (concept) =>
    MANUAL_PAYMENT_CHANNELS.some((channel) => paymentChannels[concept][channel])
  return {
    membershipEnabled: intake.membership,
    registrationEnabled: intake.registration,
    ticketEnabled: intake.ticket,
    membershipManualEnabled: manual('membership'),
    registrationManualEnabled: manual('registration'),
    ticketManualEnabled: manual('ticket'),
    paymentChannels,
  }
}
