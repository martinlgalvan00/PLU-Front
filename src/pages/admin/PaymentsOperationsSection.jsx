import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  getPaymentOperations,
  recoverPaymentOperations,
  retryPaymentEvent,
  retryPaymentReconciliation,
} from '../../services/paymentService.js'
import TicketOrdersSection from './TicketOrdersSection.jsx'

function formatDate(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function PaymentsOperationsSection({
  canEdit,
  pendingTicketOrders,
  isLoading: manualLoading,
  loadError: manualError,
  onApproveTicketOrder,
  onRefresh: onRefreshManual,
}) {
  const { locale, t } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getPaymentOperations(status || undefined))
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.paymentOperations.loadError'))
    } finally {
      setLoading(false)
    }
  }, [status, t])

  useEffect(() => { void load() }, [load])

  async function handleRecover() {
    setRecovering(true)
    setError('')
    try {
      await recoverPaymentOperations()
      await load()
    } catch (recoverError) {
      setError(recoverError?.message ?? t('admin.paymentOperations.recoverError'))
    } finally {
      setRecovering(false)
    }
  }

  async function handleRetry(row) {
    setRetryingId(row.id)
    setError('')
    try {
      if (row.operationKind === 'reconciliation') await retryPaymentReconciliation(row.id)
      else await retryPaymentEvent(row.id)
      await load()
    } catch (retryError) {
      setError(retryError?.message ?? t('admin.paymentOperations.retryError'))
    } finally {
      setRetryingId(null)
    }
  }

  const summary = data?.summary ?? {}
  const healthIssues = summary.health
    ? Number(summary.health.athleteOrderDrift ?? 0)
      + Number(summary.health.ticketOrderDrift ?? 0)
      + Number(summary.health.staleEventLocks ?? 0)
      + Number(summary.health.staleReconciliationLocks ?? 0)
      + Number(summary.health.exhaustedEvents ?? 0)
    : null
  const metrics = [
    {
      label: t('admin.paymentOperations.integrity'),
      value: summary.health?.healthy ? t('admin.paymentOperations.integrityOk') : (healthIssues ?? '—'),
      tone: summary.health?.healthy ? 'success' : 'danger',
    },
    { label: t('admin.paymentOperations.failedEvents'), value: summary.events?.failed ?? 0, tone: 'danger' },
    { label: t('admin.paymentOperations.pendingReconciliations'), value: summary.attempts?.reconciliationPending ?? 0, tone: 'warning' },
    { label: t('admin.paymentOperations.pastDueSubscriptions'), value: summary.subscriptions?.pastDue ?? 0, tone: 'warning' },
    { label: t('admin.paymentOperations.processedEvents'), value: summary.events?.processed ?? 0, tone: 'success' },
  ]
  const operationRows = [
    ...(data?.events ?? []).map((event) => ({ ...event, operationKind: 'webhook' })),
    ...(data?.reconciliations ?? []).map((attempt) => ({
      ...attempt,
      operationKind: 'reconciliation',
      event_type: t('admin.paymentOperations.reconciliation'),
      resource_id: attempt.external_payment_id,
      status: attempt.reconciliation_status,
      attempts_count: attempt.reconciliation_attempts,
      max_attempts: 12,
      last_attempt_at: attempt.updated_at,
    })),
  ].filter((row) => !status || row.status === status)

  return (
    <div className="admin-payments-operations">
      <section className="admin-payment-ops" aria-labelledby="payment-ops-title">
        <header className="admin-payment-ops__header">
          <div>
            <span className="admin-payment-ops__eyebrow"><ShieldCheck size={15} aria-hidden /> Mercado Pago</span>
            <h2 id="payment-ops-title">{t('admin.paymentOperations.title')}</h2>
            <p className="admin-payment-ops__subtitle">{t('admin.paymentOperations.subtitle')}</p>
            {data?.configuration && (
              <span className={data.configuration.recoveryEnabled ? 'admin-payment-ops__worker is-active' : 'admin-payment-ops__worker'}>
                <span aria-hidden />
                {t(data.configuration.recoveryEnabled
                  ? 'admin.paymentOperations.workerActive'
                  : 'admin.paymentOperations.workerInactive')}
              </span>
            )}
          </div>
          <div className="admin-payment-ops__actions">
            <button type="button" className="btn btn--outline btn--small" onClick={load} disabled={loading}>
              <RefreshCw size={14} aria-hidden /> {t('admin.paymentOperations.refresh')}
            </button>
            {canEdit && (
              <button type="button" className="btn btn--small" onClick={handleRecover} disabled={recovering}>
                <RotateCcw size={14} aria-hidden /> {t('admin.paymentOperations.recover')}
              </button>
            )}
          </div>
        </header>

        <details className="admin-payment-ops__metrics-panel">
          <summary className="admin-payment-ops__metrics-summary">
            {t('admin.paymentOperations.metricsToggle')}
          </summary>
          <div className="admin-payment-ops__metrics">
            {metrics.map((metric) => (
              <article key={metric.label} className={`admin-payment-ops__metric admin-payment-ops__metric--${metric.tone}`}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </article>
            ))}
          </div>
        </details>

        <div className="admin-payment-ops__filter">
          <AdminFilterChipGroup
            id="payment-ops-status"
            label={t('admin.filters.status')}
            value={status}
            onChange={setStatus}
            compact
            inline
            options={[
              ['', t('admin.paymentOperations.allEvents')],
              ['failed', t('admin.paymentOperations.failed'), summary.events?.failed],
              ['processing', t('admin.paymentOperations.processing'), summary.events?.processing],
              ['processed', t('admin.paymentOperations.processed'), summary.events?.processed],
            ]}
          />
          {summary.updatedAt ? (
            <small className="admin-payment-ops__filter-meta">
              {t('admin.paymentOperations.updatedAt', { date: formatDate(summary.updatedAt, locale) })}
            </small>
          ) : null}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} retryLabel={t('common.retry')} />
        ) : loading && !data ? (
          <LoadingState label={t('admin.paymentOperations.loading')} />
        ) : (
          <AdminDataTable
            variant="admin"
            emptyMessage={t('admin.paymentOperations.empty')}
            rows={operationRows}
            columns={[
              { key: 'event_type', label: t('admin.paymentOperations.type'), mobile: 'primary', sortable: true },
              { key: 'resource_id', label: t('admin.paymentOperations.resource'), mobile: 'default', sortable: true },
              { key: 'status', label: t('admin.columns.status'), mobile: 'badge', sortable: true, render: (row) => <StatusBadge value={row.status} /> },
              { key: 'attempts_count', label: t('admin.paymentOperations.attempts'), mobile: 'default', desktop: 'numeric', align: 'end', sortable: true, render: (row) => `${row.attempts_count}/${row.max_attempts}` },
              { key: 'last_attempt_at', label: t('admin.paymentOperations.lastAttempt'), mobile: 'default', sortable: true, render: (row) => formatDate(row.last_attempt_at, locale) },
              { key: 'error', label: t('admin.paymentOperations.detail'), mobile: 'hidden', render: (row) => row.error || '—' },
              {
                key: 'actions',
                label: t('admin.columns.action'),
                mobile: 'action',
                render: (row) => ['failed', 'pending'].includes(row.status) && canEdit ? (
                  <button
                    type="button"
                    className="btn btn--small btn--outline"
                    disabled={retryingId === row.id}
                    onClick={() => handleRetry(row)}
                  >
                    {t('admin.paymentOperations.retry')}
                  </button>
                ) : '—',
              },
            ]}
          />
        )}
      </section>

      <TicketOrdersSection
        canEdit={canEdit}
        pendingTicketOrders={pendingTicketOrders}
        isLoading={manualLoading}
        loadError={manualError}
        onApproveTicketOrder={onApproveTicketOrder}
        onRefresh={onRefreshManual}
      />
    </div>
  )
}
