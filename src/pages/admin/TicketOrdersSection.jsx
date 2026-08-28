import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Paperclip } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminFilterBar from '../../components/admin/AdminFilterBar.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import PaymentValidationDialog from '../../components/admin/PaymentValidationDialog.jsx'

function formatUploadedAt(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function TicketOrdersSection({
  canEdit,
  initialQuery = '',
  pendingTicketOrders = [],
  isLoading = false,
  loadError = null,
  onApproveTicketOrder,
  onRejectTicketOrder,
  onRefresh,
}) {
  const { locale, t } = useI18n()
  const [approvingId, setApprovingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [query, setQuery] = useState(initialQuery)
  const [reviewRow, setReviewRow] = useState(null)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  const allRows = useMemo(
    () =>
      pendingTicketOrders.map((order) => ({
        id: order.orderId,
        reference: order.reference,
        event: order.eventTitle,
        attendees:
          order.attendees?.map((item) => `${item.name} (${item.dni})`).join(' · ') ??
          t('admin.ticketOrders.unknownBuyer'),
        ticketCount: order.ticketCount,
        amount: money(order.amount, locale, order.currency),
        channel:
          order.manualPaymentChannel === 'wise_transfer'
            ? t('formOptions.payment.wiseTransfer')
            : order.provider === 'manual'
              ? t('formOptions.payment.manualLink')
              : null,
        proofStatus: order.paymentProofPath
          ? t('admin.ticketOrders.proofReceived')
          : t('admin.ticketOrders.proofMissing'),
        proofUploadedAt: formatUploadedAt(order.paymentProofUploadedAt, locale),
        status: order.status,
        paymentProofPath: order.paymentProofPath,
      })),
    [locale, pendingTicketOrders, t],
  )

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return allRows

    return allRows.filter((row) =>
      [row.reference, row.event, row.attendees].some((field) =>
        field?.toLowerCase().includes(normalized),
      ),
    )
  }, [allRows, query])

  async function handleApprove(orderId) {
    if (!canEdit) return
    setApprovingId(orderId)
    setActionError(null)
    try {
      await onApproveTicketOrder?.(orderId)
      await onRefresh?.()
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
      await onRefresh?.()
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

  const withProofCount = useMemo(
    () => allRows.filter((row) => row.paymentProofPath).length,
    [allRows],
  )

  return (
    <section id="admin-ticket-orders" className="admin-orders-block">
      <div className="admin-orders-block__toolbar">
        <div className="admin-orders-block__toolbar-filters">
          <AdminFilterBar
            className="admin-filters--external"
            compact
            inline
            placeholder={t('admin.ticketOrders.search')}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
        <div className="admin-orders-block__actions">
          <span className="admin-orders-block__amount admin-orders-block__amount--hero">
            {withProofCount} {t('admin.ticketOrders.statsWithProof')}
          </span>
        </div>
      </div>

      {actionError && <p className="form-submit-error">{actionError}</p>}
      {isLoading && rows.length === 0 ? (
        <TableSkeleton rows={6} columns={7} label={t('admin.ticketOrders.loading')} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={onRefresh} retryLabel={t('common.retry')} />
      ) : (
        <AdminDataTable
          columns={[
            {
              key: 'attendees',
              label: t('admin.columns.attendee'),
              mobile: 'primary',
              sortable: true,
            },
            {
              key: 'reference',
              label: t('admin.columns.reference'),
              mobile: 'hidden',
              sortable: true,
            },
            { key: 'event', label: t('admin.columns.event'), mobile: 'default', sortable: true },
            {
              key: 'channel',
              label: t('admin.columns.method'),
              mobile: 'hidden',
              sortable: true,
              render: (row) => (row.channel ? row.channel : '—'),
            },
            {
              key: 'ticketCount',
              label: t('admin.ticketOrders.tickets'),
              mobile: 'hidden',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            {
              key: 'amount',
              label: t('admin.columns.amount'),
              mobile: 'default',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            {
              key: 'proofStatus',
              label: t('admin.ticketOrders.proof'),
              mobile: 'default',
              sortable: true,
              render: (row) => {
                const hasProof = Boolean(row.paymentProofPath)
                if (!hasProof) {
                  return <span className="admin-proof-pill">{row.proofStatus}</span>
                }
                return (
                  <button
                    type="button"
                    className="admin-proof-pill admin-proof-pill--ok btn btn--ghost"
                    style={{ padding: '0', height: 'auto', textDecoration: 'underline', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      setActionError(null)
                      setReviewRow({
                        mode: 'view',
                        type: 'ticket',
                        orderId: row.id,
                        hasProof: true,
                        paymentProofPath: row.paymentProofPath,
                        subject: row.attendees,
                        detail: `${row.event} · ${row.reference}`,
                        meta: row.amount,
                      })
                    }}
                  >
                    <Paperclip size={14} aria-hidden />
                    {row.proofStatus}
                  </button>
                )
              },
            },
            {
              key: 'proofUploadedAt',
              label: t('admin.ticketOrders.uploadedAt'),
              mobile: 'hidden',
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
              key: 'actions',
              label: t('admin.columns.action'),
              mobile: 'action',
              className: 'data-table__column--actions',
              render: (row) => {
                const approving = approvingId === row.id

                return (
                  <AdminTableActions>
                    {canEdit ? (
                      !row.paymentProofPath && row.status !== 'aprobado' ? (
                        <span className="status-pill status-pill--warning">
                          {t('admin.ticketOrders.proofMissing')}
                        </span>
                      ) : (
                        <AdminIconButton
                          disabled={approving || !row.paymentProofPath}
                          icon={BadgeCheck}
                          spinning={approving}
                          label={t('admin.actions.validate')}
                          onClick={() => {
                            setActionError(null)
                            setReviewRow({
                              type: 'ticket',
                              orderId: row.id,
                              hasProof: Boolean(row.paymentProofPath),
                              paymentProofPath: row.paymentProofPath ?? null,
                              subject: row.attendees,
                              detail: `${row.event} · ${row.reference}`,
                              meta: row.amount,
                            })
                          }}
                          variant="celeste"
                        />
                      )
                    ) : null}
                  </AdminTableActions>
                )
              },
            },
          ]}
          rows={rows}
          emptyMessage={`${t('admin.ticketOrders.empty')}. ${t('admin.ticketOrders.emptyHint')}`}
        />
      )}

      {reviewRow ? (
        <PaymentValidationDialog
          item={reviewRow}
          mode={reviewRow.mode ?? 'validate'}
          busy={approvingId === reviewRow.orderId}
          error={actionError ?? ''}
          onCancel={() => setReviewRow(null)}
          onConfirm={() => {
            void handleApprove(reviewRow.orderId).then((done) => {
              if (done) setReviewRow(null)
            })
          }}
          onReject={(reason) => {
            void handleReject(reviewRow.orderId, reason).then((done) => {
              if (done) setReviewRow(null)
            })
          }}
        />
      ) : null}
    </section>
  )
}
