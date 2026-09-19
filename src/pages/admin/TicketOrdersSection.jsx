import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Paperclip, Plus, Ticket } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminEmptyState from '../../components/admin/AdminEmptyState.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminFilterSearch from '../../components/admin/AdminFilterSearch.jsx'
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
  ['all', 'admin.ticketOrders.channelAll'],
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

function formatTicketAttendees(order, t) {
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
  if (people.length) return people.join(' · ')
  return order.buyerName || t('admin.ticketOrders.unknownBuyer')
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

  const load = useCallback(
    async (statusFilterKey, channelFilterKey = 'all') => {
      const generation = ++loadGenerationRef.current
      if (!loadedRef.current) setLoading(true)
      setLoadError(null)
      try {
        const result = await listTicketOrders({
          limit: 200,
          statuses: DB_STATUSES_BY_FILTER[statusFilterKey] ?? undefined,
          channel: channelFilterKey === 'all' ? undefined : channelFilterKey,
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
    void load(status, channel)
  }, [channel, load, status])

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

  function handleStatusChange(next) {
    statusTouchedRef.current = true
    setStatus(next)
  }

  const refreshList = useCallback(async () => {
    await Promise.all([
      load(statusRef.current, channelRef.current),
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

  const allRows = useMemo(
    () =>
      orders.map((order) => {
        const attendees = formatTicketAttendees(order, t)
        return {
          id: order.orderId,
          reference: order.reference,
          event: order.eventTitle,
          attendees,
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
    const normalized = query.trim().toLowerCase()
    if (!normalized) return allRows
    return allRows.filter((row) =>
      [row.reference, row.event, row.attendees, row.buyerEmail].some((field) =>
        field?.toLowerCase().includes(normalized),
      ),
    )
  }, [allRows, query])

  async function handleApprove(orderId) {
    if (!canEdit) return
    setApprovingId(orderId)
    setActionError(null)
    try {
      await onApproveTicketOrder?.(orderId)
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
    channel !== 'all' || Boolean(query.trim()) || (status !== 'pending' && status !== 'all')
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
      detail: `${row.event} · ${row.reference}`,
      meta: row.amount,
    })
  }

  function renderTicketRowActions(row, { compact = false } = {}) {
    const approving = approvingId === row.id
    const isOpen = OPEN_TICKET_STATUSES.includes(row.status)
    if (!canEdit || !isOpen) return compact ? null : <AdminTableActionsEmpty />

    return (
      <AdminTableActions>
        {!row.paymentProofPath && !row.cashAtPitbull ? (
          <span className="status-pill status-pill--warning">
            {t('admin.ticketOrders.proofMissing')}
          </span>
        ) : (
          <AdminIconButton
            disabled={approving}
            icon={BadgeCheck}
            spinning={approving}
            label={t('admin.actions.validate')}
            onClick={() => openProof(row)}
            variant="celeste"
          />
        )}
      </AdminTableActions>
    )
  }

  return (
    <section
      id="admin-ticket-orders"
      className="admin-orders-block admin-orders-block--athlete admin-orders-block--tickets"
    >
      <header className="admin-orders-block__header">
        <div>
          <span className="admin-orders-block__eyebrow">{t('admin.ticketOrders.eyebrow')}</span>
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
          <AdminFilterChipGroup
            id="ticket-orders-channel"
            ariaLabel={t('admin.ticketOrders.channelLabel')}
            value={channel}
            onChange={setChannel}
            compact
            defaultValue="all"
            omitNeutral
            allLabel={t('admin.ticketOrders.channelAll')}
            clearable
            options={CHANNEL_FILTERS.map(([value, key]) => [value, t(key)])}
          />
        </div>
      </div>

      {actionError && <p className="form-submit-error">{actionError}</p>}
      {showInitialSkeleton ? (
        <TableSkeleton rows={6} columns={7} label={t('admin.ticketOrders.loading')} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => void load(status, channel)} retryLabel={t('common.retry')} />
      ) : queueEmpty ? (
        emptyState()
      ) : (
        <AdminDataTable
          columns={[
            {
              key: 'attendees',
              label: t('admin.columns.attendee'),
              mobile: 'primary',
              sortable: true,
            },
            {
              key: 'reference',
              label: t('admin.columns.reference'),
              mobile: 'hidden',
              sortable: true,
            },
            { key: 'event', label: t('admin.columns.event'), mobile: 'default', sortable: true },
            {
              key: 'channel',
              label: t('admin.columns.method'),
              mobile: 'hidden',
              sortable: true,
              render: (row) => (row.channel ? row.channel : '—'),
            },
            {
              key: 'ticketCount',
              label: t('admin.ticketOrders.tickets'),
              mobile: 'hidden',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            {
              key: 'amount',
              label: t('admin.columns.amount'),
              mobile: 'default',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            {
              key: 'proofStatus',
              label: t('admin.ticketOrders.proof'),
              mobile: 'default',
              sortable: true,
              render: (row) => {
                const hasProof = Boolean(row.paymentProofPath)
                if (!hasProof) {
                  return <span className="admin-proof-pill">{row.proofStatus}</span>
                }
                return (
                  <button
                    type="button"
                    className="admin-proof-pill admin-proof-pill--ok admin-proof-pill--link"
                    onClick={() => openProof(row, 'view')}
                  >
                    <Paperclip size={14} aria-hidden />
                    {row.proofStatus}
                  </button>
                )
              },
            },
            {
              key: 'proofUploadedAt',
              label: t('admin.ticketOrders.uploadedAt'),
              mobile: 'hidden',
              sortable: true,
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              sortable: true,
              render: (row) => <StatusBadge value={row.status} />,
            },
            {
              key: 'actions',
              label: t('admin.columns.action'),
              mobile: 'action',
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
          onConfirm={() => {
            void handleApprove(reviewRow.orderId).then((done) => {
              if (done) setReviewRow(null)
            })
          }}
          onReject={(reason) => {
            void handleReject(reviewRow.orderId, reason).then((done) => {
              if (done) setReviewRow(null)
            })
          }}
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
