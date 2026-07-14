import { useCallback, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import LoadingState from '../../components/ui/LoadingState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { getTicketPaymentProofUrl } from '../../services/ticketApi.js'

function formatUploadedAt(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export default function TicketOrdersSection({
  canEdit,
  pendingTicketOrders = [],
  isLoading = false,
  loadError = null,
  onApproveTicketOrder,
  onRefresh,
}) {
  const { locale, t } = useI18n()
  const [openingProofId, setOpeningProofId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [query, setQuery] = useState('')

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
      [row.reference, row.event, row.attendees].some((field) => field?.toLowerCase().includes(normalized)),
    )
  }, [allRows, query])

  const handleOpenProof = useCallback(async (row) => {
    if (!row.paymentProofPath) return
    setOpeningProofId(row.id)
    setActionError(null)
    try {
      const url = await getTicketPaymentProofUrl(row.id)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('getTicketPaymentProofUrl:', error)
      setActionError(error.message ?? t('admin.ticketOrders.proofErrorFallback'))
    } finally {
      setOpeningProofId(null)
    }
  }, [t])

  async function handleApprove(orderId) {
    if (!canEdit) return
    setApprovingId(orderId)
    setActionError(null)
    try {
      await onApproveTicketOrder?.(orderId)
      await onRefresh?.()
    } catch (error) {
      console.error('approve ticket order:', error)
      setActionError(error.message ?? t('admin.ticketOrders.approveErrorFallback'))
    } finally {
      setApprovingId(null)
    }
  }

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.ticketOrders.search')}
      query={query}
      showHeader
      showStats={false}
      totalCount={allRows.length}
      onQueryChange={setQuery}
      filters={[]}
      title={t('admin.ticketOrders.title')}
      subtitle={t('admin.ticketOrders.subtitle')}
    >
      {actionError && <p className="form-submit-error">{actionError}</p>}
      {isLoading && rows.length === 0 ? (
        <LoadingState label={t('admin.ticketOrders.loading')} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={onRefresh} retryLabel={t('common.retry')} />
      ) : (
      <DataTable
        columns={[
          { key: 'reference', label: t('admin.columns.reference') },
          { key: 'event', label: t('admin.columns.event') },
          { key: 'attendees', label: t('admin.columns.attendee') },
          { key: 'ticketCount', label: t('admin.ticketOrders.tickets') },
          { key: 'amount', label: t('admin.columns.amount') },
          {
            key: 'proofStatus',
            label: t('admin.ticketOrders.proof'),
            render: (row) => (
              <span className={row.paymentProofPath ? 'admin-proof-pill admin-proof-pill--ok' : 'admin-proof-pill'}>
                {row.proofStatus}
              </span>
            ),
          },
          { key: 'proofUploadedAt', label: t('admin.ticketOrders.uploadedAt') },
          {
            key: 'status',
            label: t('admin.columns.status'),
            render: (row) => <StatusBadge value={row.status} />,
          },
          {
            key: 'actions',
            label: t('admin.columns.action'),
            render: (row) => (
              <AdminTableActions>
                {row.paymentProofPath ? (
                  <AdminIconButton
                    label={t('admin.ticketOrders.viewProof')}
                    onClick={() => handleOpenProof(row)}
                    disabled={openingProofId === row.id}
                  >
                    <ExternalLink size={14} aria-hidden />
                  </AdminIconButton>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={approvingId === row.id}
                    onClick={() => handleApprove(row.id)}
                  >
                    {t('admin.actions.validate')}
                  </button>
                ) : null}
              </AdminTableActions>
            ),
          },
        ]}
        rows={rows}
        emptyMessage={`${t('admin.ticketOrders.empty')}. ${t('admin.ticketOrders.emptyHint')}`}
        variant="admin"
      />
      )}
    </AdminListSection>
  )
}
