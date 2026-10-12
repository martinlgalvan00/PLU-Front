import { useEffect, useMemo, useState } from 'react'
import { QrCode, Ticket } from 'lucide-react'
import AdminDataTable, { StatusBadge } from './AdminDataTable.jsx'
import AdminEmptyState from './AdminEmptyState.jsx'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import AdminTicketQrPanel from './AdminTicketQrPanel.jsx'
import TicketAccessOverrideDialog from './TicketAccessOverrideDialog.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import ExportButton from '../ui/ExportButton.jsx'
import TableSkeleton from '../ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { ticketTypeNameParts } from '../../lib/eventPricing.js'
import { summarizeSoldTickets } from '../../lib/ticketAdmission.js'
import { createCsv } from '../../services/exportService.js'
import { listTicketsForEvent } from '../../services/ticketApi.js'
// El bloque `admin-orders-block` (cabecera, buscador, filtros) vive en la hoja de
// Cobros, que solo carga esa ruta: sin este import, "Vendidas" salía sin estilos.
import '../../styles/pages/admin-payments.css'
import '../../styles/pages/admin-event-tickets.css'

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
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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
export default function AdminEventTicketsSoldSection({
  canOverride = false,
  event,
  fetchTickets = listTicketsForEvent,
  onSetTicketAccessOverride,
}) {
  const { locale, t } = useI18n()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState('all')
  const [ticketType, setTicketType] = useState('all')
  const [query, setQuery] = useState('')
  const [qrTicketId, setQrTicketId] = useState(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideBusy, setOverrideBusy] = useState(false)
  const [overrideError, setOverrideError] = useState('')

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
        seen.set(
          ticket.ticketTypeId,
          ticketTypeNameParts(ticket.ticketTypeName, locale).title || ticket.ticketTypeId,
        )
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
  }, [locale, t, tickets])

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
            ? `${ticketTypeNameParts(ticket.ticketTypeName, locale).title || '—'} · ${ticket.credentialLabel}`
            : ticketTypeNameParts(ticket.ticketTypeName, locale).title || '—',
        typeTitle: ticketTypeNameParts(ticket.ticketTypeName, locale).title || '—',
        credential:
          ticket.credentialLabel && ticket.credentialLabel !== ticket.ticketTypeName
            ? ticket.credentialLabel
            : null,
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
  const summary = useMemo(() => summarizeSoldTickets(tickets), [tickets])
  const qrTicket = qrTicketId ? tickets.find((ticket) => ticket.id === qrTicketId) : null
  const canOfferOverride = canOverride && Boolean(onSetTicketAccessOverride)

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

  function closeQr() {
    setQrTicketId(null)
    setOverrideOpen(false)
    setOverrideError('')
  }

  // La excepción pisa la vigencia de esa entrada: se refleja en la fila sin
  // recargar la lista (la respuesta no trae comprador ni ingreso, así que sólo
  // se mezclan los campos de vigencia).
  async function handleConfirmOverride(payload) {
    if (!qrTicket) return
    setOverrideBusy(true)
    setOverrideError('')
    try {
      const updated = await onSetTicketAccessOverride(qrTicket.id, payload)
      if (updated) {
        setTickets((current) =>
          current.map((item) =>
            item.id === qrTicket.id
              ? {
                  ...item,
                  validFrom: updated.validFrom ?? null,
                  validUntil: updated.validUntil ?? null,
                  validityStatus: updated.validityStatus ?? item.validityStatus,
                }
              : item,
          ),
        )
      }
      setOverrideOpen(false)
    } catch (err) {
      setOverrideError(
        err?.message ?? t('admin.eventEditor.security.scanReport.accessOverride.error'),
      )
    } finally {
      setOverrideBusy(false)
    }
  }

  const stats = [
    ['issued', summary.issued],
    ['paid', summary.paid],
    ['checkedIn', summary.checkedIn],
    ['pending', summary.pending],
  ]

  return (
    <section
      className="admin-orders-block sold-tickets"
      aria-labelledby="admin-event-tickets-sold-title"
    >
      <header className="admin-orders-block__header sold-tickets__header">
        <div>
          <h3 id="admin-event-tickets-sold-title" className="admin-orders-block__title">
            {t('admin.eventTicketsSold.title')}
          </h3>
          <p className="admin-orders-block__lead">{t('admin.eventTicketsSold.subtitle')}</p>
        </div>
        <ExportButton
          label={t('admin.eventTicketsSold.exportCsv')}
          onClick={exportCsv}
          disabled={loading || rows.length === 0}
        />
      </header>

      {!loading && !error && tickets.length > 0 ? (
        <dl className="sold-tickets__stats" aria-label={t('admin.eventTicketsSold.statsLabel')}>
          {stats.map(([key, value]) => (
            <div key={key}>
              <dd>{value}</dd>
              <dt>{t(`admin.eventTicketsSold.stat.${key}`)}</dt>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="admin-orders-block__toolbar sold-tickets__toolbar">
        <div className="admin-orders-block__toolbar-primary">
          <AdminFilterSearch
            placeholder={t('admin.eventTicketsSold.search')}
            query={query}
            onQueryChange={setQuery}
          />
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
            options={STATUS_FILTERS.map(([value, key]) => [
              value,
              t(key),
              statusCounts[value] ?? 0,
            ])}
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
        <TableSkeleton rows={6} columns={5} label={t('admin.eventTicketsSold.loading')} />
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
          density="compact"
          onRowClick={(row) => setQrTicketId(row.id)}
          columns={[
            {
              key: 'attendee',
              label: t('admin.columns.attendee'),
              mobile: 'primary',
              sortable: true,
              render: (row) => (
                <span className="sold-tickets__cell">
                  <strong>{row.attendee}</strong>
                  {row.dni ? <small>{row.dni}</small> : null}
                </span>
              ),
            },
            {
              key: 'ticketType',
              label: t('admin.eventTicketsSold.colEntry'),
              mobile: 'default',
              sortable: true,
              render: (row) => (
                <span className="sold-tickets__cell">
                  <strong>{row.typeTitle}</strong>
                  {row.credential ? <small>{row.credential}</small> : null}
                </span>
              ),
            },
            {
              key: 'price',
              label: t('admin.eventTicketsSold.colPrice'),
              mobile: 'default',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              sortable: true,
              render: (row) => (
                <span className="sold-tickets__cell">
                  <StatusBadge value={row.status} />
                  {row.status === 'pagada' ? (
                    <small>
                      {row.checkInAt
                        ? t('admin.eventTicketsSold.checkedInAt', { time: row.checkInAt })
                        : t('admin.eventTicketsSold.notCheckedIn')}
                    </small>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'actions',
              label: t('admin.eventTicketsSold.qr.column'),
              mobile: 'action',
              width: 64,
              align: 'end',
              render: (row) => (
                <AdminIconButton
                  icon={QrCode}
                  label={t('admin.eventTicketsSold.qr.open', { name: row.attendee })}
                  onClick={() => setQrTicketId(row.id)}
                />
              ),
            },
          ]}
          rows={rows}
          emptyMessage={t('admin.eventTicketsSold.emptyFiltered')}
        />
      )}

      {qrTicket && !overrideOpen ? (
        <AdminTicketQrPanel
          canOverride={canOfferOverride}
          eventSlug={event.slug}
          ticket={qrTicket}
          onClose={closeQr}
          onOverride={() => setOverrideOpen(true)}
        />
      ) : null}
      {qrTicket && overrideOpen ? (
        <TicketAccessOverrideDialog
          row={qrTicket}
          busy={overrideBusy}
          error={overrideError}
          onCancel={() => {
            setOverrideOpen(false)
            setOverrideError('')
          }}
          onConfirm={handleConfirmOverride}
        />
      ) : null}
    </section>
  )
}
