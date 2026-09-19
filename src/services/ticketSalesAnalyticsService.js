import { apiGet } from '../lib/api.js'

/**
 * ticketSalesAnalyticsService.js — PLU ARG
 *
 * KPIs de ventas de entradas para el tab "Análisis" de Pagos. Todo llega
 * agregado desde el backend (`server/modules/ticketing/ticketSalesAggregation.js`);
 * esta capa sólo arma la URL, igual que `analyticsReportService.js`.
 */
export async function fetchTicketSalesSummary(eventSlug, { days = 30 } = {}) {
  const params = new URLSearchParams({ days: String(days) })
  return apiGet(`/api/tickets/sales-summary/${encodeURIComponent(eventSlug)}?${params.toString()}`)
}
