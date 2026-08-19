import { HttpError } from '../../lib/errors.js'

// Política temporal Pitbull 2026. El monto definitivo se calcula sólo en la
// API, antes de inicializar Mercado Pago o entregar una orden manual.
export const PITBULL_PRE_SALE_END = new Date('2026-08-29T03:00:00.000Z')

export function storagePaymentMethod(paymentMethod) {
  return paymentMethod === 'cash_pitbull' || paymentMethod === 'wise_transfer' ? 'manual_link' : paymentMethod
}

export function manualPaymentChannel(paymentMethod) {
  if (paymentMethod === 'cash_pitbull') return 'cash_pitbull'
  if (paymentMethod === 'wise_transfer') return 'wise_transfer'
  if (paymentMethod === 'manual_link') return 'bank_transfer'
  return null
}

/**
 * Transferencia, efectivo y Wise comparten `method = 'manual_link'` y se
 * distinguen por canal: los tres dependen de que alguien valide el cobro a
 * mano. El interruptor que los habilita sí difiere: Wise usa el propio
 * (`wiseEnabled`, ver `assertWiseEnabled`), no `*_manual_enabled`.
 */
export function isManualPaymentMethod(paymentMethod) {
  return manualPaymentChannel(paymentMethod) !== null
}

/**
 * Precio ARS de la promo de preventa Pitbull (transferencia/efectivo). Wise
 * no pasa por acá: tiene su propia moneda y no vence con la preventa (ver
 * `wisePriceFor`), así que mezclar los dos hubiera significado que
 * `checkoutPriceFor` dejara de aplicar después del 29/08 y se llevara el
 * precio de Wise con ella sin que nadie lo hubiera decidido así.
 */
export function checkoutPriceFor({ concept, paymentMethod, now = new Date() }) {
  if (now >= PITBULL_PRE_SALE_END) return null
  const bankTransfer = paymentMethod === 'manual_link'
  const cashAtPitbull = paymentMethod === 'cash_pitbull'
  // La promo de combo vale para los dos canales manuales: transferencia y
  // efectivo en Pitbull. Antes el efectivo pagaba 150000 —la suma sin descuento—
  // y quedaba peor que transferir, sin que nadie lo hubiera decidido así.
  if (concept === 'combo') return bankTransfer || cashAtPitbull ? 120000 : 170000
  if (concept === 'membership' || concept === 'registration') {
    return bankTransfer || cashAtPitbull ? 75000 : 85000
  }
  return null
}

const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i

/**
 * Precio fijo en USD para pagos vía Wise, configurado por variable de
 * entorno (valores reales a cargar antes de habilitar `wise_enabled` en
 * producción — ver `.env.example`). A diferencia de `checkoutPriceFor`, no
 * depende de la ventana de preventa de Pitbull: Wise es un canal permanente.
 *
 * `ticket` devuelve el precio POR ASISTENTE: la orden de entradas admite
 * hasta 8 personas y no hay (todavía) un catálogo de precios en USD por tipo
 * de entrada/addon, así que Wise cobra un monto plano multiplicado por
 * cantidad — quien llama (`server/routes/tickets.js`) hace esa multiplicación.
 */
export function wisePriceFor({ concept }, env = process.env) {
  const key = {
    membership: 'WISE_PRICE_MEMBERSHIP_USD',
    registration: 'WISE_PRICE_REGISTRATION_USD',
    combo: 'WISE_PRICE_COMBO_USD',
    ticket: 'WISE_PRICE_TICKET_USD',
  }[concept]
  if (!key) return null
  const raw = String(env[key] ?? '').trim()
  if (!raw || PLACEHOLDER_PATTERN.test(raw)) {
    throw new HttpError(503, `Falta configurar ${key} para aceptar pagos por Wise.`)
  }
  const amount = Number(raw)
  // `athlete_payment_orders.amount` / `ticket_orders.amount` son `int`
  // (unidades enteras, sin centavos — así están pensadas hoy para ARS). Un
  // precio Wise con decimales rompería el cast en la RPC de entradas.
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(503, `${key} debe ser un monto entero en USD (sin centavos).`)
  }
  return { amount, currency: 'USD' }
}
