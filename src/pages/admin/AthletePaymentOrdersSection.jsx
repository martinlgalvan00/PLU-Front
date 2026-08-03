import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, FileText, RefreshCw } from 'lucide-react'
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
import {
  getAthletePaymentProofUrl,
  listAthletePaymentOrders,
} from '../../services/athleteApi.js'

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
}) {
  const { locale, t } = useI18n()
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [proofBusyId, setProofBusyId] = useState(null)

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
      if (result?.error) setError(result.error)
      await load()
    } finally {
      setApprovingId(null)
    }
  }

  async function openProof(orderId) {
    setProofBusyId(orderId)
    setError('')
    try {
      const url = await getAthletePaymentProofUrl(orderId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (proofError) {
      setError(proofError?.message ?? t('admin.athletePayments.proofError'))
    } finally {
      setProofBusyId(null)
    }
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
              desktop: 'numeric',
              align: 'end',
              sortable: true,
              render: (row) => money(row.amount, locale),
            },
            {
              key: 'method',
              label: t('admin.columns.method'),
              mobile: 'default',
              render: (row) => PAYMENT_METHODS[row.method]?.label ?? row.method,
            },
            {
              key: 'proof',
              label: t('admin.athletePayments.columnProof'),
              mobile: 'default',
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
                return (
                  <button
                    type="button"
                    className="admin-orders-block__proof"
                    disabled={proofBusyId === row.id}
                    onClick={() => openProof(row.id)}
                  >
                    <FileText size={14} aria-hidden />
                    {formatDateTime(row.proofUploadedAt, locale)}
                  </button>
                )
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
                  <AdminIconButton
                    disabled={
                      !canEdit ||
                      row.method !== 'manual_link' ||
                      !OPEN_STATUSES.includes(row.status) ||
                      approvingId === row.id
                    }
                    icon={BadgeCheck}
                    label={
                      row.method === 'mercado_pago'
                        ? t('admin.athletePayments.webhookOnly')
                        : t('admin.actions.validate')
                    }
                    onClick={() => approve(row.id)}
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
    </section>
  )
}
