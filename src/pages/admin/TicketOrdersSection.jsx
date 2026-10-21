import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Eye, Paperclip, Plus, Ticket } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminEmptyState from '../../components/admin/AdminEmptyState.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminFilterSearch from '../../components/admin/AdminFilterSearch.jsx'
import AdminFilterSelect from '../../components/admin/AdminFilterSelect.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { AdminTableActions, AdminTableActionsEmpty } from '../../components/admin/AdminTableCells.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import PaymentValidationDialog from '../../components/admin/PaymentValidationDialog.jsx'
import ManualTicketSaleDialog from '../../components/admin/ManualTicketSaleDialog.jsx'
import { listTicketOrders } from '../../services/ticketApi.js'
import { trashOrderProof } from '../../services/paymentProofsAdminService.js'
import { PROOF_TRASHABLE_STATUSES } from '../../services/paymentValidationService.js'

const OPEN_TICKET_STATUSES = ['creado', 'pendiente']

const STATUS_FILTERS = [
  ['pending', 'admin.ticketOrders.filterPending'],
  ['aprobado', 'admin.ticketOrders.filterApproved'],
  ['rechazado', 'admin.ticketOrders.filterRejected'],
  ['cancelado', 'admin.ticketOrders.filterCancelled'],
  ['all', 'admin.ticketOrders.filterAll'],
]

const DB_STATUSES_BY_FILTER = Object.freeze({
  pending: OPEN_TICKET_STATUSES,
  aprobado: ['aprobado'],
  rechazado: ['rechazado'],
  cancelado: ['cancelado'],
  all: null,
})

const CHANNEL_FILTERS = [
  ['all', 'admin.ticketOrders.channelAllOption'],
  ['bank_transfer', 'admin.ticketOrders.channelBankTransfer'],
  ['cash_pitbull', 'admin.ticketOrders.channelCash'],
  ['wise_transfer', 'admin.ticketOrders.channelWise'],
  ['mercado_pago', 'admin.ticketOrders.channelMercadoPago'],
]

function formatUploadedAt(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function attendeeVisibleName(line) {
  return String(line ?? '').replace(/\s+\([^)]*\)\s*$/, '').trim()
}

function ticketAttendeeLines(order, t) {
  const seen = new Set()
  const people = []
  for (const item of order.attendees ?? []) {
    const name = String(item.name ?? '').trim()
    if (!name) continue
    const dni = String(item.dni ?? '').trim()
    const key = dni || name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    people.push(dni ? `${name} (${dni})` : name)
  }
  if (people.length) return people
  const buyer = String(order.buyerName ?? '').trim()
  return [buyer || t('admin.ticketOrders.unknownBuyer')]
}

function isOpenManualTicketOrder(row) {
  return row.provider === 'manual' && row.status === 'pendiente'
}

function ticketNeedsProofOverride(row) {
  return isOpenManualTicketOrder(row) && !row.cashAtPitbull && !row.paymentProofPath
}

function channelLabel(order, t) {
  if (order.manualPaymentChannel === 'wise_transfer') return t('admin.ticketOrders.channelWise')
  if (order.manualPaymentChannel === 'cash_pitbull') return t('admin.ticketOrders.channelCash')
  if (order.manualPaymentChannel === 'bank_transfer') return t('admin.ticketOrders.channelBankTransfer')
  if (order.provider === 'mercado_pago') return t('admin.ticketOrders.channelMercadoPago')
  if (order.provider === 'manual') return t('admin.ticketOrders.channelBankTransfer')
  return null
}

export default function TicketOrdersSection({
  canEdit,
  initialQuery = '',
  /** Filtro duro por slug de evento (desde workspace / deep link). */
  eventSlugFilter = '',
  pendingTicketOrders = [],
  loadError: pendingError = null,
  events = [],
  onApproveTicketOrder,
  onRejectTicketOrder,
  onCreateManualTicketOrder,
  onRefresh,
}) {
  const { locale, t } = useI18n()
  const [orders, setOrders] = useState(pendingTicketOrders)
  const [status, setStatus] = useState('pending')
  const [channel, setChannel] = useState('all')
  const [eventSlug, setEventSlug] = useState(eventSlugFilter || 'all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(pendingError)
  const [serverCounts, setServerCounts] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [query, setQuery] = useState(initialQuery)
  const [reviewRow, setReviewRow] = useState(null)
  const [manualSaleOpen, setManualSaleOpen] = useState(false)
  const [manualSaleBusy, setManualSaleBusy] = useState(false)
  const [manualSaleError, setManualSaleError] = useState('')
  const loadedRef = useRef(false)
  const statusTouchedRef = useRef(false)
  const loadGenerationRef = useRef(0)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setEventSlug(eventSlugFilter || 'all')
  }, [eventSlugFilter])

  const load = useCallback(
    async (statusFilterKey, channelFilterKey = 'all', eventSlugKey = 'all') => {
      const generation = ++loadGenerationRef.current
      if (!loadedRef.current) setLoading(true)
      setLoadError(null)
      try {
        const result = await listTicketOrders({
          limit: 200,
          statuses: DB_STATUSES_BY_FILTER[statusFilterKey] ?? undefined,
          channel: channelFilterKey === 'all' ? undefined : channelFilterKey,
          eventSlug:
            eventSlugKey && eventSlugKey !== 'all' ? eventSlugKey : undefined,
          sort: statusFilterKey === 'pending' ? 'aging' : 'recent',
          withCounts: true,
        })
        if (generation !== loadGenerationRef.current) return
        loadedRef.current = true
        setOrders(result.orders)
        if (result.counts) setServerCounts(result.counts)
      } catch (error) {
        if (generation !== loadGenerationRef.current) return
        setLoadError(error?.message ?? t('admin.ticketOrders.loadError'))
      } finally {
        if (generation === loadGenerationRef.current) setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void load(status, channel, eventSlug)
  }, [channel, eventSlug, load, status])

  useEffect(() => {
    if (statusTouchedRef.current || !serverCounts) return
    if (status !== 'pending') return
    if ((serverCounts.pending ?? 0) > 0) return
    if ((serverCounts.all ?? 0) === 0) return
    setLoading(true)
    setStatus('all')
  }, [serverCounts, status])

  const statusRef = useRef(status)
  statusRef.current = status
  const channelRef = useRef(channel)
  channelRef.current = channel
  const eventSlugRef = useRef(eventSlug)
  eventSlugRef.current = eventSlug

  function handleStatusChange(next) {
    statusTouchedRef.current = true
    setStatus(next)
  }

  const refreshList = useCallback(async () => {
    await Promise.all([
      load(statusRef.current, channelRef.current, eventSlugRef.current),
      onRefresh?.() ?? Promise.resolve(),
    ])
  }, [load, onRefresh])

  const counts = useMemo(() => {
    if (serverCounts) return serverCounts
    const open = orders.filter((order) => OPEN_TICKET_STATUSES.includes(order.status))
    return {
      pending: open.length,
      aprobado: orders.filter((order) => order.status === 'aprobado').length,
      rechazado: orders.filter((order) => order.status === 'rechazado').length,
      cancelado: orders.filter((order) => order.status === 'cancelado').length,
      all: orders.length,
    }
  }, [orders, serverCounts])

  const eventFilterOptions = useMemo(() => {
    const fromCatalog = (events ?? [])
      .filter((event) => event?.slug)
      .map((event) => [event.slug, event.title || event.slug])
    if (fromCatalog.length > 0) {
      return [['all', t('admin.filters.allEvents')], ...fromCatalog]
    }
    const seen = new Map()
    for (const order of orders) {
      const slug = String(order.eventSlug ?? '').trim()
      if (!slug || seen.has(slug)) continue
      seen.set(slug, order.eventTitle || slug)
    }
    return [
      ['all', t('admin.filters.allEvents')],
      ...[...seen.entries()].map(([slug, title]) => [slug, title]),
    ]
  }, [events, orders, t])

  const allRows = useMemo(
    () =>
      orders.map((order) => {
        const attendeeLines = ticketAttendeeLines(order, t)
        return {
          id: order.orderId,
          reference: order.reference,
          event: order.eventTitle,
          eventSlug: order.eventSlug ?? null,
          attendees: attendeeLines.join(' · '),
          attendeeLines,
          buyerEmail: order.buyerEmail,
          ticketCount: order.ticketCount,
          amount: money(order.amount, locale, order.currency),
          channel: channelLabel(order, t),
          cashAtPitbull: order.manualPaymentChannel === 'cash_pitbull',
          provider: order.provider,
          proofStatus: order.paymentProofPath
            ? t('admin.ticketOrders.proofReceived')
            : order.manualPaymentChannel === 'cash_pitbull'
              ? t('admin.ticketOrders.proofNotApplicable')
              : order.provider === 'mercado_pago'
                ? '—'
                : t('admin.ticketOrders.proofMissing'),
          proofUploadedAt: formatUploadedAt(order.paymentProofUploadedAt, locale),
          status: order.status,
          paymentProofPath: order.paymentProofPath,
        }
      }),
    [locale, orders, t],
  )

  const rows = useMemo(() => {
    const scoped =
      !eventSlug || eventSlug === 'all'
        ? allRows
        : allRows.filter(
            (row) =>
              row.eventSlug === eventSlug ||
              (!row.eventSlug && row.event && row.event === eventSlug),
          )
    const normalized = query.trim().toLowerCase()
    if (!normalized) return scoped
    return scoped.filter((row) =>
      [row.reference, row.event, row.attendees, row.buyerEmail].some((field) =>
        field?.toLowerCase().includes(normalized),
      ),
    )
  }, [allRows, eventSlug, query])

  async function handleApprove(orderId, { overrideReason } = {}) {
    if (!canEdit) return
    setApprovingId(orderId)
    setActionError(null)
    try {
      await onApproveTicketOrder?.(orderId, { overrideReason })
      await refreshList()
      notifySuccess(t('admin.toasts.ticketApproved'))
      return true
    } catch (error) {
      console.error('approve ticket order:', error)
      const message = error.message ?? t('admin.ticketOrders.approveErrorFallback')
      setActionError(message)
      notifyError(message)
      return false
    } finally {
      setApprovingId(null)
    }
  }

  async function handleReject(orderId, reason) {
    if (!canEdit) return false
    setApprovingId(orderId)
    setActionError(null)
    try {
      const result = await onRejectTicketOrder?.(orderId, reason)
      if (result?.error) {
        setActionError(result.error)
        notifyError(result.error)
        return false
      }
      await refreshList()
      notifySuccess(t('admin.toasts.ticketRejected'))
      return true
    } catch (error) {
      console.error('reject ticket order:', error)
      const message = error.message ?? t('admin.ticketOrders.approveErrorFallback')
      setActionError(message)
      notifyError(message)
      return false
    } finally {
      setApprovingId(null)
    }
  }

  async function handleCreateManualSale(payload) {
    if (!canEdit) return
    setManualSaleBusy(true)
    setManualSaleError('')
    try {
      const result = await onCreateManualTicketOrder?.(payload)
      if (result?.error) {
        setManualSaleError(result.error)
        notifyError(result.error)
        return
      }
      await refreshList()
      notifySuccess(
        result?.approved
          ? t('admin.toasts.manualTicketSaleApproved')
          : t('admin.toasts.manualTicketSalePending'),
      )
      setManualSaleOpen(false)
    } catch (error) {
      console.error('create manual ticket sale:', error)
      const message = error.message ?? t('admin.ticketOrders.approveErrorFallback')
      setManualSaleError(message)
      notifyError(message)
    } finally {
      setManualSaleBusy(false)
    }
  }

  const openManualSale = () => {
    setManualSaleError('')
    setManualSaleOpen(true)
  }

  const narrowingFilters =
    channel !== 'all' ||
    (eventSlug !== 'all' && Boolean(eventSlug)) ||
    Boolean(query.trim()) ||
    (status !== 'pending' && status !== 'all')
  const openingCatalog =
    !statusTouchedRef.current &&
    status === 'pending' &&
    serverCounts != null &&
    (serverCounts.pending ?? 0) === 0 &&
    (serverCounts.all ?? 0) > 0
  const showInitialSkeleton = (loading && rows.length === 0) || openingCatalog
  const queueEmpty = !showInitialSkeleton && !loadError && rows.length === 0

  function emptyState() {
    if (query.trim()) {
      return (
        <AdminEmptyState
          filtered
          icon={Ticket}
          title={t('admin.ticketOrders.emptySearch')}
          actionLabel={t('admin.ticketOrders.clearSearch')}
          onAction={() => setQuery('')}
        />
      )
    }
    if (narrowingFilters) {
      return (
        <AdminEmptyState
          filtered
          icon={Ticket}
          title={t('admin.ticketOrders.emptyFiltered')}
          actionLabel={t('admin.ticketOrders.clearFilters')}
          onAction={() => {
            statusTouchedRef.current = true
            setStatus('all')
            setChannel('all')
            setEventSlug('all')
          }}
        />
      )
    }
    if (status === 'all') {
      return (
        <AdminEmptyState
          icon={Ticket}
          title={t('admin.ticketOrders.emptyNone')}
          lead={t('admin.ticketOrders.emptyNoneHint')}
        />
      )
    }
    if ((counts.aprobado ?? 0) > 0 || (counts.all ?? 0) > 0) {
      return (
        <AdminEmptyState
          icon={Ticket}
          title={t('admin.ticketOrders.empty')}
          lead={t('admin.ticketOrders.emptyApprovedHint')}
          actionLabel={t('admin.ticketOrders.viewApproved')}
          onAction={() => handleStatusChange('aprobado')}
        />
      )
    }
    return (
      <AdminEmptyState
        icon={Ticket}
        title={t('admin.ticketOrders.emptyNone')}
        lead={t('admin.ticketOrders.emptyNoneHint')}
      />
    )
  }

  function openProof(row, mode = 'validate') {
    setActionError(null)
    setReviewRow({
      mode,
      type: 'ticket',
      orderId: row.id,
      cashAtPitbull: row.cashAtPitbull,
      hasProof: Boolean(row.paymentProofPath),
      paymentProofPath: row.paymentProofPath ?? null,
      subject: row.attendees,
      subjects: row.attendeeLines,
      method: row.channel || null,
      detail: `${row.event} · ${row.reference}`,
      meta: row.amount,
      // Transferencia o Wise abierta sin archivo: el diálogo pide el motivo
      // y la RPC lo vuelve a exigir. Efectivo y Mercado Pago no usan este camino.
      requiresProofOverride: mode === 'validate' && ticketNeedsProofOverride(row),
      // Sólo una orden ya resuelta puede dar de baja su comprobante.
      canTrashProof: canEdit && PROOF_TRASHABLE_STATUSES.includes(row.status),
    })
  }

  async function trashProof(row) {
    await trashOrderProof({ source: 'ticket', orderId: row.orderId })
    setReviewRow(null)
    await refreshList()
    notifySuccess(t('admin.toasts.proofTrashed'))
  }

  function renderTicketRowActions(row, { compact = false } = {}) {
    const approving = approvingId === row.id
    // Orden manual abierta: Validar siempre. Sin archivo, el diálogo pide
    // motivo. «Sin adjuntar» queda en la columna Comprobante, no acá.
    if (canEdit && isOpenManualTicketOrder(row)) {
      return (
        <AdminTableActions>
          <AdminIconButton
            disabled={approving}
            icon={BadgeCheck}
            spinning={approving}
            label={t('admin.actions.validate')}
            onClick={() => openProof(row)}
            variant="celeste"
          />
        </AdminTableActions>
      )
    }

    if (row.paymentProofPath) {
      return (
        <AdminTableActions>
          <AdminIconButton
            icon={Eye}
            label={t('admin.ticketOrders.viewProof')}
            onClick={() => openProof(row, 'view')}
            variant="ghost"
          />
        </AdminTableActions>
      )
    }

    return compact ? null : <AdminTableActionsEmpty />
  }

  return (
    <section
      id="admin-ticket-orders"
      className="admin-orders-block admin-orders-block--athlete admin-orders-block--tickets"
    >
      <header className="admin-orders-block__header">
        <div>
          <h3 className="admin-orders-block__title">{t('admin.ticketOrders.title')}</h3>
          <p className="admin-orders-block__lead">{t('admin.ticketOrders.subtitle')}</p>
        </div>
        <div className="admin-orders-block__summary" role="status">
          <strong className="admin-orders-block__amount-value">{counts.pending ?? 0}</strong>
          <span className="admin-orders-block__amount-caption">
            {(counts.pending ?? 0) === 1
              ? t('admin.ticketOrders.openQueueCaptionOne')
              : t('admin.ticketOrders.openQueueCaptionMany', { count: counts.pending ?? 0 })}
          </span>
        </div>
      </header>

      <div className="admin-orders-block__toolbar admin-orders-block__toolbar--tickets">
        <div className="admin-orders-block__toolbar-primary">
          <AdminFilterSearch
            placeholder={t('admin.ticketOrders.search')}
            query={query}
            onQueryChange={setQuery}
          />
          {canEdit ? (
            <div className="admin-orders-block__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small admin-orders-block__manual-sale"
                onClick={openManualSale}
              >
                <Plus size={14} aria-hidden />
                <span className="admin-orders-block__manual-sale-label">
                  {t('admin.ticketOrders.manualSaleButton')}
                </span>
              </button>
            </div>
          ) : null}
        </div>
        <div className="admin-orders-block__toolbar-facets">
          <AdminFilterChipGroup
            id="ticket-orders-status"
            ariaLabel={t('admin.filters.status')}
            value={status}
            onChange={handleStatusChange}
            compact
            defaultValue="all"
            clearable
            hideEmpty
            options={STATUS_FILTERS.map(([value, key]) => [value, t(key), counts[value] ?? 0])}
          />
          <AdminFilterSelect
            id="ticket-orders-channel"
            ariaLabel={t('admin.ticketOrders.channelLabel')}
            value={channel}
            onChange={setChannel}
            defaultValue="all"
            options={CHANNEL_FILTERS.map(([value, key]) => [value, t(key)])}
          />
          {eventFilterOptions.length > 1 ? (
            <AdminFilterSelect
              id="ticket-orders-event"
              ariaLabel={t('admin.filters.event')}
              value={eventSlug}
              onChange={setEventSlug}
              defaultValue="all"
              options={eventFilterOptions}
            />
          ) : null}
        </div>
      </div>

      {actionError && <p className="form-submit-error">{actionError}</p>}
      {showInitialSkeleton ? (
        <TableSkeleton rows={6} columns={7} label={t('admin.ticketOrders.loading')} />
      ) : loadError ? (
        <ErrorState
          message={loadError}
          onRetry={() => void load(status, channel, eventSlug)}
          retryLabel={t('common.retry')}
        />
      ) : queueEmpty ? (
        emptyState()
      ) : (
        <AdminDataTable
          className="admin-data-table--ticket-orders"
          density="compact"
          columns={[
            {
              // Comprador y referencia son un solo dato: la referencia tenía
              // columna propia, siempre oculta en mobile y repetida en cada fila.
              key: 'attendees',
              label: t('admin.columns.attendee'),
              mobile: 'primary',
              sortable: true,
              render: (row) => {
                const extra = Math.max(0, row.attendeeLines.length - 1)
                return (
                  <div className="admin-orders-block__stack">
                    <span
                      className="admin-orders-block__concept"
                      title={row.attendees}
                      aria-label={row.attendees}
                    >
                      <span className="admin-orders-block__concept-name">
                        {attendeeVisibleName(row.attendeeLines[0])}
                      </span>
                      {extra > 0 ? (
                        <span className="admin-orders-block__more">
                          {t('admin.ticketOrders.moreAttendees', { count: extra })}
                        </span>
                      ) : null}
                    </span>
                    <span className="data-table__mono admin-orders-block__ref">{row.reference}</span>
                  </div>
                )
              },
            },
            {
              key: 'event',
              label: t('admin.columns.event'),
              mobile: 'default',
              width: 200,
              sortable: true,
            },
            {
              key: 'channel',
              label: t('admin.columns.method'),
              mobile: 'hidden',
              width: 130,
              sortable: true,
              render: (row) => (row.channel ? row.channel : '—'),
            },
            {
              // Monto con la cantidad de entradas debajo: eran dos columnas.
              key: 'amount',
              label: t('admin.columns.amount'),
              mobile: 'default',
              desktop: 'numeric',
              align: 'end',
              width: 116,
              sortable: true,
              render: (row) => (
                <div className="admin-orders-block__stack admin-orders-block__stack--end">
                  <span className="admin-orders-block__amount-badge">{row.amount}</span>
                  {row.ticketCount > 1 ? (
                    <span className="admin-orders-block__order-date">×{row.ticketCount}</span>
                  ) : null}
                </div>
              ),
            },
            {
              // Estado del comprobante y fecha de carga juntos.
              key: 'proofStatus',
              label: t('admin.ticketOrders.proof'),
              mobile: 'default',
              width: 150,
              sortable: true,
              render: (row) => {
                const hasProof = Boolean(row.paymentProofPath)
                return (
                  <div className="admin-orders-block__stack">
                    {hasProof ? (
                      <button
                        type="button"
                        className="admin-orders-block__proof"
                        onClick={() => openProof(row, 'view')}
                      >
                        <Paperclip size={13} aria-hidden />
                        {row.proofStatus}
                      </button>
                    ) : (
                      <span className="admin-orders-block__proof-note">{row.proofStatus}</span>
                    )}
                    {hasProof && row.proofUploadedAt ? (
                      <span className="admin-orders-block__order-date">{row.proofUploadedAt}</span>
                    ) : null}
                  </div>
                )
              },
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              width: 150,
              sortable: true,
              render: (row) => <StatusBadge value={row.status} />,
            },
            {
              key: 'actions',
              label: t('admin.columns.action'),
              mobile: 'action',
              width: 104,
              className: 'data-table__column--actions',
              render: (row) => renderTicketRowActions(row),
              mobileRender: (row) => renderTicketRowActions(row, { compact: true }),
            },
          ]}
          rows={rows}
          emptyMessage={t('admin.ticketOrders.emptySearch')}
        />
      )}

      {reviewRow ? (
        <PaymentValidationDialog
          item={reviewRow}
          mode={reviewRow.mode ?? 'validate'}
          busy={approvingId === reviewRow.orderId}
          error={actionError ?? ''}
          onCancel={() => setReviewRow(null)}
          onConfirm={(payload) => {
            void handleApprove(reviewRow.orderId, payload ?? {}).then((done) => {
              if (done) setReviewRow(null)
            })
          }}
          onReject={(reason) => {
            void handleReject(reviewRow.orderId, reason).then((done) => {
              if (done) setReviewRow(null)
            })
          }}
          onTrashProof={reviewRow.canTrashProof ? () => trashProof(reviewRow) : undefined}
        />
      ) : null}

      {manualSaleOpen ? (
        <ManualTicketSaleDialog
          events={events}
          busy={manualSaleBusy}
          error={manualSaleError}
          onCancel={() => {
            if (manualSaleBusy) return
            setManualSaleOpen(false)
          }}
          onConfirm={handleCreateManualSale}
        />
      ) : null}
    </section>
  )
}
