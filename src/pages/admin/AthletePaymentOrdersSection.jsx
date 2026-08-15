import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, HandCoins, RefreshCw, Route, ScanSearch } from 'lucide-react'
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
import { revalidatePaymentOrder } from '../../services/paymentService.js'
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

/**
 * Con el interruptor de validación del concepto apagado no se acredita ni se
 * rechaza esa orden. El combo pesa en los dos: acredita afiliación e
 * inscripción en la misma transacción, así que alcanza uno congelado.
 */
function canValidateConcept(concept, validationEnabled) {
  if (concept === 'combo') {
    return validationEnabled.membership !== false && validationEnabled.registration !== false
  }
  return validationEnabled[concept] !== false
}

/**
 * Órdenes que el flujo normal ya no puede resolver pero todavía tienen arreglo:
 * un cobro de Mercado Pago que quedó rechazado, o una transferencia rechazada
 * cuyo dinero terminó entrando igual. Son las candidatas a acreditación manual.
 */
function canForceSettleRow(row) {
  if (row.status === 'aprobado') return false
  return row.method === 'mercado_pago' || row.status === 'rechazado'
}

export default function AthletePaymentOrdersSection({
  canEdit,
  canForceSettle = false,
  highlightOrderId = null,
  onApprovePayment,
  onForceSettlePayment,
  onRejectPayment,
  onSummaryChange,
  refreshKey = 0,
  statusFilter = null,
  validationEnabled = { membership: true, registration: true, ticket: true },
}) {
  const { locale, t } = useI18n()
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [reviewRow, setReviewRow] = useState(null)
  const [traceOrderId, setTraceOrderId] = useState(null)
  const [revalidatingId, setRevalidatingId] = useState(null)
  const [revalidation, setRevalidation] = useState(null)

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
      validatable: canValidateConcept(order.concept, validationEnabled),
      amount: order.amount,
      currency: order.currency,
      method: order.method,
      manualPaymentChannel: order.manualPaymentChannel,
      status: order.status,
      reference: order.reference,
      createdAt: order.createdAt,
      hasProof: Boolean(order.paymentProofPath),
      paymentProofPath: order.paymentProofPath ?? null,
      proofUploadedAt: order.paymentProofUploadedAt,
    }))
  }, [orders, status, validationEnabled])

  async function approve(orderId) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onApprovePayment?.(orderId)
      if (result?.error) {
        setError(result.error)
        return false
      }
      // El backend ya devuelve la orden actualizada: parchear la fila en vez
      // de volver a traer las 200 evita un roundtrip completo por cada
      // aprobación (el operador suele aprobar varias seguidas).
      if (result?.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
        )
      } else {
        await load()
      }
      return true
    } finally {
      setApprovingId(null)
    }
  }

  async function forceSettle(orderId, { reason, reference }) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onForceSettlePayment?.(orderId, { reason, reference })
      if (result?.error) {
        setError(result.error)
        return false
      }
      if (result?.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
        )
      } else {
        await load()
      }
      return true
    } finally {
      setApprovingId(null)
    }
  }

  /**
   * Confronta la orden contra Mercado Pago y aplica lo que diga el proveedor.
   * No es una corrección a mano: si Mercado Pago no tiene un pago aprobado, el
   * estado no se mueve y el resultado lo dice.
   */
  async function revalidate(orderId) {
    setRevalidatingId(orderId)
    setError('')
    setRevalidation(null)
    try {
      const result = await revalidatePaymentOrder(orderId)
      setRevalidation({ orderId, ...result })
      if (result?.resultStatus && result.resultStatus !== result.localStatus) {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, status: result.resultStatus } : order,
          ),
        )
      }
    } catch (revalidateError) {
      setError(revalidateError?.message ?? t('admin.athletePayments.revalidateError'))
    } finally {
      setRevalidatingId(null)
    }
  }

  async function reject(orderId, reason) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onRejectPayment?.(orderId, reason)
      if (result?.error) {
        setError(result.error)
        return false
      }
      if (result?.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
        )
      } else {
        await load()
      }
      return true
    } finally {
      setApprovingId(null)
    }
  }

  function openReview(row, mode = 'validate') {
    setError('')
    setReviewRow({
      mode,
      type: 'payment',
      paymentId: row.id,
      hasProof: row.hasProof,
      cashAtPitbull: row.manualPaymentChannel === 'cash_pitbull',
      paymentProofPath: row.paymentProofPath,
      paymentProofUploadedAt: row.proofUploadedAt,
      subject: row.athlete,
      documentId: row.document,
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

      {/* Resultado de la última revalidación: qué decía el panel, qué dice
          Mercado Pago y qué quedó. Es la constancia de que el estado que se ve
          ahora salió del proveedor y no de una corrección a mano. */}
      {revalidation ? (
        <div className="admin-payments-ops-callout" role="status">
          <ScanSearch size={16} aria-hidden />
          <div className="admin-payments-ops-callout__body">
            <strong>{t(`admin.athletePayments.revalidate.${revalidation.outcome}`)}</strong>
            <p>
              {t('admin.athletePayments.revalidateDetail', {
                reference: revalidation.order?.reference ?? '—',
                local: t(`status.${revalidation.localStatus}`),
                provider: revalidation.providerStatus
                  ? t(`status.${revalidation.providerStatus}`)
                  : t('admin.athletePayments.revalidateNoPayment'),
              })}
            </p>
          </div>
        </div>
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
              render: (row) => row.manualPaymentChannel === 'cash_pitbull'
                ? t('formOptions.payment.cashPitbull')
                : PAYMENT_METHODS[row.method]?.label ?? row.method,
            },
            {
              key: 'proof',
              label: t('admin.athletePayments.columnProof'),
              mobile: 'hidden',
              render: (row) => {
                if (row.method !== 'manual_link') {
                  return <span className="data-table__mono data-table__mono--empty">—</span>
                }
                if (row.manualPaymentChannel === 'cash_pitbull') {
                  return <span className="status-pill status-pill--info">{t('formOptions.payment.cashPitbull')}</span>
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
                  {/* Confrontar contra el proveedor es la vía sana cuando el
                      estado que figura no coincide con la plata: no acredita
                      nada por sí sola, aplica lo que responde Mercado Pago.
                      Va antes que la acreditación manual para que sea lo
                      primero que se prueba. */}
                  {canEdit && row.method === 'mercado_pago' ? (
                    <AdminIconButton
                      disabled={revalidatingId === row.id || approvingId === row.id}
                      icon={ScanSearch}
                      label={t('admin.athletePayments.revalidate.action')}
                      onClick={() => void revalidate(row.id)}
                      variant="ghost"
                    />
                  ) : null}
                  <AdminIconButton
                    disabled={
                      !canEdit ||
                      !row.validatable ||
                      row.method !== 'manual_link' ||
                      (!row.hasProof && row.manualPaymentChannel !== 'cash_pitbull') ||
                      !OPEN_STATUSES.includes(row.status) ||
                      approvingId === row.id
                    }
                    icon={BadgeCheck}
                    label={
                      row.method === 'mercado_pago'
                        ? t('admin.athletePayments.webhookOnly')
                        : row.validatable
                          ? t('admin.actions.validate')
                          : t('admin.athletePayments.validationPaused')
                    }
                    onClick={() => openReview(row)}
                    variant="celeste"
                  />
                  {/* Vía de excepción: sólo aparece en las órdenes que el botón
                      de validar no puede tocar (Mercado Pago, o rechazadas),
                      para que no compita con el flujo normal. */}
                  {canForceSettle && canForceSettleRow(row) ? (
                    <AdminIconButton
                      disabled={!row.validatable || approvingId === row.id}
                      icon={HandCoins}
                      label={
                        row.validatable
                          ? t('admin.athletePayments.forceSettle')
                          : t('admin.athletePayments.validationPaused')
                      }
                      onClick={() => openReview(row, 'settle')}
                      variant="ghost"
                    />
                  ) : null}
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
          mode={reviewRow.mode ?? 'validate'}
          busy={approvingId === reviewRow.paymentId}
          error={error}
          onCancel={() => setReviewRow(null)}
          onConfirm={(settlement) => {
            const paymentId = reviewRow.paymentId
            const action = reviewRow.mode === 'settle'
              ? forceSettle(paymentId, settlement)
              : approve(paymentId)
            void action.then((done) => {
              if (done) setReviewRow(null)
            })
          }}
          onReject={(reason) => {
            const paymentId = reviewRow.paymentId
            void reject(paymentId, reason).then((rejected) => {
              if (rejected) setReviewRow(null)
            })
          }}
        />
      ) : null}
    </section>
  )
}
