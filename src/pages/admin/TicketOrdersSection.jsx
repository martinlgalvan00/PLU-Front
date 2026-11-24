import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Ban, Eye, Paperclip, Plus, RotateCcw, Ticket } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminEmptyState from '../../components/admin/AdminEmptyState.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminFilterSearch from '../../components/admin/AdminFilterSearch.jsx'
import AdminFilterSelect from '../../components/admin/AdminFilterSelect.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useBroadcastTopic } from '../../hooks/useBroadcastTopic.js'
import { money } from '../../lib/format.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { AdminTableActions, AdminTableActionsEmpty } from '../../components/admin/AdminTableCells.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import PaymentValidationDialog from '../../components/admin/PaymentValidationDialog.jsx'
import TicketReopenDialog from '../../components/admin/TicketReopenDialog.jsx'
import ManualTicketSaleDialog from '../../components/admin/ManualTicketSaleDialog.jsx'
import TicketOrderLifecycleDialog from '../../components/admin/TicketOrderLifecycleDialog.jsx'
import {
  cancelTicketOrder,
  listTicketOrders,
  reinstateTicketOrder,
} from '../../services/ticketApi.js'
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
  ['courtesy', 'admin.ticketOrders.channelCourtesy'],
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

function canReopenCancelledTicketOrder(row) {
  return (
    row.provider === 'manual' &&
    row.status === 'cancelado' &&
    Boolean(row.paymentProofPath) &&
    !row.rejectedAt &&
    // La canceló una persona (no el vencimiento): no es una retenida con
    // comprobante, se recupera con "volver a aceptar".
    !row.cancelledAt
  )
}

/**
 * Volver a aceptar lo que cerró una persona: un rechazo hecho por error o una
 * cancelación del staff. Lo que venció el cron con comprobante va por Acreditar.
 */
function canReinstateTicketOrder(row) {
  if (row.provider !== 'manual') return false
  if (row.status === 'rechazado') return true
  return row.status === 'cancelado' && Boolean(row.cancelledAt)
}

function ticketNeedsProofOverride(row) {
  return isOpenManualTicketOrder(row) && !row.cashAtPitbull && !row.paymentProofPath
}

function channelLabel(order, t) {
  if (order.manualPaymentChannel === 'courtesy') {
    return order.courtesyLabel
      ? `${t('admin.ticketOrders.channelCourtesy')} · ${order.courtesyLabel}`
      : t('admin.ticketOrders.channelCourtesy')
  }
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
  onReopenTicketOrder,
  onSettleTicketOrder,
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
  const [reopenRow, setReopenRow] = useState(null)
  const [manualSaleOpen, setManualSaleOpen] = useState(false)
  const [manualSaleBusy, setManualSaleBusy] = useState(false)
  const [manualSaleError, setManualSaleError] = useState('')
  // Cancelar / volver a aceptar: { mode: 'cancel' | 'reinstate', row }.
  const [lifecycle, setLifecycle] = useState(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleError, setLifecycleError] = useState('')
  const loadedRef = useRef(false)
  const statusTouchedRef = useRef(false)
  const loadGenerationRef = useRef(0)
  const countsReadyRef = useRef(false)
  const countsEventRef = useRef(null)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setEventSlug(eventSlugFilter || 'all')
  }, [eventSlugFilter])

  const load = useCallback(
    async (statusFilterKey, channelFilterKey = 'all', eventSlugKey = 'all', { refreshCounts = false } = {}) => {
      const generation = ++loadGenerationRef.current
      if (!loadedRef.current) setLoading(true)
      setLoadError(null)
      const needsCounts =
        refreshCounts || !countsReadyRef.current || countsEventRef.current !== eventSlugKey
      try {
        const result = await listTicketOrders({
          limit: 200,
          statuses:
            statusFilterKey === 'pending'
              ? undefined
              : (DB_STATUSES_BY_FILTER[statusFilterKey] ?? undefined),
          channel: channelFilterKey === 'all' ? undefined : channelFilterKey,
          eventSlug:
            eventSlugKey && eventSlugKey !== 'all' ? eventSlugKey : undefined,
          sort: statusFilterKey === 'pending' ? 'aging' : 'recent',
          includeHeldProof: statusFilterKey === 'pending',
          excludeHeldProof: statusFilterKey === 'cancelado',
          withCounts: needsCounts,
        })
        if (generation !== loadGenerationRef.current) return
        loadedRef.current = true
        setOrders(result.orders)
        if (result.counts) {
          countsReadyRef.current = true
          countsEventRef.current = eventSlugKey
          setServerCounts(result.counts)
        }
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
    const queueSize = (serverCounts.pending ?? 0) + (serverCounts.heldProof ?? 0)
    if (queueSize > 0) return
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
      load(statusRef.current, channelRef.current, eventSlugRef.current, { refreshCounts: true }),
      onRefresh?.() ?? Promise.resolve(),
    ])
  }, [load, onRefresh])

  // Una venta nueva, un comprobante subido o una aprobación desde otra sesión:
  // la base avisa por `ticket-orders` (sin datos) y se relee con los filtros
  // activos. Agrupado: una tanda de invitados son decenas de órdenes y un aviso.
  useBroadcastTopic('ticket-orders', ['orders-changed'], refreshList, {
    debounceMs: 600,
    maxWaitMs: 3000,
  })

  const counts = useMemo(() => {
    const heldOnPage = orders.filter(
      (order) =>
        order.provider === 'manual' &&
        order.status === 'cancelado' &&
        order.paymentProofPath &&
        !order.rejectedAt,
    ).length
    const base = serverCounts ?? {
      pending: orders.filter((order) => OPEN_TICKET_STATUSES.includes(order.status)).length,
      heldProof: heldOnPage,
      aprobado: orders.filter((order) => order.status === 'aprobado').length,
      rechazado: orders.filter((order) => order.status === 'rechazado').length,
      cancelado: orders.filter(
        (order) =>
          order.status === 'cancelado' &&
          !(order.provider === 'manual' && order.paymentProofPath && !order.rejectedAt),
      ).length,
      all: orders.length,
    }
    const heldProof = base.heldProof ?? 0
    return {
      ...base,
      heldProof,
      queue: (base.pending ?? 0) + heldProof,
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
              : order.manualPaymentChannel === 'courtesy'
                ? t('admin.ticketOrders.proofCourtesy')
              : order.provider === 'mercado_pago'
                ? '—'
                : t('admin.ticketOrders.proofMissing'),
          proofUploadedAt: formatUploadedAt(order.paymentProofUploadedAt, locale),
          status: order.status,
          rejectedAt: order.rejectedAt ?? null,
          paymentProofPath: order.paymentProofPath,
          rejectionReason: order.rejectionReason ?? null,
          cancellationReason: order.cancellationReason ?? null,
          // Cancelada por una persona (no por el vencimiento): decide entre
          // "Acreditar" (cron) y "Volver a aceptar" (staff).
          cancelledAt: order.cancelledAt ?? null,
          cancelledFromStatus: order.cancelledFromStatus ?? null,
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

  async function handleReopen(orderId, reason) {
    if (!canEdit || !onReopenTicketOrder) return false
    setApprovingId(orderId)
    setActionError(null)
    try {
      const result = await onReopenTicketOrder(orderId, reason)
      if (result?.error) {
        setActionError(result.error)
        notifyError(result.error)
        return false
      }
      await refreshList()
      notifySuccess(t('admin.toasts.ticketReopened'))
      return true
    } catch (error) {
      console.error('reopen ticket order:', error)
      const message = error.message ?? t('admin.ticketOrders.approveErrorFallback')
      setActionError(message)
      notifyError(message)
      return false
    } finally {
      setApprovingId(null)
    }
  }

  async function handleSettle(orderId, reason) {
    if (!canEdit || !onSettleTicketOrder) return false
    setApprovingId(orderId)
    setActionError(null)
    try {
      const result = await onSettleTicketOrder(orderId, reason)
      if (result?.error) {
        setActionError(result.error)
        notifyError(result.error)
        return false
      }
      await refreshList()
      const mailFailed = result?.mail === 'failed' || result?.mail === 'suppressed'
      notifySuccess(
        t(mailFailed ? 'admin.toasts.ticketSettledMailFailed' : 'admin.toasts.ticketSettled'),
      )
      return true
    } catch (error) {
      console.error('settle ticket order:', error)
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

  function openLifecycle(mode, row) {
    if (!canEdit) return
    setLifecycleError('')
    setLifecycle({ mode, row })
  }

  async function handleLifecycleConfirm(reason) {
    if (!lifecycle || lifecycleBusy) return
    const { mode, row } = lifecycle
    setLifecycleBusy(true)
    setLifecycleError('')
    try {
      if (mode === 'cancel') await cancelTicketOrder(row.id, reason)
      else await reinstateTicketOrder(row.id)
      await refreshList()
      notifySuccess(
        mode === 'cancel'
          ? t('admin.toasts.ticketCancelled')
          : t('admin.toasts.ticketReinstated'),
      )
      setLifecycle(null)
    } catch (error) {
      console.error(`${mode} ticket order:`, error)
      // El error de cupo (409) trae el detalle de la RPC: "No queda cupo para
      // General (120 de 120 ocupados)". Es el mensaje útil, se muestra tal cual.
      setLifecycleError(error?.message ?? t('admin.ticketOrders.lifecycle.errorFallback'))
    } finally {
      setLifecycleBusy(false)
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
    // Un camino por caso: Validar la abierta, Acreditar la que venció el cron
    // con comprobante, Volver a aceptar lo que cerró una persona, Cancelar lo
    // abierto o acreditado. Mercado Pago no pasa por ninguna (webhook).
    const validate = canEdit && isOpenManualTicketOrder(row)
    const settle = canEdit && canReopenCancelledTicketOrder(row)
    const reinstate = canEdit && canReinstateTicketOrder(row)
    const cancel =
      canEdit &&
      row.provider === 'manual' &&
      (OPEN_TICKET_STATUSES.includes(row.status) || row.status === 'aprobado')
    const viewProof = Boolean(row.paymentProofPath) && !validate
    if (!validate && !settle && !reinstate && !cancel && !viewProof) {
      return compact ? null : <AdminTableActionsEmpty />
    }

    return (
      <AdminTableActions>
        {validate ? (
          <AdminIconButton
            disabled={approving}
            icon={BadgeCheck}
            spinning={approving}
            label={t('admin.actions.validate')}
            onClick={() => openProof(row)}
            variant="celeste"
          />
        ) : null}
        {settle ? (
          <AdminIconButton
            disabled={approving}
            icon={BadgeCheck}
            spinning={approving}
            label={t('admin.ticketOrders.settle')}
            onClick={() => {
              setActionError(null)
              setReopenRow(row)
            }}
            variant="celeste"
          />
        ) : null}
        {reinstate ? (
          <AdminIconButton
            icon={RotateCcw}
            label={t('admin.ticketOrders.reinstateAction')}
            onClick={() => openLifecycle('reinstate', row)}
            variant="celeste"
          />
        ) : null}
        {viewProof ? (
          <AdminIconButton
            icon={Eye}
            label={t('admin.ticketOrders.viewProof')}
            onClick={() => openProof(row, 'view')}
            variant="ghost"
          />
        ) : null}
        {cancel ? (
          <AdminIconButton
            disabled={approving}
            icon={Ban}
            label={t('admin.ticketOrders.cancelAction')}
            onClick={() => openLifecycle('cancel', row)}
            variant="danger"
          />
        ) : null}
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
          <h3 className="admin-orders-block__title">{t('admin.ticketOrders.title')}</h3>
          <p className="admin-orders-block__lead">{t('admin.ticketOrders.subtitle')}</p>
        </div>
        <div className="admin-orders-block__summary" role="status">
          <strong className="admin-orders-block__amount-value">{counts.queue ?? 0}</strong>
          <span className="admin-orders-block__amount-caption">
            {(counts.queue ?? 0) === 1
              ? t('admin.ticketOrders.openQueueCaptionOne')
              : t('admin.ticketOrders.openQueueCaptionMany', { count: counts.queue ?? 0 })}
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
            options={STATUS_FILTERS.map(([value, key]) => [
              value,
              t(key),
              value === 'pending' ? (counts.queue ?? 0) : (counts[value] ?? 0),
            ])}
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

      {status === 'pending' && rows.some((row) => row.status === 'cancelado') ? (
        <p className="admin-orders-block__lead">{t('admin.ticketOrders.heldProofNote')}</p>
      ) : null}

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
              // El motivo debajo del estado: para decidir si volver a aceptar
              // hace falta saber por qué se cerró, sin abrir la orden.
              render: (row) => {
                const reason =
                  row.status === 'rechazado'
                    ? row.rejectionReason
                    : row.status === 'cancelado'
                      ? row.cancellationReason
                      : null
                return (
                  <div className="admin-orders-block__stack">
                    <StatusBadge value={row.status} />
                    {reason ? (
                      <span className="admin-orders-block__status-reason" title={reason}>
                        {reason}
                      </span>
                    ) : null}
                  </div>
                )
              },
            },
            {
              key: 'actions',
              label: t('admin.columns.action'),
              mobile: 'action',
              width: 128,
              className: 'data-table__column--actions',
              render: (row) => renderTicketRowActions(row),
              mobileRender: (row) => renderTicketRowActions(row, { compact: true }),
            },
          ]}
          rows={rows}
          emptyMessage={t('admin.ticketOrders.emptySearch')}
        />
      )}

      {reopenRow ? (
        <TicketReopenDialog
          order={reopenRow}
          busy={approvingId === reopenRow.id}
          error={actionError ?? ''}
          onCancel={() => {
            if (approvingId === reopenRow.id) return
            setReopenRow(null)
            setActionError(null)
          }}
          onSettle={(reason) => {
            void handleSettle(reopenRow.id, reason).then((done) => {
              if (done) setReopenRow(null)
            })
          }}
          onReopen={(reason) => {
            void handleReopen(reopenRow.id, reason).then((done) => {
              if (done) setReopenRow(null)
            })
          }}
        />
      ) : null}

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

      {lifecycle ? (
        <TicketOrderLifecycleDialog
          mode={lifecycle.mode}
          order={lifecycle.row}
          busy={lifecycleBusy}
          error={lifecycleError}
          onCancel={() => {
            if (lifecycleBusy) return
            setLifecycle(null)
          }}
          onConfirm={handleLifecycleConfirm}
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
