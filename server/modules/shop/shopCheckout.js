import { HttpError } from '../../lib/errors.js'
import { getPaymentsRuntimeStatus } from '../payments/createPaymentProviderAdapter.js'
import { resolveBankTransferDetails } from '../payments/eventPaymentProfile.js'

export const SHOP_PAYMENT_METHODS = Object.freeze(['mercado_pago', 'bank_transfer', 'cash_on_site'])

/**
 * Cuánto se reserva el stock de un pedido sin pagar, según el medio. Mercado
 * Pago es inmediato; la transferencia necesita tiempo de acreditación; el
 * efectivo espera a que la persona pase por el lugar.
 */
export const SHOP_HOLD_MINUTES = Object.freeze({
  mercado_pago: 2 * 60,
  bank_transfer: 48 * 60,
  cash_on_site: 72 * 60,
})

export const SHOP_NOTIFICATION_PATH = '/api/shop/webhook/mercadopago'

export const DEFAULT_SHOP_SETTINGS = Object.freeze({
  mercadoPagoEnabled: true,
  bankTransferEnabled: false,
  cashEnabled: true,
  mercadoPagoProfileId: null,
  bankTransferProfileId: null,
  cashInstructions: '',
  fulfillmentNote: '',
})

/** snake_case de la tabla -> camelCase del dominio. */
export function mapShopSettingsRow(row) {
  if (!row) return { ...DEFAULT_SHOP_SETTINGS }
  return {
    mercadoPagoEnabled: row.mercado_pago_enabled !== false,
    bankTransferEnabled: row.bank_transfer_enabled === true,
    cashEnabled: row.cash_enabled !== false,
    mercadoPagoProfileId: row.mercado_pago_profile_id ?? null,
    bankTransferProfileId: row.bank_transfer_profile_id ?? null,
    cashInstructions: row.cash_instructions ?? '',
    fulfillmentNote: row.fulfillment_note ?? '',
  }
}

/**
 * ¿Hay con qué cobrar por Mercado Pago? Con cuenta propia elegida para la
 * tienda alcanza; sin ella hace falta el runtime global listo (o el mock en
 * desarrollo).
 */
export function isMercadoPagoUsable(settings, env = process.env) {
  if (settings.mercadoPagoProfileId) return true
  try {
    // `getPaymentsRuntimeStatus` ya contempla el proveedor mock de desarrollo.
    return getPaymentsRuntimeStatus(env).ready
  } catch {
    return false
  }
}

/**
 * Alias / CBU / titular a los que transferir. Sale del perfil bancario elegido
 * para la tienda o, si no hay, del entorno (misma jerarquía que las entradas).
 */
export function resolveShopBankDetails(settings, bankProfile, env = process.env) {
  return resolveBankTransferDetails(null, env, bankProfile ?? null)
}

/**
 * Medios que la tienda ofrece HOY. Es la única fuente de verdad: la pantalla
 * pública lee esto para no mostrar un medio que el servidor va a rechazar, y
 * la creación del pedido lo vuelve a consultar antes de reservar stock.
 */
export function resolveShopCheckoutOptions({
  settings,
  toggles,
  bankProfile = null,
  env = process.env,
}) {
  const masterOpen = toggles?.checkoutEnabled !== false
  const bank = resolveShopBankDetails(settings, bankProfile, env)
  const methods = {
    mercado_pago: masterOpen && settings.mercadoPagoEnabled && isMercadoPagoUsable(settings, env),
    // Sin destino de cobro (alias o CBU) no se ofrece transferencia.
    bank_transfer: masterOpen && settings.bankTransferEnabled && Boolean(bank.alias || bank.cbu),
    cash_on_site: masterOpen && settings.cashEnabled,
  }
  return {
    open: masterOpen && Object.values(methods).some(Boolean),
    methods,
    cashInstructions: settings.cashInstructions,
    fulfillmentNote: settings.fulfillmentNote,
    bankDetails: methods.bank_transfer ? bank : null,
  }
}

export function assertShopMethodOpen(options, method) {
  if (!SHOP_PAYMENT_METHODS.includes(method)) {
    throw new HttpError(400, 'Medio de pago inválido.')
  }
  if (!options.open) {
    throw new HttpError(409, 'La tienda no está cobrando en este momento.', {
      code: 'SHOP_CHECKOUT_CLOSED',
    })
  }
  if (!options.methods[method]) {
    throw new HttpError(409, 'Ese medio de pago no está disponible en la tienda ahora.', {
      code: 'SHOP_METHOD_DISABLED',
    })
  }
}

/**
 * Lo que el comprador ve de su pedido: sin datos de otras personas ni rutas
 * internas. Para transferencia agrega a dónde pagar; para efectivo, dónde.
 */
export function toBuyerOrderView(order, options) {
  const view = { ...order }
  delete view.buyerNote
  view.payment = {
    method: order.paymentMethod,
    bankDetails:
      order.paymentMethod === 'bank_transfer' && order.status === 'pendiente'
        ? (options?.bankDetails ?? null)
        : null,
    cashInstructions:
      order.paymentMethod === 'cash_on_site' ? (options?.cashInstructions ?? '') : '',
    fulfillmentNote: options?.fulfillmentNote ?? '',
  }
  return view
}

/**
 * Un pago de Mercado Pago solo se acredita si es DE ESTE pedido: misma
 * referencia externa, mismo monto y misma moneda. Lo que diga el navegador o
 * la URL de retorno no cuenta; esto se compara contra la respuesta de la API.
 */
export function assertShopPaymentMatchesOrder(payment, order) {
  if (String(payment?.external_reference ?? '') !== String(order.id)) {
    throw new HttpError(409, 'El pago no corresponde a este pedido.', {
      code: 'SHOP_PAYMENT_MISMATCH',
    })
  }
  if (Number(payment?.transaction_amount) !== Number(order.amount)) {
    throw new HttpError(409, 'El monto del pago no coincide con el pedido.', {
      code: 'SHOP_PAYMENT_AMOUNT_MISMATCH',
    })
  }
  const currency = String(payment?.currency_id ?? order.currency).toUpperCase()
  if (currency !== String(order.currency).toUpperCase()) {
    throw new HttpError(409, 'La moneda del pago no coincide con el pedido.', {
      code: 'SHOP_PAYMENT_CURRENCY_MISMATCH',
    })
  }
}
