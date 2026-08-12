import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeDollarSign,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Webhook,
} from 'lucide-react'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import { AdminTableActions, AdminTableActionsEmpty } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
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

function scrollToId(id) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({
    block: 'start',
    behavior: reduceMotion ? 'auto' : 'smooth',
  })
}

function OpsKpi({ icon: Icon, label, value, hint, tone, onClick }) {
  return (
    <button
      type="button"
      className={`admin-payments-ops-strip__kpi admin-payments-ops-strip__kpi--${tone}`}
      onClick={onClick}
    >
      <span className="admin-payments-ops-strip__kpi-icon" aria-hidden>
        <Icon size={15} strokeWidth={1.7} />
      </span>
      <span className="admin-payments-ops-strip__kpi-body">
        <span className="admin-payments-ops-strip__kpi-value">{value}</span>
        <span className="admin-payments-ops-strip__kpi-label">{label}</span>
        {hint ? <span className="admin-payments-ops-strip__kpi-hint">{hint}</span> : null}
      </span>
    </button>
  )
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
  const [athleteRefreshKey, setAthleteRefreshKey] = useState(0)
  const [athleteStatusRequest, setAthleteStatusRequest] = useState(null)
  const [athleteSummary, setAthleteSummary] = useState({
    pending: null,
    openAmount: null,
    loading: true,
  })

  const loadOps = useCallback(async () => {
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

  const refreshAll = useCallback(async () => {
    setAthleteRefreshKey((key) => key + 1)
    await Promise.all([loadOps(), onRefreshManual?.() ?? Promise.resolve()])
  }, [loadOps, onRefreshManual])

  useEffect(() => {
    void loadOps()
  }, [loadOps])

  useEffect(() => {
    if (!ticketOrderEventScope || loading) return undefined
    const frame = window.requestAnimationFrame(() => {
      scrollToId('admin-ticket-orders')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, ticketOrderEventScope])

  async function handleRecover() {
    setRecovering(true)
    setError('')
    try {
      await recoverPaymentOperations()
      await refreshAll()
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
      await loadOps()
    } catch (retryError) {
      setError(retryError?.message ?? t('admin.paymentOperations.retryError'))
    } finally {
      setRetryingId(null)
    }
  }

  const handleAthleteSummaryChange = useCallback((summary) => {
    setAthleteSummary(summary)
  }, [])

  const summary = data?.summary ?? {}
  const health = summary.health ?? null
  const healthIssues = health
    ? Number(health.athleteOrderDrift ?? 0) +
      Number(health.ticketOrderDrift ?? 0) +
      Number(health.staleEventLocks ?? 0) +
      Number(health.staleReconciliationLocks ?? 0) +
      Number(health.exhaustedEvents ?? 0)
    : null
  const failedCount = summary.events?.failed ?? 0
  const pendingReconciliations = summary.attempts?.reconciliationPending ?? 0
  const pastDue = summary.subscriptions?.pastDue ?? 0
  const runtimeReady = data?.configuration?.ready !== false
  const isLedgerHealthy =
    Boolean(data) &&
    runtimeReady &&
    failedCount === 0 &&
    pendingReconciliations === 0 &&
    pastDue === 0 &&
    health?.healthy !== false

  const ticketPendingCount = pendingTicketOrders?.length ?? 0
  const ticketsWithProof = useMemo(
    () => (pendingTicketOrders ?? []).filter((order) => order.paymentProofPath).length,
    [pendingTicketOrders],
  )

  const primaryMetrics = [
    {
      id: 'integrity',
      label: t('admin.paymentOperations.integrity'),
      value: health?.healthy
        ? runtimeReady
          ? t('admin.paymentOperations.integrityOk')
          : t('admin.paymentOperations.configurationBlocked')
        : (healthIssues ?? '—'),
      tone: health?.healthy && runtimeReady ? 'success' : 'danger',
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
      value: pastDue,
      tone: pastDue > 0 ? 'warning' : 'neutral',
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

  const athletePending =
    athleteSummary.loading || athleteSummary.pending == null ? null : athleteSummary.pending
  const athleteOpenAmount =
    athleteSummary.loading || athleteSummary.openAmount == null
      ? null
      : athleteSummary.openAmount

  const integrityTone =
    !data || loading
      ? 'neutral'
      : !isLedgerHealthy || pastDue > 0
        ? 'danger'
        : 'success'

  const integrityValue = !data || loading
    ? '—'
    : !isLedgerHealthy
      ? (healthIssues ?? t('admin.paymentOperations.integrityAlert'))
      : pastDue > 0
        ? pastDue
        : t('admin.paymentOperations.integrityOk')

  const integrityHint = !data || loading
    ? null
    : !isLedgerHealthy
      ? t('admin.paymentOperations.kpiIntegrityHintIssue')
      : pastDue > 0
        ? t('admin.paymentOperations.kpiIntegrityHintMora', { count: pastDue })
        : null

  const healthBreakdown = []
  if (health && health.healthy === false) {
    if (Number(health.athleteOrderDrift ?? 0) > 0) {
      healthBreakdown.push(
        t('admin.paymentOperations.healthAthleteDrift', { count: health.athleteOrderDrift }),
      )
    }
    if (Number(health.ticketOrderDrift ?? 0) > 0) {
      healthBreakdown.push(
        t('admin.paymentOperations.healthTicketDrift', { count: health.ticketOrderDrift }),
      )
    }
    if (Number(health.staleEventLocks ?? 0) > 0) {
      healthBreakdown.push(
        t('admin.paymentOperations.healthStaleEventLocks', { count: health.staleEventLocks }),
      )
    }
    if (Number(health.staleReconciliationLocks ?? 0) > 0) {
      healthBreakdown.push(
        t('admin.paymentOperations.healthStaleReconciliationLocks', {
          count: health.staleReconciliationLocks,
        }),
      )
    }
    if (Number(health.exhaustedEvents ?? 0) > 0) {
      healthBreakdown.push(
        t('admin.paymentOperations.healthExhaustedEvents', { count: health.exhaustedEvents }),
      )
    }
  }

  const configIssues = Array.isArray(data?.configuration?.issues)
    ? data.configuration.issues.filter(Boolean)
    : []
  const showHealthCallout =
    Boolean(data) && (healthBreakdown.length > 0 || (!runtimeReady && configIssues.length > 0))

  function focusAthletes() {
    setAthleteStatusRequest({ status: 'pending', at: Date.now() })
    scrollToId('admin-athlete-payments')
  }

  function focusTickets() {
    scrollToId('admin-ticket-orders')
  }

  function focusLedger(nextStatus = '') {
    setStatus(nextStatus)
    scrollToId('admin-payment-ledger')
  }

  return (
    <div className="admin-payments-operations">
      <div className="admin-payments-ops-strip" aria-label={t('admin.paymentOperations.opsStripAria')}>
        <div className="admin-payments-ops-strip__kpis">
          <OpsKpi
            icon={BadgeDollarSign}
            label={t('admin.paymentOperations.kpiAthletes')}
            value={athletePending == null ? '—' : athletePending}
            hint={
              athleteOpenAmount != null && athleteOpenAmount > 0
                ? t('admin.paymentOperations.kpiAthletesHint', {
                    amount: money(athleteOpenAmount, locale),
                  })
                : null
            }
            tone={athletePending > 0 ? 'warning' : 'neutral'}
            onClick={focusAthletes}
          />
          <OpsKpi
            icon={Ticket}
            label={t('admin.paymentOperations.kpiTickets')}
            value={manualLoading && ticketPendingCount === 0 ? '—' : ticketPendingCount}
            hint={
              ticketsWithProof > 0
                ? t('admin.paymentOperations.kpiTicketsHint', { count: ticketsWithProof })
                : null
            }
            tone={ticketPendingCount > 0 ? 'warning' : 'neutral'}
            onClick={focusTickets}
          />
          <OpsKpi
            icon={Webhook}
            label={t('admin.paymentOperations.kpiFailed')}
            value={loading && !data ? '—' : failedCount}
            tone={failedCount > 0 ? 'danger' : 'neutral'}
            onClick={() => focusLedger('failed')}
          />
          <OpsKpi
            icon={RotateCcw}
            label={t('admin.paymentOperations.kpiReconciliations')}
            value={loading && !data ? '—' : pendingReconciliations}
            tone={pendingReconciliations > 0 ? 'warning' : 'neutral'}
            onClick={() => focusLedger('')}
          />
          <OpsKpi
            icon={integrityTone === 'danger' ? ShieldAlert : ShieldCheck}
            label={t('admin.paymentOperations.kpiIntegrity')}
            value={integrityValue}
            hint={integrityHint}
            tone={integrityTone}
            onClick={() => focusLedger('')}
          />
        </div>
        <div className="admin-payments-ops-strip__actions">
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => void refreshAll()}
            disabled={loading || recovering}
          >
            <RefreshCw size={14} aria-hidden /> {t('admin.paymentOperations.refresh')}
          </button>
          {canEdit ? (
            <button
              type="button"
              className="btn btn--small"
              onClick={() => void handleRecover()}
              disabled={recovering}
            >
              <RotateCcw size={14} aria-hidden /> {t('admin.paymentOperations.recover')}
            </button>
          ) : null}
        </div>
      </div>

      {showHealthCallout ? (
        <div className="admin-payments-ops-callout" role="status">
          <AlertTriangle size={16} aria-hidden />
          <div className="admin-payments-ops-callout__body">
            {healthBreakdown.length > 0 ? (
              <>
                <strong>{t('admin.paymentOperations.healthCalloutTitle')}</strong>
                <ul>
                  {healthBreakdown.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {!runtimeReady && configIssues.length > 0 ? (
              <>
                <strong>{t('admin.paymentOperations.configIssuesTitle')}</strong>
                <ul>
                  {configIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <AthletePaymentOrdersSection
        canEdit={canEdit}
        highlightOrderId={highlightOrderId}
        onApprovePayment={onApprovePayment}
        onSummaryChange={handleAthleteSummaryChange}
        refreshKey={athleteRefreshKey}
        statusFilter={athleteStatusRequest}
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

      <section
        id="admin-payment-ledger"
        className="admin-payment-ops"
        aria-labelledby="payment-ops-title"
      >
        <header className="admin-payment-ops__header admin-payment-ops__header--compact">
          <div className="admin-payment-ops__intro">
            <span className="admin-payment-ops__eyebrow">
              <ShieldCheck size={14} aria-hidden /> Mercado Pago
            </span>
            <h2 id="payment-ops-title">{t('admin.paymentOperations.title')}</h2>
            <p className="admin-payment-ops__subtitle">{t('admin.paymentOperations.subtitle')}</p>
            {data?.configuration ? (
              <p className="admin-payment-ops__meta-line">
                <span>
                  {t('admin.paymentOperations.provider')}:{' '}
                  <strong>
                    {data.configuration.provider === 'mock' ? 'Mock' : 'Mercado Pago'}
                  </strong>
                </span>
                <span aria-hidden>·</span>
                <span>
                  {t('admin.paymentOperations.webhook')}:{' '}
                  <strong>
                    {t(
                      data.configuration.webhookConfigured
                        ? 'admin.paymentOperations.configured'
                        : 'admin.paymentOperations.missing',
                    )}
                  </strong>
                </span>
                <span aria-hidden>·</span>
                <span>
                  {t('admin.paymentOperations.processingMode')}:{' '}
                  <strong>
                    {t(
                      data.configuration.webhookProcessingMode === 'deferred'
                        ? 'admin.paymentOperations.deferred'
                        : 'admin.paymentOperations.inline',
                    )}
                  </strong>
                </span>
              </p>
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
          <small className="admin-payment-ops__filter-meta">
            {summary.updatedAt
              ? t('admin.paymentOperations.updatedAt', {
                  date: formatDate(summary.updatedAt, locale),
                })
              : null}
            {summary.events?.processed != null ? (
              <>
                {summary.updatedAt ? ' · ' : null}
                {t('admin.paymentOperations.processedEvents')}: {summary.events.processed}
              </>
            ) : null}
          </small>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={loadOps} retryLabel={t('common.retry')} />
        ) : loading && !data ? (
          <LoadingState label={t('admin.paymentOperations.loading')} />
        ) : showHealthyEmpty ? (
          <p className="admin-payment-ops__healthy-line" role="status">
            <ShieldCheck size={16} aria-hidden />
            <span>
              {t('admin.paymentOperations.emptyHealthyCompact')}
              {summary.updatedAt
                ? ` · ${t('admin.paymentOperations.updatedAt', {
                    date: formatDate(summary.updatedAt, locale),
                  })}`
                : null}
            </span>
          </p>
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
    </div>
  )
}
