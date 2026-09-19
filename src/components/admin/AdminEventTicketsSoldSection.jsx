import { useEffect, useMemo, useState } from 'react'
import { Ticket } from 'lucide-react'
import AdminDataTable, { StatusBadge } from './AdminDataTable.jsx'
import AdminEmptyState from './AdminEmptyState.jsx'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ExportButton from '../ui/ExportButton.jsx'
import TableSkeleton from '../ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { createCsv } from '../../services/exportService.js'
import { listTicketsForEvent } from '../../services/ticketApi.js'

const STATUS_FILTERS = [
  ['all', 'admin.eventTicketsSold.statusAll'],
  ['pagada', 'admin.eventTicketsSold.statusPaid'],
  ['pendiente_pago', 'admin.eventTicketsSold.statusPending'],
  ['cancelada', 'admin.eventTicketsSold.statusCancelled'],
]

/**
 * Mismo criterio que `channelLabel` en `TicketOrdersSection.jsx` -- ~10
 * líneas, se duplica en vez de extraerla: la orden acá viaja embebida en el
 * ticket (`ticket.order`), no como fila propia, así que no comparten forma
 * de entrada.
 */
function channelLabel(order, t) {
  if (!order) return null
  if (order.manualPaymentChannel === 'wise_transfer') return t('admin.ticketOrders.channelWise')
  if (order.manualPaymentChannel === 'cash_pitbull') return t('admin.ticketOrders.channelCash')
  if (order.manualPaymentChannel === 'bank_transfer') return t('admin.ticketOrders.channelBankTransfer')
  if (order.provider === 'mercado_pago') return t('admin.ticketOrders.channelMercadoPago')
  if (order.provider === 'manual') return t('admin.ticketOrders.channelBankTransfer')
  return null
}

function formatDate(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Entradas individuales vendidas de un evento -- separado del scanner de
 * Check-in (que mezcla inscripciones de atletas) y del catálogo de tipos
 * (que edita precio/cupo, no lista ventas). Hace su propio fetch: el array
 * `tickets` global de `useAppData` no está filtrado por evento y puede
 * estar vacío si nadie abrió Check-in para este evento en la sesión.
 *
 * `fetchTickets` inyectable (default: el servicio real) para Storybook,
 * mismo patrón que `TicketSalesAnalyticsPanel`.
 */
export default function AdminEventTicketsSoldSection({ event, fetchTickets = listTicketsForEvent }) {
  const { locale, t } = useI18n()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState('all')
  const [ticketType, setTicketType] = useState('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    if (!event?.slug) return undefined
    setLoading(true)
    setError(null)
    fetchTickets(event.slug)
      .then(({ tickets: rows }) => {
        if (active) setTickets(rows ?? [])
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
  }, [event?.slug, fetchTickets, reloadKey])

  const typeOptions = useMemo(() => {
    const seen = new Map()
    tickets.forEach((ticket) => {
      if (ticket.ticketTypeId && !seen.has(ticket.ticketTypeId)) {
        seen.set(ticket.ticketTypeId, ticket.ticketTypeName ?? ticket.ticketTypeId)
      }
    })
    return [
      ['all', t('admin.eventTicketsSold.typeAll'), tickets.length],
      ...[...seen].map(([id, name]) => [
        id,
        name,
        tickets.filter((ticket) => ticket.ticketTypeId === id).length,
      ]),
    ]
  }, [t, tickets])

  const statusCounts = useMemo(() => {
    const counts = { all: tickets.length, pagada: 0, pendiente_pago: 0, cancelada: 0 }
    tickets.forEach((ticket) => {
      counts[ticket.status] = (counts[ticket.status] ?? 0) + 1
    })
    return counts
  }, [tickets])

  const facetedTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        if (status !== 'all' && ticket.status !== status) return false
        if (ticketType !== 'all' && ticket.ticketTypeId !== ticketType) return false
        return true
      }),
    [tickets, status, ticketType],
  )

  const allRows = useMemo(
    () =>
      facetedTickets.map((ticket) => ({
        id: ticket.id,
        attendee: ticket.attendeeName,
        dni: ticket.attendeeDni,
        ticketCode: ticket.ticketCode,
        ticketType:
          ticket.credentialLabel && ticket.credentialLabel !== ticket.ticketTypeName
            ? `${ticket.ticketTypeName ?? '—'} · ${ticket.credentialLabel}`
            : (ticket.ticketTypeName ?? '—'),
        price: money(ticket.unitPrice, locale),
        channel: channelLabel(ticket.order, t) ?? '—',
        status: ticket.status,
        buyer: ticket.order?.buyerName || ticket.order?.buyerEmail || '—',
        reference: ticket.order?.reference ?? '—',
        checkInAt: ticket.checkIn?.scannedAt ? formatDate(ticket.checkIn.scannedAt, locale) : null,
      })),
    [facetedTickets, locale, t],
  )

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return allRows
    return allRows.filter((row) =>
      [row.attendee, row.dni, row.reference, row.buyer].some((field) =>
        field?.toLowerCase().includes(normalized),
      ),
    )
  }, [allRows, query])

  const narrowingFilters = status !== 'all' || ticketType !== 'all' || Boolean(query.trim())

  function exportCsv() {
    if (!rows.length) return
    const body = rows.map((row) => ({
      [t('admin.eventTicketsSold.colAttendee')]: row.attendee,
      [t('admin.eventTicketsSold.colDni')]: row.dni,
      [t('admin.eventTicketsSold.colCode')]: row.ticketCode,
      [t('admin.eventTicketsSold.colType')]: row.ticketType,
      [t('admin.eventTicketsSold.colPrice')]: row.price,
      [t('admin.eventTicketsSold.colChannel')]: row.channel,
      [t('admin.eventTicketsSold.colStatus')]: row.status,
      [t('admin.eventTicketsSold.colBuyer')]: row.buyer,
      [t('admin.eventTicketsSold.colReference')]: row.reference,
      [t('admin.eventTicketsSold.colCheckIn')]: row.checkInAt ?? '—',
    }))
    createCsv(`entradas-${event.slug}.csv`, body)
  }

  return (
    <section className="admin-orders-block" aria-labelledby="admin-event-tickets-sold-title">
      <header className="admin-orders-block__header">
        <div>
          <span className="admin-orders-block__eyebrow">{t('admin.eventTicketsSold.eyebrow')}</span>
          <h3 id="admin-event-tickets-sold-title" className="admin-orders-block__title">
            {t('admin.eventTicketsSold.title')}
          </h3>
          <p className="admin-orders-block__lead">{t('admin.eventTicketsSold.subtitle')}</p>
        </div>
      </header>

      <div className="admin-orders-block__toolbar">
        <div className="admin-orders-block__toolbar-primary">
          <AdminFilterSearch
            placeholder={t('admin.eventTicketsSold.search')}
            query={query}
            onQueryChange={setQuery}
          />
          <div className="admin-orders-block__actions">
            <ExportButton
              label={t('admin.eventTicketsSold.exportCsv')}
              onClick={exportCsv}
              disabled={loading || rows.length === 0}
            />
          </div>
        </div>
        <div className="admin-orders-block__toolbar-facets">
          <AdminFilterChipGroup
            id="event-tickets-sold-status"
            ariaLabel={t('admin.filters.status')}
            value={status}
            onChange={setStatus}
            compact
            defaultValue="all"
            clearable
            hideEmpty
            options={STATUS_FILTERS.map(([value, key]) => [value, t(key), statusCounts[value] ?? 0])}
          />
          <AdminFilterChipGroup
            id="event-tickets-sold-type"
            ariaLabel={t('admin.eventTicketsSold.typeLabel')}
            value={ticketType}
            onChange={setTicketType}
            compact
            defaultValue="all"
            clearable
            hideEmpty
            options={typeOptions}
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={7} label={t('admin.eventTicketsSold.loading')} />
      ) : error ? (
        <ErrorState
          message={error.message ?? t('admin.eventTicketsSold.loadError')}
          onRetry={() => setReloadKey((key) => key + 1)}
          retryLabel={t('common.retry')}
        />
      ) : rows.length === 0 && narrowingFilters ? (
        <AdminEmptyState
          filtered
          icon={Ticket}
          title={t('admin.eventTicketsSold.emptyFiltered')}
          actionLabel={t('admin.eventTicketsSold.clearFilters')}
          onAction={() => {
            setStatus('all')
            setTicketType('all')
            setQuery('')
          }}
        />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          icon={Ticket}
          title={t('admin.eventTicketsSold.emptyTitle')}
          lead={t('admin.eventTicketsSold.emptyLead')}
        />
      ) : (
        <AdminDataTable
          columns={[
            { key: 'attendee', label: t('admin.columns.attendee'), mobile: 'primary', sortable: true },
            { key: 'dni', label: t('admin.eventTicketsSold.colDni'), mobile: 'hidden', sortable: true },
            { key: 'ticketType', label: t('admin.eventTicketsSold.colType'), mobile: 'default', sortable: true },
            {
              key: 'price',
              label: t('admin.eventTicketsSold.colPrice'),
              mobile: 'default',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            { key: 'channel', label: t('admin.columns.method'), mobile: 'hidden', sortable: true },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              sortable: true,
              render: (row) => <StatusBadge value={row.status} />,
            },
            { key: 'buyer', label: t('admin.eventTicketsSold.colBuyer'), mobile: 'hidden', sortable: true },
            {
              key: 'checkInAt',
              label: t('admin.eventTicketsSold.colCheckIn'),
              mobile: 'hidden',
              render: (row) => row.checkInAt ?? t('admin.eventTicketsSold.notCheckedIn'),
            },
          ]}
          rows={rows}
          emptyMessage={t('admin.eventTicketsSold.emptyFiltered')}
        />
      )}
    </section>
  )
}
