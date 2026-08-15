import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeDollarSign,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ScanSearch,
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
  revalidatePaymentOrder,
  revalidatePaymentOrders,
} from '../../services/paymentService.js'
import { fetchPlatformFeatureToggles } from '../../services/platformSettingsAdminService.js'
import AthletePaymentOrdersSection from './AthletePaymentOrdersSection.jsx'
import TicketOrdersSection from './TicketOrdersSection.jsx'

/**
 * Interruptores de validación por concepto. Todo habilitado es el estado por
 * defecto y también el fallback: un rol acotado puede no tener
 * `admin.registration_access.read` y recibir 403 al leerlos. En ese caso no se
 * deshabilita nada y el 409 del backend sigue siendo la última palabra — es
 * preferible a bloquear la caja de Finanzas por una lectura que falló.
 */
const VALIDATION_OPEN = Object.freeze({ membership: true, registration: true, ticket: true })

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
  onForceSettlePayment,
  onRejectPayment,
  onApproveTicketOrder,
  onRejectTicketOrder,
  onRefresh: onRefreshManual,
}) {
  const { locale, t } = useI18n()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [revalidating, setRevalidating] = useState(false)
  const [revalidation, setRevalidation] = useState(null)
  const [fixingOrderId, setFixingOrderId] = useState(null)
  const [status, setStatus] = useState('')
  const [validation, setValidation] = useState(VALIDATION_OPEN)
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

  const loadValidation = useCallback(async () => {
    try {
      const toggles = await fetchPlatformFeatureToggles()
      setValidation({
        membership: toggles.membershipValidationEnabled,
        registration: toggles.registrationValidationEnabled,
        ticket: toggles.ticketValidationEnabled,
      })
    } catch {
      setValidation(VALIDATION_OPEN)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setAthleteRefreshKey((key) => key + 1)
    await Promise.all([loadOps(), loadValidation(), onRefreshManual?.() ?? Promise.resolve()])
  }, [loadOps, loadValidation, onRefreshManual])

  useEffect(() => {
    void loadOps()
  }, [loadOps])

  useEffect(() => {
    void loadValidation()
  }, [loadValidation])

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

  /**
   * Barrido de diagnóstico: le pregunta a Mercado Pago por cada orden no
   * aprobada de la ventana y lista las que no coinciden. No escribe nada — la
   * corrección se decide fila por fila, con el estado del proveedor a la vista.
   */
  async function handleRevalidate() {
    setRevalidating(true)
    setError('')
    try {
      setRevalidation(await revalidatePaymentOrders({ sinceDays: 30, limit: 50 }))
    } catch (revalidateError) {
      setError(revalidateError?.message ?? t('admin.paymentOperations.revalidateError'))
    } finally {
      setRevalidating(false)
    }
  }

  async function handleFixDivergence(orderId) {
    setFixingOrderId(orderId)
    setError('')
    try {
      const result = await revalidatePaymentOrder(orderId)
      setRevalidation((current) => {
        if (!current) return current
        return {
          ...current,
          divergences: current.divergences.map((item) =>
            item.order?.id === orderId ? { ...item, ...result } : item,
          ),
        }
      })
      setAthleteRefreshKey((key) => key + 1)
    } catch (fixError) {
      setError(fixError?.message ?? t('admin.paymentOperations.revalidateError'))
    } finally {
      setFixingOrderId(null)
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

  const operationRows = useMemo(
    () =>
      [
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
      ].filter((row) => !status || row.status === status),
    [data?.events, data?.reconciliations, status, t],
  )

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

  // Diagnóstico accionable que arma el servidor: causa concreta y pasos, ya
  // agrupados por código para no repetir cincuenta veces el mismo problema.
  const blockers = Array.isArray(data?.blockers) ? data.blockers : []
  const showHealthCallout = Boolean(data) && (healthBreakdown.length > 0 || blockers.length > 0)

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
            <>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => void handleRevalidate()}
                disabled={revalidating || recovering}
              >
                {revalidating ? (
                  <LoaderCircle size={14} aria-hidden className="is-spinning" />
                ) : (
                  <ScanSearch size={14} aria-hidden />
                )}{' '}
                {t('admin.paymentOperations.revalidate')}
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => void handleRecover()}
                disabled={recovering}
              >
                <RotateCcw size={14} aria-hidden /> {t('admin.paymentOperations.recover')}
              </button>
            </>
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
            {blockers.length > 0 ? (
              <>
                <strong>{t('admin.paymentOperations.diagnosisTitle')}</strong>
                <ul className="admin-payments-ops-callout__diagnoses">
                  {blockers.map((item) => (
                    <li key={`${item.code}-${item.cause}`}>
                      <span className="admin-payments-ops-callout__diagnosis-title">
                        {item.title}
                        {item.affected > 1 ? (
                          <span className="admin-payments-ops-callout__diagnosis-count">
                            {t('admin.paymentOperations.diagnosisAffected', { count: item.affected })}
                          </span>
                        ) : null}
                      </span>
                      <span className="admin-payments-ops-callout__diagnosis-cause">{item.cause}</span>
                      {Array.isArray(item.fix) && item.fix.length > 0 ? (
                        <ol className="admin-payments-ops-callout__diagnosis-fix">
                          {item.fix.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Divergencias contra Mercado Pago: qué estado figura acá y cuál dice el
          proveedor, enfrentados. Es el bloque que responde "figura cancelado
          pero la plata entró" sin salir del panel. */}
      {revalidation ? (
        <section className="admin-payment-ops" aria-labelledby="payment-revalidation-title">
          <header className="admin-payment-ops__header admin-payment-ops__header--compact">
            <div className="admin-payment-ops__intro">
              <span className="admin-payment-ops__eyebrow">
                <ScanSearch size={14} aria-hidden /> {t('admin.paymentOperations.revalidateEyebrow')}
              </span>
              <h2 id="payment-revalidation-title">
                {t('admin.paymentOperations.revalidateTitle')}
              </h2>
              <p className="admin-payment-ops__subtitle">
                {t('admin.paymentOperations.revalidateSummary', {
                  checked: revalidation.summary?.checked ?? 0,
                  days: revalidation.summary?.sinceDays ?? 30,
                  divergent: revalidation.summary?.divergent ?? 0,
                })}
              </p>
            </div>
          </header>

          {(revalidation.divergences?.length ?? 0) === 0 ? (
            <p className="admin-payment-ops__healthy-line" role="status">
              <ShieldCheck size={16} aria-hidden />
              <span>{t('admin.paymentOperations.revalidateHealthy')}</span>
            </p>
          ) : (
            <AdminDataTable
              variant="admin"
              rows={revalidation.divergences.map((item) => ({
                id: item.order?.id,
                reference: item.order?.reference ?? item.order?.id,
                athlete: item.order?.athleteName ?? '—',
                amount: item.order?.amount ?? null,
                localStatus: item.localStatus,
                providerStatus: item.providerStatus,
                outcome: item.outcome,
                corrected: item.corrected,
                resultStatus: item.resultStatus,
              }))}
              emptyMessage={t('admin.paymentOperations.revalidateHealthy')}
              columns={[
                {
                  key: 'reference',
                  label: t('admin.columns.reference'),
                  mobile: 'primary',
                  sortable: true,
                },
                {
                  key: 'athlete',
                  label: t('admin.columns.athlete'),
                  mobile: 'default',
                },
                {
                  key: 'amount',
                  label: t('admin.columns.amount'),
                  mobile: 'hidden',
                  desktop: 'numeric',
                  align: 'end',
                  render: (row) => (row.amount == null ? '—' : money(row.amount, locale)),
                },
                {
                  key: 'localStatus',
                  label: t('admin.paymentOperations.revalidateLocal'),
                  mobile: 'badge',
                  render: (row) => <StatusBadge value={row.localStatus} />,
                },
                {
                  key: 'providerStatus',
                  label: t('admin.paymentOperations.revalidateProvider'),
                  mobile: 'badge',
                  render: (row) =>
                    row.providerStatus ? (
                      <StatusBadge value={row.providerStatus} />
                    ) : (
                      <span className="data-table__mono data-table__mono--empty">—</span>
                    ),
                },
                {
                  key: 'outcome',
                  label: t('admin.paymentOperations.detail'),
                  mobile: 'default',
                  render: (row) => t(`admin.paymentOperations.revalidateOutcome.${row.outcome}`),
                },
                {
                  key: 'actions',
                  label: t('admin.columns.action'),
                  mobile: 'action',
                  className: 'data-table__column--actions',
                  render: (row) => {
                    // Solo se corrige lo que el proveedor puede resolver solo.
                    // Un monto distinto o una orden ilegible se miran a mano.
                    if (!canEdit || row.corrected || row.outcome !== 'divergent') {
                      return <AdminTableActionsEmpty />
                    }
                    const fixing = fixingOrderId === row.id
                    return (
                      <AdminTableActions>
                        <AdminIconButton
                          disabled={fixing}
                          icon={fixing ? LoaderCircle : ScanSearch}
                          label={t('admin.paymentOperations.revalidateApply')}
                          onClick={() => void handleFixDivergence(row.id)}
                          variant="celeste"
                        />
                      </AdminTableActions>
                    )
                  },
                },
              ]}
            />
          )}
        </section>
      ) : null}

      <AthletePaymentOrdersSection
        canEdit={canEdit}
        canForceSettle={canEdit && Boolean(onForceSettlePayment)}
        validationEnabled={validation}
        highlightOrderId={highlightOrderId}
        onApprovePayment={onApprovePayment}
        onForceSettlePayment={onForceSettlePayment}
        onRejectPayment={onRejectPayment}
        onSummaryChange={handleAthleteSummaryChange}
        refreshKey={athleteRefreshKey}
        statusFilter={athleteStatusRequest}
      />

      <div id="admin-ticket-orders" className="admin-ticket-orders-anchor">
        <TicketOrdersSection
          canEdit={canEdit && validation.ticket}
          initialQuery={ticketOrderEventScope}
          pendingTicketOrders={pendingTicketOrders}
          isLoading={manualLoading}
          loadError={manualError}
          onApproveTicketOrder={onApproveTicketOrder}
          onRejectTicketOrder={onRejectTicketOrder}
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
                // El texto crudo del proveedor no le dice nada al operador. El
                // diagnóstico va adelante y el mensaje original queda como
                // título, para quien necesite el detalle textual.
                render: (row) => {
                  if (!row.error) return '—'
                  if (!row.diagnosis) return row.error
                  return (
                    <span className="admin-payment-ops__diagnosis" title={row.error}>
                      <strong>{row.diagnosis.title}</strong>
                      <small>{row.diagnosis.fix?.[0] ?? row.diagnosis.cause}</small>
                    </span>
                  )
                },
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
