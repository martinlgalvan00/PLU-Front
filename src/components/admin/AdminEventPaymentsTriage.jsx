import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  Eye,
  Paperclip,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import PaymentValidationAction from './PaymentValidationAction.jsx'
import PaymentValidationDialog from './PaymentValidationDialog.jsx'
import StatusPill from '../ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import {
  canValidateManualOrder,
  buildPaymentValidationItem,
} from '../../services/paymentValidationService.js'
import { buildEventPaymentTriage } from '../../services/eventPaymentTriage.js'

/**
 * Triage de pagos del meet: pendientes, problemas y en regla, con validación
 * rápida sin salir a Finanzas. Los datos vienen del snapshot admin ya cargado.
 */
export default function AdminEventPaymentsTriage({
  athletes = [],
  canEdit = false,
  event,
  onApprovePayment,
  onApproveTicketOrder,
  onOpenFinance,
  onRejectPayment,
  onRejectTicketOrder,
  onRefresh,
  payments = [],
  pendingTicketOrders = [],
}) {
  const { locale, t } = useI18n()
  const [bucketFilter, setBucketFilter] = useState('needs')
  const [ticketReview, setTicketReview] = useState(null)
  const [ticketBusy, setTicketBusy] = useState(false)
  const [ticketError, setTicketError] = useState('')

  const triage = useMemo(
    () =>
      buildEventPaymentTriage({
        event,
        payments,
        athletes,
        pendingTicketOrders,
      }),
    [athletes, event, payments, pendingTicketOrders],
  )

  const filterOptions = useMemo(
    () => [
      [
        'needs',
        t('admin.eventPayments.bucketNeeds'),
        triage.counts.pending + triage.counts.problem,
      ],
      ['pending', t('admin.eventPayments.bucketPending'), triage.counts.pending],
      ['problem', t('admin.eventPayments.bucketProblem'), triage.counts.problem],
      ['ok', t('admin.eventPayments.bucketOk'), triage.counts.ok],
      ['all', t('admin.eventPayments.bucketAll'), triage.counts.total],
    ],
    [t, triage.counts],
  )

  const visibleRows = useMemo(() => {
    if (bucketFilter === 'all') return triage.rows
    if (bucketFilter === 'needs') {
      return triage.rows.filter((row) => row.bucket === 'pending' || row.bucket === 'problem')
    }
    return triage.rows.filter((row) => row.bucket === bucketFilter)
  }, [bucketFilter, triage.rows])

  async function runTicketAction(action, successKey) {
    setTicketBusy(true)
    setTicketError('')
    try {
      const result = await action()
      if (result?.error) {
        setTicketError(result.error)
        notifyError(result.error)
        return false
      }
      setTicketReview(null)
      notifySuccess(t(successKey))
      await onRefresh?.()
      return true
    } catch (error) {
      const message = error?.message ?? t('admin.paymentValidation.confirmError')
      setTicketError(message)
      notifyError(message)
      return false
    } finally {
      setTicketBusy(false)
    }
  }

  function openTicketReview(row, mode = 'validate') {
    const ticket = row.ticket
    if (!ticket) return
    setTicketError('')
    setTicketReview({
      mode,
      type: 'ticket',
      orderId: ticket.orderId,
      hasProof: Boolean(ticket.paymentProofPath),
      paymentProofPath: ticket.paymentProofPath ?? null,
      subject: row.subject,
      detail: [row.detail, ticket.reference].filter(Boolean).join(' · '),
      meta: money(ticket.amount, locale, ticket.currency),
    })
  }

  return (
    <section className="admin-event-payments" aria-label={t('admin.eventPayments.label')}>
      <header className="admin-event-payments__head">
        <div className="admin-event-payments__head-copy">
          <p className="admin-event-payments__eyebrow">{t('admin.eventPayments.eyebrow')}</p>
          <h3 className="admin-event-payments__title">{t('admin.eventPayments.title')}</h3>
          <p className="admin-event-payments__lead">{t('admin.eventPayments.lead')}</p>
        </div>
        {onOpenFinance ? (
          <button type="button" className="admin-event-payments__finance" onClick={onOpenFinance}>
            <CreditCard size={14} aria-hidden />
            {t('admin.eventPayments.openFinance')}
          </button>
        ) : null}
      </header>

      <div className="admin-event-payments__summary" role="status">
        <span className="admin-event-payments__stat admin-event-payments__stat--pending">
          <Clock3 size={14} aria-hidden />
          {t('admin.eventPayments.statPending', { count: triage.counts.pending })}
        </span>
        <span className="admin-event-payments__stat admin-event-payments__stat--problem">
          <CircleAlert size={14} aria-hidden />
          {t('admin.eventPayments.statProblem', { count: triage.counts.problem })}
        </span>
        <span className="admin-event-payments__stat admin-event-payments__stat--ok">
          <CheckCircle2 size={14} aria-hidden />
          {t('admin.eventPayments.statOk', { count: triage.counts.ok })}
        </span>
      </div>

      <AdminFilterChipGroup
        compact
        inline
        id={`event-payments-${event?.slug ?? 'none'}`}
        ariaLabel={t('admin.eventPayments.filterLabel')}
        onChange={setBucketFilter}
        options={filterOptions}
        value={bucketFilter}
      />

      {visibleRows.length === 0 ? (
        <div className="admin-event-payments__empty" role="status">
          <CheckCircle2 size={18} aria-hidden />
          <p>
            {triage.counts.total === 0
              ? t('admin.eventPayments.emptyAll')
              : t('admin.eventPayments.emptyFilter')}
          </p>
        </div>
      ) : (
        <ul className="admin-event-payments__list">
          {visibleRows.map((row) => {
            const amountLabel = money(row.amount, locale, row.currency)
            const kindLabel =
              row.kind === 'ticket'
                ? t('admin.eventPayments.kindTicket')
                : t('admin.eventPayments.kindAthlete')

            return (
              <li
                key={row.id}
                className={`admin-event-payments__row admin-event-payments__row--${row.bucket}`}
              >
                <div className="admin-event-payments__row-main">
                  <div className="admin-event-payments__row-copy">
                    <strong>{row.subject}</strong>
                    <span>
                      {kindLabel}
                      {row.detail ? ` · ${row.detail}` : ''}
                    </span>
                  </div>
                  <div className="admin-event-payments__row-meta">
                    <StatusPill value={row.status} />
                    <em>{amountLabel}</em>
                  </div>
                </div>

                <div className="admin-event-payments__row-actions">
                  {row.kind === 'athlete' && row.payment ? (
                    <>
                      {row.hasProof ? (
                        <AdminIconButton
                          icon={Paperclip}
                          label={t('admin.paymentValidation.viewProof')}
                          onClick={() => {
                            const item = buildPaymentValidationItem(row.payment, {
                              athlete: row.athlete,
                              detail: row.detail,
                              meta: amountLabel,
                              mode: 'view',
                            })
                            setTicketError('')
                            setTicketReview({ ...item, mode: 'view' })
                          }}
                        />
                      ) : null}
                      {canEdit && canValidateManualOrder(row.payment) ? (
                        <PaymentValidationAction
                          athlete={row.athlete}
                          detail={row.detail}
                          onApprove={onApprovePayment}
                          onDone={() => void onRefresh?.()}
                          onReject={onRejectPayment}
                          order={row.payment}
                        />
                      ) : null}
                      {row.bucket === 'problem' && !canValidateManualOrder(row.payment) ? (
                        <span className="admin-event-payments__hint">
                          {t('admin.eventPayments.fixInFinance')}
                        </span>
                      ) : null}
                    </>
                  ) : null}

                  {row.kind === 'ticket' && row.ticket ? (
                    <>
                      {row.hasProof ? (
                        <AdminIconButton
                          icon={Eye}
                          label={t('admin.paymentValidation.viewProof')}
                          onClick={() => openTicketReview(row, 'view')}
                        />
                      ) : (
                        <span className="admin-event-payments__hint">
                          {t('admin.eventPayments.proofMissing')}
                        </span>
                      )}
                      {canEdit && row.hasProof ? (
                        <AdminIconButton
                          icon={BadgeCheck}
                          label={t('admin.actions.validate')}
                          onClick={() => openTicketReview(row, 'validate')}
                          variant="celeste"
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {ticketReview ? (
        <PaymentValidationDialog
          item={ticketReview}
          mode={ticketReview.mode ?? 'validate'}
          busy={ticketBusy}
          error={ticketError}
          onCancel={() => {
            if (ticketBusy) return
            setTicketReview(null)
            setTicketError('')
          }}
          onConfirm={
            ticketReview.mode === 'view'
              ? undefined
              : ticketReview.type === 'ticket'
                ? () =>
                    void runTicketAction(
                      () => onApproveTicketOrder?.(ticketReview.orderId),
                      'admin.toasts.ticketApproved',
                    )
                : () =>
                    void runTicketAction(
                      () => onApprovePayment?.(ticketReview.paymentId),
                      'admin.toasts.paymentApproved',
                    )
          }
          onReject={
            ticketReview.mode === 'view'
              ? undefined
              : ticketReview.type === 'ticket'
                ? (reason) =>
                    void runTicketAction(
                      () => onRejectTicketOrder?.(ticketReview.orderId, reason),
                      'admin.toasts.ticketRejected',
                    )
                : (reason) =>
                    void runTicketAction(
                      () => onRejectPayment?.(ticketReview.paymentId, reason),
                      'admin.toasts.paymentRejected',
                    )
          }
        />
      ) : null}
    </section>
  )
}
