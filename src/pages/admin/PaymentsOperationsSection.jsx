import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import { AdminTableActions, AdminTableActionsEmpty } from '../../components/admin/AdminTableCells.jsx'
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
import AthletePaymentOrdersSection from './AthletePaymentOrdersSection.jsx'
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
  highlightOrderId = null,
  ticketOrderEventScope = '',
  pendingTicketOrders,
  isLoading: manualLoading,
  loadError: manualError,
  onApprovePayment,
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

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!ticketOrderEventScope || loading) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('admin-ticket-orders')?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, ticketOrderEventScope])

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
    ? Number(summary.health.athleteOrderDrift ?? 0) +
      Number(summary.health.ticketOrderDrift ?? 0) +
      Number(summary.health.staleEventLocks ?? 0) +
      Number(summary.health.staleReconciliationLocks ?? 0) +
      Number(summary.health.exhaustedEvents ?? 0)
    : null
  const failedCount = summary.events?.failed ?? 0
  const pendingReconciliations = summary.attempts?.reconciliationPending ?? 0
  const runtimeReady = data?.configuration?.ready !== false
  const isLedgerHealthy =
    Boolean(data) &&
    runtimeReady &&
    failedCount === 0 &&
    pendingReconciliations === 0 &&
    summary.health?.healthy !== false

  const primaryMetrics = [
    {
      id: 'integrity',
      label: t('admin.paymentOperations.integrity'),
      value: summary.health?.healthy
        ? (runtimeReady
            ? t('admin.paymentOperations.integrityOk')
            : t('admin.paymentOperations.configurationBlocked'))
        : (healthIssues ?? '—'),
      tone: summary.health?.healthy && runtimeReady ? 'success' : 'danger',
    },
    {
      id: 'failed',
      label: t('admin.paymentOperations.failedEvents'),
      value: failedCount,
      tone: failedCount > 0 ? 'danger' : 'neutral',
    },
    {
      id: 'pending',
      label: t('admin.paymentOperations.pendingReconciliations'),
      value: pendingReconciliations,
      tone: pendingReconciliations > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'pastDue',
      label: t('admin.paymentOperations.pastDueSubscriptions'),
      value: summary.subscriptions?.pastDue ?? 0,
      tone: (summary.subscriptions?.pastDue ?? 0) > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'processed',
      label: t('admin.paymentOperations.processedEvents'),
      value: summary.events?.processed ?? 0,
      tone: 'neutral',
    },
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

  const showHealthyEmpty =
    !loading &&
    !error &&
    operationRows.length === 0 &&
    isLedgerHealthy &&
    (!status || status === 'failed')

  return (
    <div className="admin-payments-operations">
      <section className="admin-payment-ops" aria-labelledby="payment-ops-title">
        <header className="admin-payment-ops__header">
          <div className="admin-payment-ops__intro">
            <span className="admin-payment-ops__eyebrow">
              <ShieldCheck size={14} aria-hidden /> Mercado Pago
            </span>
            <h2 id="payment-ops-title">{t('admin.paymentOperations.title')}</h2>
            <p className="admin-payment-ops__subtitle">{t('admin.paymentOperations.subtitle')}</p>
            {data?.configuration ? (
              <ul className="admin-payment-ops__healthy-facts">
                <li>
                  <span>{t('admin.paymentOperations.provider')}</span>
                  <strong>{data.configuration.provider === 'mock' ? 'Mock' : 'Mercado Pago'}</strong>
                </li>
                <li>
                  <span>{t('admin.paymentOperations.webhook')}</span>
                  <strong>{t(data.configuration.webhookConfigured
                    ? 'admin.paymentOperations.configured'
                    : 'admin.paymentOperations.missing')}</strong>
                </li>
                <li>
                  <span>{t('admin.paymentOperations.processingMode')}</span>
                  <strong>{t(data.configuration.webhookProcessingMode === 'deferred'
                    ? 'admin.paymentOperations.deferred'
                    : 'admin.paymentOperations.inline')}</strong>
                </li>
              </ul>
            ) : null}
          </div>
          <div className="admin-payment-ops__toolbar">
            {data?.configuration ? (
              <span
                className={
                  data.configuration.recoveryEnabled
                    ? 'admin-payment-ops__worker is-active'
                    : 'admin-payment-ops__worker'
                }
              >
                <span aria-hidden />
                {t(
                  data.configuration.recoveryEnabled
                    ? 'admin.paymentOperations.workerActive'
                    : 'admin.paymentOperations.workerInactive',
                )}
              </span>
            ) : null}
            <div className="admin-payment-ops__actions">
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw size={14} aria-hidden /> {t('admin.paymentOperations.refresh')}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={handleRecover}
                  disabled={recovering}
                >
                  <RotateCcw size={14} aria-hidden /> {t('admin.paymentOperations.recover')}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div
          className="admin-payment-ops__ledger"
          aria-label={t('admin.paymentOperations.signalAria')}
        >
          {primaryMetrics.map((metric) => (
            <article
              key={metric.id}
              className={`admin-payment-ops__metric admin-payment-ops__metric--${metric.tone}`}
            >
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </div>

        <div className="admin-payment-ops__filter">
          <AdminFilterChipGroup
            id="payment-ops-status"
            label={t('admin.filters.status')}
            value={status}
            onChange={setStatus}
            compact
            inline
            defaultValue=""
            omitNeutral
            allLabel={t('admin.filters.showingAll')}
            clearable
            hideEmpty
            options={[
              ['', t('admin.paymentOperations.allEvents')],
              ['failed', t('admin.paymentOperations.failed'), summary.events?.failed],
              ['processing', t('admin.paymentOperations.processing'), summary.events?.processing],
              ['processed', t('admin.paymentOperations.processed'), summary.events?.processed],
            ]}
          />
          {summary.updatedAt ? (
            <small className="admin-payment-ops__filter-meta">
              {t('admin.paymentOperations.updatedAt', {
                date: formatDate(summary.updatedAt, locale),
              })}
            </small>
          ) : null}
        </div>

        {error ? (
          <ErrorState message={error} onRetry={load} retryLabel={t('common.retry')} />
        ) : loading && !data ? (
          <LoadingState label={t('admin.paymentOperations.loading')} />
        ) : showHealthyEmpty ? (
          <div className="admin-empty admin-empty--payment-ops">
            <span className="admin-empty__icon" aria-hidden>
              <ShieldCheck size={22} strokeWidth={1.6} />
            </span>
            <h3 className="admin-empty__title">{t('admin.paymentOperations.emptyHealthyTitle')}</h3>
            <p className="admin-empty__lead">{t('admin.paymentOperations.emptyHealthyLead')}</p>
          </div>
        ) : (
          <AdminDataTable
            variant="admin"
            emptyMessage={t('admin.paymentOperations.empty')}
            rows={operationRows}
            columns={[
              {
                key: 'event_type',
                label: t('admin.paymentOperations.type'),
                mobile: 'primary',
                sortable: true,
              },
              {
                key: 'resource_id',
                label: t('admin.paymentOperations.resource'),
                mobile: 'default',
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
                key: 'attempts_count',
                label: t('admin.paymentOperations.attempts'),
                mobile: 'default',
                desktop: 'numeric',
                align: 'end',
                sortable: true,
                render: (row) => `${row.attempts_count}/${row.max_attempts}`,
              },
              {
                key: 'last_attempt_at',
                label: t('admin.paymentOperations.lastAttempt'),
                mobile: 'default',
                sortable: true,
                render: (row) => formatDate(row.last_attempt_at, locale),
              },
              {
                key: 'error',
                label: t('admin.paymentOperations.detail'),
                mobile: 'hidden',
                render: (row) => row.error || '—',
              },
              {
                key: 'actions',
                label: t('admin.columns.action'),
                mobile: 'action',
                className: 'data-table__column--actions',
                render: (row) => {
                  if (!['failed', 'pending'].includes(row.status) || !canEdit) {
                    return <AdminTableActionsEmpty />
                  }

                  const retrying = retryingId === row.id

                  return (
                    <AdminTableActions>
                      <AdminIconButton
                        disabled={retrying}
                        icon={retrying ? LoaderCircle : RotateCcw}
                        label={t('admin.paymentOperations.retry')}
                        onClick={() => handleRetry(row)}
                        variant="ghost"
                      />
                    </AdminTableActions>
                  )
                },
              },
            ]}
          />
        )}
      </section>

      <AthletePaymentOrdersSection
        canEdit={canEdit}
        highlightOrderId={highlightOrderId}
        onApprovePayment={onApprovePayment}
      />

      <div id="admin-ticket-orders" className="admin-ticket-orders-anchor">
        <TicketOrdersSection
          canEdit={canEdit}
          initialQuery={ticketOrderEventScope}
          pendingTicketOrders={pendingTicketOrders}
          isLoading={manualLoading}
          loadError={manualError}
          onApproveTicketOrder={onApproveTicketOrder}
          onRefresh={onRefreshManual}
        />
      </div>
    </div>
  )
}
