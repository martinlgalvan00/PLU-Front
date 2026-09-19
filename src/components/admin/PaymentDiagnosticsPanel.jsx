import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  X,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import { AdminTableActions, AdminTableActionsEmpty } from './AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from './AdminDataTable.jsx'
import PaymentIntegrityCallout from './PaymentIntegrityCallout.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import LoadingState from '../ui/LoadingState.jsx'
import { money } from '../../lib/format.js'
import {
  formatPaymentOperationCardCopy,
  formatPaymentOperationType,
} from '../../services/paymentOperationsDisplay.js'
import {
  dismissPaymentDrift,
  getPaymentOperations,
  listPaymentDriftDismissals,
  recoverPaymentOperations,
  restorePaymentDriftDismissal,
  retryPaymentEvent,
  retryPaymentReconciliation,
  revalidatePaymentOrder,
  revalidatePaymentOrders,
} from '../../services/paymentService.js'

/**
 * PaymentDiagnosticsPanel — PLU ARG
 *
 * Era la pestaña "Diagnóstico" de Cobros. Se mudó a Auditoría: acá se lee
 * "qué hizo el sistema" (cobros, activaciones, credenciales), no en la cola
 * donde Finanzas procesa cobros manuales. La auditoría siempre se presenta
 * en español, así que `t` llega resuelto contra ese diccionario fijo — igual
 * que `PaymentIntegrityCallout`, que este panel reusa para no repetir el
 * resumen de blockers.
 */

// Auditoría es siempre en español: sin `useI18n()`, las fechas y montos se
// formatean fijos contra es-AR (mismo criterio que `AuditSection`).
const LOCALE = 'es'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatAttempts(row, t) {
  if (row?.attempts_count == null && row?.max_attempts == null) return null
  return t('admin.paymentOperations.attemptsOf', {
    current: row.attempts_count ?? 0,
    max: row.max_attempts ?? '—',
  })
}

function formatOperationWhenStack(row, t) {
  const items = []
  if (row?.received_at) {
    items.push([t('admin.paymentOperations.receivedAt'), formatDate(row.received_at)])
  }
  if (row?.processed_at) {
    items.push([t('admin.paymentOperations.processedAt'), formatDate(row.processed_at)])
  } else if (row?.last_attempt_at && row.last_attempt_at !== row.received_at) {
    items.push([t('admin.paymentOperations.lastAttempt'), formatDate(row.last_attempt_at)])
  }
  if (row?.status === 'failed' && row?.next_retry_at) {
    items.push([t('admin.paymentOperations.nextRetry'), formatDate(row.next_retry_at)])
  }
  if (items.length === 0) {
    const fallback = row?.last_attempt_at || row?.received_at || row?.processed_at
    return fallback ? formatDate(fallback) : null
  }
  if (items.length === 1) return items[0][1]
  return (
    <span className="admin-payment-ops__when-stack">
      {items.map(([label, value]) => (
        <span key={label}>
          <em>{label}</em>
          <time>{value}</time>
        </span>
      ))}
    </span>
  )
}

export default function PaymentDiagnosticsPanel({ canEdit, t }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [revalidating, setRevalidating] = useState(false)
  const [revalidation, setRevalidation] = useState(null)
  const [fixingOrderId, setFixingOrderId] = useState(null)
  // Descarte de drift no crítico: un motivo por vez, atado a
  // `orderKind:orderId` para que dos filas no compartan el mismo textbox.
  const [dismissingKey, setDismissingKey] = useState(null)
  const [dismissReason, setDismissReason] = useState('')
  const [dismissBusy, setDismissBusy] = useState(false)
  const [dismissError, setDismissError] = useState('')
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')
  const [dismissals, setDismissals] = useState([])
  const [status, setStatus] = useState('')

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

  useEffect(() => {
    void loadOps()
  }, [loadOps])

  async function handleRecover() {
    setRecovering(true)
    setError('')
    try {
      await recoverPaymentOperations()
      await loadOps()
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
    } catch (fixError) {
      setError(fixError?.message ?? t('admin.paymentOperations.revalidateError'))
    } finally {
      setFixingOrderId(null)
    }
  }

  const loadDismissals = useCallback(async () => {
    setAuditLoading(true)
    setAuditError('')
    try {
      const result = await listPaymentDriftDismissals()
      setDismissals(result?.dismissals ?? [])
    } catch (loadDismissalsError) {
      setAuditError(loadDismissalsError?.message ?? t('admin.paymentOperations.auditLoadError'))
    } finally {
      setAuditLoading(false)
    }
  }, [t])

  function startDismiss(orderKind, orderId) {
    setDismissingKey(`${orderKind}:${orderId}`)
    setDismissReason('')
    setDismissError('')
  }

  function cancelDismiss() {
    setDismissingKey(null)
    setDismissReason('')
    setDismissError('')
  }

  /**
   * Descarta una orden desalineada: no borra el hallazgo, lo saca de acá y lo
   * deja en la auditoría con el motivo. Si vuelve a desalinearse después de
   * restaurarlo, `get_payment_system_health` la vuelve a contar.
   */
  async function confirmDismiss(orderKind, orderId) {
    const reason = dismissReason.trim()
    if (reason.length < 3) return
    setDismissBusy(true)
    setDismissError('')
    try {
      await dismissPaymentDrift(orderKind, orderId, reason)
      setDismissingKey(null)
      setDismissReason('')
      await loadOps()
      if (auditOpen) await loadDismissals()
    } catch (dismissErrorCaught) {
      setDismissError(dismissErrorCaught?.message ?? t('admin.paymentOperations.dismissError'))
    } finally {
      setDismissBusy(false)
    }
  }

  async function toggleAudit() {
    const next = !auditOpen
    setAuditOpen(next)
    if (next) await loadDismissals()
  }

  async function restoreDismissal(dismissalId) {
    setAuditError('')
    try {
      await restorePaymentDriftDismissal(dismissalId)
      await Promise.all([loadDismissals(), loadOps()])
    } catch (restoreError) {
      setAuditError(restoreError?.message ?? t('admin.paymentOperations.auditRestoreError'))
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

  function renderLedgerRowActions(row, { compact = false } = {}) {
    if (!['failed', 'pending'].includes(row.status) || !canEdit) {
      return compact ? null : <AdminTableActionsEmpty />
    }

    const retrying = retryingId === row.id

    return (
      <AdminTableActions>
        <AdminIconButton
          disabled={retrying}
          icon={RotateCcw}
          spinning={retrying}
          label={t('admin.paymentOperations.retry')}
          onClick={() => handleRetry(row)}
          variant="ghost"
        />
      </AdminTableActions>
    )
  }

  const summary = data?.summary ?? {}
  const health = summary.health ?? null
  const healthIssues = health
    ? Number(health.athleteOrderDrift ?? 0) +
      Number(health.ticketOrderDrift ?? 0) +
      Number(health.staleEventLocks ?? 0) +
      Number(health.staleReconciliationLocks ?? 0) +
      Number(health.exhaustedEvents ?? 0)
    : null
  const openDriftFindings = [
    ...(Array.isArray(health?.openAthleteDrift) ? health.openAthleteDrift : []).map((item) => ({
      ...item,
      orderKind: 'athlete',
    })),
    ...(Array.isArray(health?.openTicketDrift) ? health.openTicketDrift : []).map((item) => ({
      ...item,
      orderKind: 'ticket',
    })),
  ]
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

  const blockers = Array.isArray(data?.blockers) ? data.blockers : []

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

  return (
    <section className="admin-payment-ops" aria-label={t('admin.audit.tabDiagnostics')}>
      <PaymentIntegrityCallout health={health} blockers={blockers} t={t} />

      {(canEdit || data?.configuration) ? (
        <div className="admin-payment-ops__chrome">
          {data?.configuration ? (
            <ul
              className="admin-payment-ops__signals admin-payment-ops__signals--line"
              aria-label={t('admin.paymentOperations.runtimeSignalsAria')}
            >
              <li className="admin-payment-ops__chip">
                <span className="admin-payment-ops__chip-label">
                  {t('admin.paymentOperations.provider')}
                </span>
                <strong className="admin-payment-ops__chip-value">
                  {data.configuration.provider === 'mock' ? 'Mock' : 'Mercado Pago'}
                </strong>
              </li>
              <li
                className={[
                  'admin-payment-ops__chip',
                  data.configuration.webhookConfigured
                    ? 'admin-payment-ops__chip--ok'
                    : 'admin-payment-ops__chip--warn',
                ].join(' ')}
              >
                <span className="admin-payment-ops__chip-label">
                  {t('admin.paymentOperations.webhook')}
                </span>
                <strong className="admin-payment-ops__chip-value">
                  {t(
                    data.configuration.webhookConfigured
                      ? 'admin.paymentOperations.configured'
                      : 'admin.paymentOperations.missing',
                  )}
                </strong>
              </li>
              <li className="admin-payment-ops__chip">
                <span className="admin-payment-ops__chip-label">
                  {t('admin.paymentOperations.processingMode')}
                </span>
                <strong className="admin-payment-ops__chip-value">
                  {t(
                    data.configuration.webhookProcessingMode === 'deferred'
                      ? 'admin.paymentOperations.deferred'
                      : 'admin.paymentOperations.inline',
                  )}
                </strong>
              </li>
              <li
                className={[
                  'admin-payment-ops__chip',
                  data.configuration.recoveryEnabled
                    ? 'admin-payment-ops__chip--ok'
                    : 'admin-payment-ops__chip--warn',
                ].join(' ')}
              >
                <span className="admin-payment-ops__chip-label">
                  {t('admin.paymentOperations.recovery')}
                </span>
                <strong className="admin-payment-ops__chip-value">
                  {t(
                    data.configuration.recoveryEnabled
                      ? 'admin.paymentOperations.recoveryOn'
                      : 'admin.paymentOperations.recoveryOff',
                  )}
                </strong>
              </li>
            </ul>
          ) : null}

          {canEdit ? (
            <div className="admin-payment-ops__tools" aria-label={t('admin.paymentOperations.toolsLabel')}>
              <button
                type="button"
                className="btn btn--ghost btn--small"
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
                disabled={recovering || revalidating}
              >
                <RotateCcw size={14} aria-hidden /> {t('admin.paymentOperations.recover')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {revalidation ? (
        <section className="admin-payment-ops" aria-labelledby="payment-revalidation-title">
          <header className="admin-payment-ops__header admin-payment-ops__header--compact">
            <div className="admin-payment-ops__intro">
              <span className="admin-payment-ops__eyebrow">
                <ScanSearch size={14} aria-hidden /> {t('admin.paymentOperations.revalidateEyebrow')}
              </span>
              <h2 id="payment-revalidation-title">{t('admin.paymentOperations.revalidateTitle')}</h2>
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
                { key: 'reference', label: t('admin.columns.reference'), mobile: 'primary', sortable: true },
                { key: 'athlete', label: t('admin.columns.athlete'), mobile: 'default' },
                {
                  key: 'amount',
                  label: t('admin.columns.amount'),
                  mobile: 'hidden',
                  desktop: 'numeric',
                  align: 'end',
                  render: (row) => (row.amount == null ? '—' : money(row.amount, LOCALE)),
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

      <div className="admin-payment-ops__ledger" aria-label={t('admin.paymentOperations.signalAria')}>
        {primaryMetrics.map((metric) => (
          <article key={metric.id} className={`admin-payment-ops__metric admin-payment-ops__metric--${metric.tone}`}>
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
            {t('admin.paymentOperations.updatedAt', { date: formatDate(summary.updatedAt) })}
          </small>
        ) : null}
      </div>

      {data ? (
        <div className="admin-payment-ops__drift">
          <div className="admin-payment-ops__drift-head">
            {openDriftFindings.length > 0 ? (
              <>
                <AlertTriangle size={15} aria-hidden className="admin-payment-ops__drift-icon" />
                <strong>{t('admin.paymentOperations.driftTitle')}</strong>
              </>
            ) : (
              <>
                <ShieldCheck
                  size={15}
                  aria-hidden
                  className="admin-payment-ops__drift-icon admin-payment-ops__drift-icon--ok"
                />
                <strong>{t('admin.paymentOperations.driftHealthyTitle')}</strong>
              </>
            )}
            <button
              type="button"
              className="admin-payment-ops__audit-toggle"
              onClick={() => void toggleAudit()}
              aria-expanded={auditOpen}
            >
              {t('admin.paymentOperations.auditToggle', {
                count: dismissals.filter((item) => !item.restored_at).length,
              })}
              <ChevronDown
                size={12}
                aria-hidden
                style={{ transition: 'transform .2s ease', transform: auditOpen ? 'rotate(180deg)' : undefined }}
              />
            </button>
          </div>

          {openDriftFindings.length > 0 ? (
            <ul className="admin-payment-ops__drift-list">
              {openDriftFindings.map((finding) => {
                const key = `${finding.orderKind}:${finding.orderId}`
                const isConfirming = dismissingKey === key
                const titleKey =
                  finding.orderKind === 'athlete'
                    ? 'admin.paymentOperations.driftAthleteRow'
                    : 'admin.paymentOperations.driftTicketRow'
                return (
                  <li key={key} className="admin-payment-ops__drift-row">
                    <div className="admin-payment-ops__drift-row-head">
                      <div className="admin-payment-ops__drift-row-copy">
                        <div className="admin-payment-ops__drift-row-title">
                          {t(titleKey, { reference: finding.reference ?? finding.orderId })}
                        </div>
                        <div className="admin-payment-ops__drift-row-meta">
                          {t('admin.paymentOperations.driftRowMeta', {
                            local: finding.localStatus,
                            expected: finding.expectedStatus,
                          })}
                        </div>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          className="admin-payment-ops__drift-dismiss-btn"
                          onClick={() => startDismiss(finding.orderKind, finding.orderId)}
                          aria-label={t('admin.paymentOperations.dismissDrift')}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      ) : null}
                    </div>

                    {isConfirming ? (
                      <div className="admin-payment-ops__drift-confirm">
                        <label htmlFor={`dismiss-reason-${key}`}>
                          {t('admin.paymentOperations.dismissReasonLabel')}
                        </label>
                        <input
                          id={`dismiss-reason-${key}`}
                          type="text"
                          className="admin-payment-ops__drift-confirm-input"
                          value={dismissReason}
                          onChange={(event) => setDismissReason(event.target.value)}
                          placeholder={t('admin.paymentOperations.dismissReasonPlaceholder')}
                        />
                        {dismissError ? (
                          <p className="admin-payment-ops__drift-confirm-error">{dismissError}</p>
                        ) : null}
                        <div className="admin-payment-ops__drift-confirm-actions">
                          <button type="button" className="btn btn--ghost btn--small" onClick={cancelDismiss}>
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            className="btn btn--small"
                            disabled={dismissBusy || dismissReason.trim().length < 3}
                            onClick={() => void confirmDismiss(finding.orderKind, finding.orderId)}
                          >
                            {dismissBusy ? <LoaderCircle size={14} aria-hidden className="is-spinning" /> : null}{' '}
                            {t('admin.paymentOperations.dismissConfirm')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}

          {auditOpen ? (
            <div className="admin-payment-ops__audit-panel">
              {auditLoading ? (
                <LoadingState label={t('admin.paymentOperations.loading')} />
              ) : auditError ? (
                <ErrorState message={auditError} onRetry={loadDismissals} retryLabel={t('common.retry')} />
              ) : dismissals.length === 0 ? (
                <p className="admin-payment-ops__audit-empty">{t('admin.paymentOperations.auditEmpty')}</p>
              ) : (
                <ul className="admin-payment-ops__audit-list">
                  {dismissals.map((item) => {
                    const titleKey =
                      item.order_kind === 'athlete'
                        ? 'admin.paymentOperations.driftAthleteRow'
                        : 'admin.paymentOperations.driftTicketRow'
                    return (
                      <li key={item.id} className="admin-payment-ops__audit-row">
                        <div className="admin-payment-ops__audit-row-copy">
                          <div className="admin-payment-ops__audit-row-title">
                            {t(titleKey, { reference: item.reference ?? item.order_id })}
                          </div>
                          <div className="admin-payment-ops__audit-row-meta">
                            {t('admin.paymentOperations.auditRowMeta', {
                              reason: item.reason,
                              date: formatDate(item.dismissed_at),
                            })}
                            {item.restored_at ? ` · ${t('admin.paymentOperations.auditRestored')}` : ''}
                          </div>
                        </div>
                        {canEdit && !item.restored_at ? (
                          <button
                            type="button"
                            className="admin-payment-ops__restore-btn"
                            onClick={() => void restoreDismissal(item.id)}
                          >
                            {t('admin.paymentOperations.auditRestore')}
                          </button>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <ErrorState message={error} onRetry={loadOps} retryLabel={t('common.retry')} />
      ) : loading && !data ? (
        <LoadingState label={t('admin.paymentOperations.loading')} />
      ) : showHealthyEmpty ? (
        <div className="admin-payment-ops__healthy" role="status">
          <ShieldCheck size={20} aria-hidden />
          <div>
            <strong>{t('admin.paymentOperations.emptyHealthyTitle')}</strong>
            <p>{t('admin.paymentOperations.emptyHealthyLead')}</p>
            {summary.updatedAt ? (
              <small>{t('admin.paymentOperations.updatedAt', { date: formatDate(summary.updatedAt) })}</small>
            ) : null}
          </div>
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
              render: (row) => formatPaymentOperationType(row, t),
              mobileRender: (row) => {
                const { headline, context } = formatPaymentOperationCardCopy(row, t)
                return (
                  <span className="data-table__identity-copy">
                    <strong>{headline}</strong>
                    {context ? <span className="data-table__sub">{context}</span> : null}
                  </span>
                )
              },
            },
            {
              key: 'resource_id',
              label: t('admin.paymentOperations.resource'),
              mobile: 'default',
              mobileMeta: 'labeled',
              sortable: true,
              render: (row) => row.resource_id || '—',
              mobileRender: (row) => row.resource_id || null,
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
              mobileMeta: 'labeled',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
              render: (row) => `${row.attempts_count}/${row.max_attempts}`,
              mobileRender: (row) => formatAttempts(row, t),
            },
            {
              key: 'last_attempt_at',
              label: t('admin.paymentOperations.when'),
              mobile: 'default',
              mobileMeta: 'labeled',
              sortable: true,
              render: (row) => formatDate(row.processed_at || row.last_attempt_at || row.received_at),
              mobileRender: (row) => formatOperationWhenStack(row, t),
            },
            {
              key: 'error',
              label: t('admin.paymentOperations.detail'),
              mobile: 'default',
              mobileMeta: 'labeled',
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
              mobileRender: (row) => {
                if (!row.error && !row.diagnosis) return null
                if (!row.diagnosis) return row.error
                return (
                  <span className="admin-payment-ops__diagnosis" title={row.error}>
                    <strong>{row.diagnosis.title}</strong>
                    {row.diagnosis.cause ? <small>{row.diagnosis.cause}</small> : null}
                  </span>
                )
              },
            },
            {
              key: 'actions',
              label: t('admin.columns.action'),
              mobile: 'action',
              className: 'data-table__column--actions',
              render: (row) => renderLedgerRowActions(row),
              mobileRender: (row) => renderLedgerRowActions(row, { compact: true }),
            },
          ]}
        />
      )}
    </section>
  )
}
