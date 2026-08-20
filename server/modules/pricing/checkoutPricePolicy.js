import { HttpError } from '../../lib/errors.js'

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
 * mano. El interruptor de plataforma, en cambio, ya los controla por
 * separado (`platform_payment_channels`), así que esto sólo dice si el
 * cobro necesita validación humana — no si está habilitado.
 */
export function isManualPaymentMethod(paymentMethod) {
  return manualPaymentChannel(paymentMethod) !== null
}

/**
 * Medio de pago elegido -> celda de la matriz de canales. Mercado Pago es el
 * caso restante: ya no por ser incondicional, sino porque es el único canal no
 * manual del checkout.
 */
export function paymentChannelOf(paymentMethod) {
  return manualPaymentChannel(paymentMethod) ?? 'mercado_pago'
}

const PLACEHOLDER_PATTERN = /^(?:replace|changeme|placeholder|your[_-]|xxx|test-x{4}$)/i

/**
 * Precio fijo en USD para pagos vía Wise, configurado por variable de
 * entorno (valores reales a cargar antes de abrir el canal `wise_transfer`
 * desde Administración — ver `.env.example`). No pasa por
 * `resolve_channel_price` (SQL) ni tiene equivalente `manual_price` en el
 * catálogo ARS: es un importe y una moneda aparte, calculados sólo acá.
 *
 * `ticket` devuelve el precio POR ASISTENTE: la orden de entradas admite
 * hasta 8 personas y no hay catálogo de precios en USD por tipo de
 * entrada/addon, así que Wise cobra un monto plano multiplicado por
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
  // (unidades enteras, sin centavos). Un precio Wise con decimales rompería
  // el cast en la RPC de entradas.
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(503, `${key} debe ser un monto entero en USD (sin centavos).`)
  }
  return { amount, currency: 'USD' }
}
