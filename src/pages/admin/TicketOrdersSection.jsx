import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
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
        amount: money(order.amount, locale),
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
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.ticketOrders.search')}
      query={query}
      showHeader
      showStats
      stats={[
        {
          label: t('admin.ticketOrders.statsPending'),
          value: allRows.length,
          tone: allRows.length > 0 ? 'warning' : 'default',
        },
        {
          label: t('admin.ticketOrders.statsWithProof'),
          value: withProofCount,
          tone: withProofCount > 0 ? 'warning' : 'default',
        },
      ]}
      totalCount={allRows.length}
      onQueryChange={setQuery}
      filters={[]}
      title={t('admin.ticketOrders.title')}
      subtitle={t('admin.ticketOrders.subtitle')}
      variant="tickets"
    >
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
              render: (row) => (
                <span
                  className={
                    row.paymentProofPath
                      ? 'admin-proof-pill admin-proof-pill--ok'
                      : 'admin-proof-pill'
                  }
                >
                  {row.proofStatus}
                </span>
              ),
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
                    ) : null}
                  </AdminTableActions>
                )
              },
            },
          ]}
          rows={rows}
          emptyMessage={`${t('admin.ticketOrders.empty')}. ${t('admin.ticketOrders.emptyHint')}`}
          variant="admin"
        />
      )}

      {reviewRow ? (
        <PaymentValidationDialog
          item={reviewRow}
          busy={approvingId === reviewRow.orderId}
          error={actionError ?? ''}
          onCancel={() => setReviewRow(null)}
          onConfirm={() => {
            const orderId = reviewRow.orderId
            void handleApprove(orderId).then((approved) => {
              if (approved) setReviewRow(null)
            })
          }}
          onReject={(reason) => {
            const orderId = reviewRow.orderId
            void handleReject(orderId, reason).then((rejected) => {
              if (rejected) setReviewRow(null)
            })
          }}
        />
      ) : null}
    </AdminListSection>
  )
}
