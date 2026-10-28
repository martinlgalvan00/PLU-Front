/**
 * Módulos de un evento y política de cuotas — PLU ARG
 *
 * Un evento no siempre vende todo: un seminario no tiene público, una
 * exhibición no inscribe atletas, un meet chico no usa puerta con QR. Cada
 * parte es un módulo que el staff prende o apaga, y cada módulo de venta cobra
 * con sus propios medios (columna de `paymentChannelOverrides`) y su propio
 * tope de cuotas de Mercado Pago.
 *
 * Los módulos que ya tenían un campo propio lo siguen usando: no hay un segundo
 * interruptor para lo mismo (la venta de inscripciones tuvo cinco y se
 * contradecían, ver docs/REGISTRATION_SALES.md).
 *
 * | Módulo         | Campo                                   |
 * |----------------|-----------------------------------------|
 * | registration   | `salesIntent` ('announce' = apagado)    |
 * | tickets        | `pricing.ticketsEnabled`                |
 * | combo          | `rules.modules.combo`                   |
 * | ticketAddons   | `rules.modules.ticketAddons`            |
 * | schedule       | `publicSurface.schedule`                |
 * | door           | `rules.modules.door`                    |
 *
 * `rules.modules` solo guarda lo apagado (`false`): ausente = prendido, así los
 * eventos existentes no cambian. Lo mismo `rules.paymentPolicy`: sin tope
 * guardado decide Mercado Pago.
 *
 * Vive en `shared/` porque lo leen el panel, el checkout y el servidor: que
 * cada lado lo interpretara distinto sería ofrecer algo que después rebota.
 */

export const EVENT_MODULE_KEYS = Object.freeze([
  'registration',
  'tickets',
  'combo',
  'ticketAddons',
  'schedule',
  'door',
])

/** Los que se guardan en `rules.modules` (el resto ya tenía su campo). */
export const STORED_EVENT_MODULES = Object.freeze(['combo', 'ticketAddons', 'door'])

/**
 * Catálogo. `concept` es la columna de medios de cobro que usa (los de
 * operación no cobran); `dependsOn`, el módulo sin el cual no tiene efecto.
 */
export const EVENT_MODULES = Object.freeze([
  { key: 'registration', group: 'sales', concept: 'registration', dependsOn: null },
  { key: 'tickets', group: 'sales', concept: 'ticket', dependsOn: null },
  { key: 'combo', group: 'sales', concept: 'registration', dependsOn: 'registration' },
  { key: 'ticketAddons', group: 'sales', concept: 'ticket', dependsOn: 'tickets' },
  { key: 'schedule', group: 'operation', concept: null, dependsOn: null },
  { key: 'door', group: 'operation', concept: null, dependsOn: null },
])

/** Código del 409 cuando se intenta comprar un módulo apagado. */
export const EVENT_MODULE_DISABLED = 'EVENT_MODULE_DISABLED'

function plainObject(raw) {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

/** `{combo, ticketAddons, door}` siempre completos; sin dato = prendido. */
export function normalizeEventModules(raw) {
  const source = plainObject(raw)
  return Object.fromEntries(STORED_EVENT_MODULES.map((key) => [key, source[key] !== false]))
}

export function eventModulesFromRules(rules) {
  return normalizeEventModules(plainObject(rules).modules)
}

/** Lo que se persiste: solo los apagados. `{}` = todo prendido. */
export function eventModulesForStorage(modules) {
  const normalized = normalizeEventModules(modules)
  return Object.fromEntries(
    STORED_EVENT_MODULES.filter((key) => normalized[key] === false).map((key) => [key, false]),
  )
}

/**
 * ¿Está prendido un módulo guardado en `rules.modules`? Acepta el evento ya
 * mapeado (`event.modules`) o la fila cruda (`event.rules.modules`).
 */
export function isStoredEventModuleOn(event, key) {
  if (!STORED_EVENT_MODULES.includes(key)) return true
  const modules = event?.modules ?? plainObject(event?.rules).modules
  return normalizeEventModules(modules)[key]
}

// ── Cuotas ──────────────────────────────────────────────────────────────────

/** Topes ofrecidos en el panel. 1 = un solo pago. */
export const EVENT_INSTALLMENT_OPTIONS = Object.freeze([1, 3, 6, 9, 12])
export const PAYMENT_POLICY_CONCEPTS = Object.freeze(['registration', 'ticket'])
/** El mismo máximo que acepta la ruta de pagos embebidos. */
export const MAX_INSTALLMENTS = 24

function normalizeCap(raw) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > MAX_INSTALLMENTS) return null
  return value
}

/** `{registration: {maxInstallments}, ticket: {...}}`; `null` = sin tope. */
export function normalizeEventPaymentPolicy(raw) {
  const source = plainObject(raw)
  return Object.fromEntries(
    PAYMENT_POLICY_CONCEPTS.map((concept) => [
      concept,
      { maxInstallments: normalizeCap(plainObject(source[concept]).maxInstallments) },
    ]),
  )
}

export function paymentPolicyFromRules(rules) {
  return normalizeEventPaymentPolicy(plainObject(rules).paymentPolicy)
}

/** Lo que se persiste: solo los conceptos con tope. `{}` = decide Mercado Pago. */
export function paymentPolicyForStorage(policy) {
  const normalized = normalizeEventPaymentPolicy(policy)
  return Object.fromEntries(
    PAYMENT_POLICY_CONCEPTS.filter((concept) => normalized[concept].maxInstallments != null).map(
      (concept) => [concept, { maxInstallments: normalized[concept].maxInstallments }],
    ),
  )
}

/**
 * Tope de cuotas de un concepto, o `null`. Acepta el evento mapeado
 * (`event.paymentPolicy`) o la fila cruda (`event.rules.paymentPolicy`).
 */
export function maxInstallmentsFor(event, concept) {
  const policy = event?.paymentPolicy ?? plainObject(event?.rules).paymentPolicy
  return normalizeEventPaymentPolicy(policy)[concept]?.maxInstallments ?? null
}

/** ¿El evento acepta pagar en `installments` cuotas este concepto? */
export function eventAcceptsInstallments(event, concept, installments) {
  const cap = maxInstallmentsFor(event, concept)
  const requested = Number(installments ?? 1)
  if (!Number.isFinite(requested) || requested < 1) return false
  return cap == null || requested <= cap
}

// ── Lectura para el panel ───────────────────────────────────────────────────

/** Valor crudo de cada módulo, sin mirar dependencias. */
function moduleValue(event, key) {
  switch (key) {
    case 'registration':
      return (event?.salesIntent ?? event?.rules?.salesIntent) !== 'announce'
    case 'tickets':
      return event?.pricing?.ticketsEnabled === true
    case 'schedule':
      return event?.publicSurface?.schedule !== false
    default:
      return isStoredEventModuleOn(event, key)
  }
}

/**
 * Estado de cada módulo para el tablero: `on` es lo que eligió el staff;
 * `active`, si tiene efecto (un combo prendido no vende con las inscripciones
 * apagadas). `blockedBy` dice qué módulo lo deja sin efecto.
 */
export function resolveEventModules(event) {
  const values = Object.fromEntries(EVENT_MODULE_KEYS.map((key) => [key, moduleValue(event, key)]))
  return EVENT_MODULES.map((module) => {
    const on = values[module.key]
    const blockedBy = on && module.dependsOn && !values[module.dependsOn] ? module.dependsOn : null
    return { ...module, on, active: on && !blockedBy, blockedBy }
  })
}
