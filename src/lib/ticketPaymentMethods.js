import { money } from './format.js'
import { priceForOrder } from '../services/ticketService.js'

/**
 * Precio de cada medio de pago para la compra de entradas en curso — mismo
 * patrón que `buildRegisterPaymentMethods` (registerPaymentMethods.js) para
 * inscripciones/afiliaciones. Se calcula el TOTAL de la orden, no el
 * unitario: con varios asistentes el unitario no es el número que el
 * comprador va a pagar.
 *
 * Wise no entra acá: su monto ya viaja en pesos convertidos, no ARS de
 * catálogo, y `TicketPurchaseSection` ya lo formatea por separado
 * (`wiseLabel`, con `formatWisePrice`).
 * @param {{attendees: object[], pricing: object, addons: object[], locale: string, t: (key:string, vars?:object) => string}} params
 * @returns {Record<'mercado_pago'|'transferencia'|'cash_pitbull', {priceLabel: string, savingsLabel: string|null}>}
 */
export function buildTicketPaymentPriceLabels({ attendees, pricing, addons, locale, t }) {
  const totals = {
    mercado_pago: priceForOrder(attendees, pricing, addons, 'mercado_pago'),
    transferencia: priceForOrder(attendees, pricing, addons, 'transferencia'),
    cash_pitbull: priceForOrder(attendees, pricing, addons, 'cash_pitbull'),
  }

  const savingsLabelFor = (method) => {
    const savings = totals.mercado_pago - totals[method]
    if (savings <= 0) return null
    return t('pages.tickets.paymentSavings', { amount: money(savings, locale) })
  }

  return {
    mercado_pago: { priceLabel: money(totals.mercado_pago, locale), savingsLabel: null },
    transferencia: {
      priceLabel: money(totals.transferencia, locale),
      savingsLabel: savingsLabelFor('transferencia'),
    },
    cash_pitbull: {
      priceLabel: money(totals.cash_pitbull, locale),
      savingsLabel: savingsLabelFor('cash_pitbull'),
    },
  }
}
