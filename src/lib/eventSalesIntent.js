/** Cobrar (default) o solo anunciar sin abrir ventas todavía. */
export const EVENT_SALES_INTENTS = ['charge', 'announce']

/**
 * @param {unknown} value
 * @returns {'charge'|'announce'}
 */
export function normalizeSalesIntent(value) {
  return value === 'announce' ? 'announce' : 'charge'
}
