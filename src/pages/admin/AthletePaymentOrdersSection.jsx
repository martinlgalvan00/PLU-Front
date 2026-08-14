import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, RefreshCw, Route } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
  AdminTableActions,
} from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PAYMENT_METHODS } from '../../lib/constants.js'
import { money } from '../../lib/format.js'
import { listAthletePaymentOrders } from '../../services/athleteApi.js'
import PaymentValidationDialog from '../../components/admin/PaymentValidationDialog.jsx'
import PaymentTraceDialog from '../../components/admin/PaymentTraceDialog.jsx'

/**
 * AthletePaymentOrdersSection — PLU ARG
 *
 * Órdenes de afiliación e inscripción en Finanzas. Antes solo existían las de
 * entradas: para aprobar una transferencia de afiliación había que entrar
 * atleta por atleta desde el padrón, y el acceso directo del dashboard llevaba
 * a una sección que ni siquiera las renderizaba.
 *
 * `highlightOrderId` es justamente ese acceso directo: la cola de pendientes
 * pasa el id y la fila queda marcada al llegar.
 */

const STATUS_FILTERS = [
  ['pending', 'admin.athletePayments.filterPending'],
  ['validacion_manual', 'admin.athletePayments.filterManual'],
  ['aprobado', 'admin.athletePayments.filterApproved'],
  ['all', 'admin.athletePayments.filterAll'],
]

// Estados que todavía esperan una decisión operativa.
const OPEN_STATUSES = ['pendiente', 'validacion_manual']

function formatDateTime(value, locale) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function AthletePaymentOrdersSection({
  canEdit,
  highlightOrderId = null,
  onApprovePayment,
  onSummaryChange,
  refreshKey = 0,
  statusFilter = null,
}) {
  const { locale, t } = useI18n()
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [reviewRow, setReviewRow] = useState(null)
  const [traceOrderId, setTraceOrderId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setOrders(await listAthletePaymentOrders({ limit: 200 }))
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.athletePayments.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (refreshKey === 0) return
    void load()
  }, [refreshKey, load])

  useEffect(() => {
    if (statusFilter?.status == null) return
    setStatus(statusFilter.status)
  }, [statusFilter])

  useEffect(() => {
    if (!highlightOrderId || loading) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('admin-athlete-payments')?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightOrderId, loading])

  const counts = useMemo(() => {
    const open = orders.filter((order) => OPEN_STATUSES.includes(order.status))
    return {
      pending: open.length,
      validacion_manual: orders.filter((order) => order.status === 'validacion_manual').length,
      aprobado: orders.filter((order) => order.status === 'aprobado').length,
      all: orders.length,
      openAmount: open.reduce((sum, order) => sum + (order.amount ?? 0), 0),
    }
  }, [orders])

  useEffect(() => {
    onSummaryChange?.({
      pending: counts.pending,
      openAmount: counts.openAmount,
      loading,
    })
  }, [counts.openAmount, counts.pending, loading, onSummaryChange])

  const rows = useMemo(() => {
    const filtered = orders.filter((order) => {
      if (status === 'all') return true
      if (status === 'pending') return OPEN_STATUSES.includes(order.status)
      return order.status === status
    })

    return filtered.map((order) => ({
      id: order.id,
      athlete: order.athlete?.fullName ?? '—',
      document: order.athlete?.documentId ?? '—',
      concept: order.conceptLabel,
      amount: order.amount,
      currency: order.currency,
      method: order.method,
      status: order.status,
      reference: order.reference,
      createdAt: order.createdAt,
      hasProof: Boolean(order.paymentProofPath),
      proofUploadedAt: order.paymentProofUploadedAt,
    }))
  }, [orders, status])

  async function approve(orderId) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onApprovePayment?.(orderId)
      if (result?.error) {
        setError(result.error)
        return false
      }
      await load()
      return true
    } finally {
      setApprovingId(null)
    }
  }

  function openReview(row) {
    setError('')
    setReviewRow({
      type: 'payment',
      paymentId: row.id,
      hasProof: row.hasProof,
      subject: row.athlete,
      detail: `${row.concept} · ${row.reference}`,
      meta: money(row.amount, locale),
    })
  }

  return (
    <section id="admin-athlete-payments" className="admin-orders-block">
      <header className="admin-orders-block__header">
        <div>
          <span className="admin-orders-block__eyebrow">{t('admin.athletePayments.eyebrow')}</span>
          <h2 className="admin-orders-block__title">{t('admin.athletePayments.title')}</h2>
          <p className="admin-orders-block__lead">{t('admin.athletePayments.subtitle')}</p>
        </div>
        <div className="admin-orders-block__actions">
          <span className="admin-orders-block__amount">
            {t('admin.athletePayments.openAmount', { amount: money(counts.openAmount, locale) })}
          </span>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => void load()}>
            <RefreshCw size={15} aria-hidden />
            {t('admin.athletePayments.refresh')}
          </button>
        </div>
      </header>

      <AdminFilterChipGroup
        id="athlete-orders-status"
        label={t('admin.filters.status')}
        value={status}
        onChange={setStatus}
        compact
        defaultValue="all"
        omitNeutral
        allLabel={t('admin.filters.showingAll')}
        clearable
        hideEmpty
        options={STATUS_FILTERS.map(([value, key]) => [value, t(key), counts[value] ?? 0])}
      />

      {error ? (
        <ErrorState
          title={t('admin.athletePayments.loadErrorTitle')}
          message={error}
          onRetry={() => void load()}
        />
      ) : null}

      {loading ? (
        <LoadingState label={t('admin.athletePayments.loading')} />
      ) : (
        <AdminDataTable
          className="admin-data-table--athlete-orders"
          getRowClassName={(row) => (row.id === highlightOrderId ? 'data-table__row--selected' : '')}
          columns={[
            {
              key: 'athlete',
              label: t('admin.columns.athlete'),
              mobile: 'primary',
              sortable: true,
              render: (row) => (
                <AdminIdentityCell accent="gold" name={row.athlete} sub={row.document} subMono />
              ),
            },
            {
              key: 'concept',
              label: t('admin.columns.concept'),
              mobile: 'default',
            },
            {
              key: 'amount',
              label: t('admin.columns.amount'),
              mobile: 'badge',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
              render: (row) => (
                <span className="admin-orders-block__amount-badge">{money(row.amount, locale)}</span>
              ),
            },
            {
              key: 'method',
              label: t('admin.columns.method'),
              mobile: 'hidden',
              render: (row) => PAYMENT_METHODS[row.method]?.label ?? row.method,
            },
            {
              key: 'proof',
              label: t('admin.athletePayments.columnProof'),
              mobile: 'hidden',
              render: (row) => {
                if (row.method !== 'manual_link') {
                  return <span className="data-table__mono data-table__mono--empty">—</span>
                }
                if (!row.hasProof) {
                  return (
                    <span className="status-pill status-pill--warning">
                      {t('admin.athletePayments.proofMissing')}
                    </span>
                  )
                }
                return <span className="admin-orders-block__proof">{formatDateTime(row.proofUploadedAt, locale)}</span>
              },
            },
            {
              key: 'createdAt',
              label: t('admin.columns.date'),
              mobile: 'default',
              sortable: true,
              defaultSort: 'desc',
              sortAccessor: (row) => row.createdAt ?? '',
              render: (row) => formatDateTime(row.createdAt, locale),
            },
            {
              key: 'reference',
              label: t('admin.columns.reference'),
              mobile: 'hidden',
              render: (row) => <AdminMonoCell>{row.reference}</AdminMonoCell>,
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              render: (row) => <StatusBadge value={row.status} />,
            },
            {
              key: 'action',
              label: t('admin.columns.action'),
              mobile: 'action',
              render: (row) => (
                <AdminTableActions>
                  {/* La traza está disponible siempre, incluso sin permiso de
                      aprobación: entender por qué un cobro no acreditó es una
                      lectura, no una acción sobre la plata. */}
                  <AdminIconButton
                    icon={Route}
                    label={t('admin.paymentTrace.open')}
                    onClick={() => setTraceOrderId(row.id)}
                    variant="ghost"
                  />
                  <AdminIconButton
                    disabled={
                      !canEdit ||
                      row.method !== 'manual_link' ||
                      !row.hasProof ||
                      !OPEN_STATUSES.includes(row.status) ||
                      approvingId === row.id
                    }
                    icon={BadgeCheck}
                    label={
                      row.method === 'mercado_pago'
                        ? t('admin.athletePayments.webhookOnly')
                        : t('admin.actions.validate')
                    }
                    onClick={() => openReview(row)}
                    variant="celeste"
                  />
                </AdminTableActions>
              ),
            },
          ]}
          rows={rows}
          emptyMessage={t('admin.athletePayments.empty')}
        />
      )}

      {traceOrderId ? (
        <PaymentTraceDialog orderId={traceOrderId} onClose={() => setTraceOrderId(null)} />
      ) : null}

      {reviewRow ? (
        <PaymentValidationDialog
          item={reviewRow}
          busy={approvingId === reviewRow.paymentId}
          error={error}
          onCancel={() => setReviewRow(null)}
          onConfirm={() => {
            const paymentId = reviewRow.paymentId
            void approve(paymentId).then((approved) => {
              if (approved) setReviewRow(null)
            })
          }}
        />
      ) : null}
    </section>
  )
}
