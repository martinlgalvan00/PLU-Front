import { useEffect, useMemo, useState } from 'react'
import { BarChart3, TicketCheck } from 'lucide-react'
import AdminEmptyState from './AdminEmptyState.jsx'
import AnalyticsStatTile from './AnalyticsStatTile.jsx'
import TicketSalesTrendChart from './TicketSalesTrendChart.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import LoadingState from '../ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { fetchTicketSalesSummary } from '../../services/ticketSalesAnalyticsService.js'

const CHANNEL_LABEL_KEYS = {
  mercado_pago: 'formOptions.payment.mercadoPago',
  bank_transfer: 'admin.ticketOrders.manualSale.transfer',
  cash_pitbull: 'formOptions.payment.cashPitbull',
  wise_transfer: 'formOptions.payment.wiseTransfer',
}

/**
 * Barras horizontales relativas al máximo del grupo. Duplicado a propósito
 * de `RelativeBarList` (interno de `AnalyticsSection.jsx`, no exportado):
 * son ~20 líneas de JSX, y extraerlo implicaba tocar ese archivo -- que no
 * tiene nada que ver con ventas de entradas -- sólo para reusar un
 * presentacional. Comparte las mismas clases CSS (`admin-analytics__bar-*`),
 * así que no duplica estilos, sólo el markup.
 */
function RelativeBarList({ items, getKey, getLabel, getWeight, renderValue, mono = false }) {
  if (!items?.length) return null
  const max = Math.max(...items.map((item) => Number(getWeight(item) ?? 0)), 1)

  return (
    <ul className="admin-analytics__bar-list">
      {items.map((item) => {
        const weight = Number(getWeight(item) ?? 0)
        return (
          <li key={getKey(item)}>
            <div className="admin-analytics__bar-list-head">
              <span
                className={`admin-analytics__bar-list-label${mono ? ' admin-analytics__bar-list-label--mono' : ''}`}
              >
                {getLabel(item)}
              </span>
              <strong className="admin-analytics__bar-list-value">{renderValue(item)}</strong>
            </div>
            <div className="admin-analytics__bar-list-track" aria-hidden>
              <span className="admin-analytics__bar-list-fill" style={{ '--bar-fill': weight / max }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * `fetchSummary` es inyectable (default: el servicio real) para que
 * Storybook pueda fijar distintos fixtures sin backend -- mismo patrón que
 * `onGetReport` en `AdminEventScanReportSection.jsx`.
 */
export default function TicketSalesAnalyticsPanel({ events = [], fetchSummary = fetchTicketSalesSummary }) {
  const { locale, t } = useI18n()
  const [eventSlug, setEventSlug] = useState('')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const ticketableEvents = useMemo(
    () => events.filter((event) => (event.ticketTypes?.length ?? 0) > 0),
    [events],
  )

  useEffect(() => {
    if (!eventSlug && ticketableEvents.length > 0) {
      setEventSlug(ticketableEvents[0].slug)
    }
  }, [eventSlug, ticketableEvents])

  useEffect(() => {
    let active = true
    if (!eventSlug) {
      setSummary(null)
      return undefined
    }
    setLoading(true)
    setError(null)
    fetchSummary(eventSlug)
      .then((data) => {
        if (active) setSummary(data)
      })
      .catch((err) => {
        if (active) setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [eventSlug, fetchSummary, reloadKey])

  const capacity = summary?.capacity ?? null
  const revenue = summary?.revenue ?? null
  const daily = summary?.daily ?? []

  const arsRevenue = revenue?.byCurrency?.find((row) => row.currency === 'ARS') ?? null
  const otherRevenue = revenue?.byCurrency?.filter((row) => row.currency !== 'ARS') ?? []

  const channelRows = useMemo(
    () =>
      (revenue?.byChannel ?? [])
        .filter((row) => row.currency === 'ARS')
        .sort((left, right) => right.amount - left.amount),
    [revenue],
  )

  return (
    <section className="admin-ticket-sales-analytics" aria-labelledby="admin-ticket-sales-analytics-title">
      <header className="admin-analytics__block-head admin-ticket-sales-analytics__head">
        <h3 id="admin-ticket-sales-analytics-title">
          <BarChart3 size={16} aria-hidden /> {t('admin.ticketSalesAnalysis.title')}
        </h3>
        <p className="admin-analytics__block-subtitle">{t('admin.ticketSalesAnalysis.subtitle')}</p>
      </header>

      {ticketableEvents.length === 0 ? (
        <AdminEmptyState
          icon={TicketCheck}
          title={t('admin.ticketSalesAnalysis.emptyEventsTitle')}
          lead={t('admin.ticketSalesAnalysis.emptyEventsLead')}
        />
      ) : (
        <>
          <label className="admin-ticket-sales-analytics__event-field">
            <span>{t('admin.ticketSalesAnalysis.event')}</span>
            <select value={eventSlug} onChange={(event) => setEventSlug(event.target.value)}>
              {ticketableEvents.map((event) => (
                <option key={event.slug} value={event.slug}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>

          {loading ? (
            <LoadingState label={t('admin.ticketSalesAnalysis.loading')} />
          ) : error ? (
            <ErrorState
              message={error.message ?? t('admin.ticketSalesAnalysis.loadError')}
              onRetry={() => setReloadKey((key) => key + 1)}
              retryLabel={t('common.retry')}
            />
          ) : !capacity?.totals.reserved && !capacity?.totals.sold ? (
            <AdminEmptyState
              icon={TicketCheck}
              title={t('admin.ticketSalesAnalysis.emptySalesTitle')}
              lead={t('admin.ticketSalesAnalysis.emptySalesLead')}
            />
          ) : (
            <>
              <div className="admin-analytics__stat-grid">
                <AnalyticsStatTile
                  label={t('admin.ticketSalesAnalysis.statSold')}
                  value={capacity.totals.sold}
                  tone="celeste"
                />
                <AnalyticsStatTile
                  label={t('admin.ticketSalesAnalysis.statPending')}
                  value={capacity.totals.pending}
                  tone="gold"
                />
                <AnalyticsStatTile
                  label={t('admin.ticketSalesAnalysis.statRemaining')}
                  value={capacity.totals.remaining ?? t('admin.ticketSalesAnalysis.noLimit')}
                  tone="default"
                />
                <AnalyticsStatTile
                  label={t('admin.ticketSalesAnalysis.statRevenue')}
                  value={money(arsRevenue?.amount ?? 0, locale, 'ARS')}
                  hint={t('admin.ticketSalesAnalysis.revenueHint')}
                  tone="default"
                />
              </div>

              {otherRevenue.length > 0 ? (
                <div className="admin-analytics__stat-grid admin-analytics__stat-grid--secondary">
                  {otherRevenue.map((row) => (
                    <AnalyticsStatTile
                      key={row.currency}
                      label={t('admin.ticketSalesAnalysis.statRevenueOther', { currency: row.currency })}
                      value={money(row.amount, locale, row.currency)}
                      compact
                      tone="default"
                    />
                  ))}
                </div>
              ) : null}

              <div className="admin-ticket-sales-analytics__grid">
                <section className="admin-analytics__block">
                  <h4>{t('admin.ticketSalesAnalysis.byType')}</h4>
                  <RelativeBarList
                    items={capacity.byType}
                    getKey={(row) => row.ticketTypeId}
                    getLabel={(row) => row.name}
                    getWeight={(row) => row.sold}
                    renderValue={(row) =>
                      row.quota != null ? `${row.sold} / ${row.quota}` : String(row.sold)
                    }
                  />
                </section>

                <section className="admin-analytics__block">
                  <h4>{t('admin.ticketSalesAnalysis.byChannel')}</h4>
                  <RelativeBarList
                    items={channelRows}
                    getKey={(row) => row.key}
                    getLabel={(row) => t(CHANNEL_LABEL_KEYS[row.key] ?? row.key)}
                    getWeight={(row) => row.amount}
                    renderValue={(row) => money(row.amount, locale, 'ARS')}
                  />
                </section>
              </div>

              <section className="admin-analytics__block">
                <h4>{t('admin.ticketSalesAnalysis.trendTitle')}</h4>
                <TicketSalesTrendChart series={daily} />
              </section>
            </>
          )}
        </>
      )}
    </section>
  )
}
