import { useMemo } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminIdentityCell } from '../../components/admin/AdminTableCells.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { money } from '../../lib/format.js'

export default function RegistrationsSection({
  canEdit,
  filters,
  filteredRegistrations,
  payments,
  registrationsCount,
  onApprovePayment,
  onExportAdmin,
  onExportPluUsa,
  onSetFilters,
}) {
  const { t } = useI18n()

  const statusOptions = useMemo(
    () => translateFilterOptions(REGISTRATION_FILTER_STATUSES, t),
    [t],
  )

  const registrationRows = useMemo(
    () =>
      filteredRegistrations.map((reg) => {
        const payment = payments.find((item) => item.athleteId === reg.athleteId)
        return {
          id: reg.id,
          athlete: reg.athlete?.fullName,
          document: reg.athlete?.documentId,
          event: reg.event,
          category: `${reg.category} · ${reg.division}`,
          status: reg.status,
          paymentStatus: payment?.status,
          amount: payment ? money(payment.amount) : '—',
          paymentId: payment?.id,
        }
      }),
    [filteredRegistrations, payments],
  )

  const confirmedCount = useMemo(
    () => registrationRows.filter((row) => ['confirmada', 'acreditada'].includes(row.status)).length,
    [registrationRows],
  )

  const pendingPaymentCount = useMemo(
    () =>
      registrationRows.filter((row) =>
        ['pendiente', 'pendiente_pago', 'validacion_manual'].includes(row.paymentStatus),
      ).length,
    [registrationRows],
  )

  function handleQueryChange(value) {
    onSetFilters((current) => ({ ...current, query: value }))
  }

  return (
    <AdminListSection
      filteredCount={registrationRows.length}
      placeholder={t('admin.search.registration')}
      query={filters.query ?? ''}
      stats={[
        { label: t('admin.stats.total'), value: registrationRows.length },
        { label: t('admin.stats.confirmed'), value: confirmedCount, tone: 'success' },
        { label: t('admin.stats.pendingPayments'), value: pendingPaymentCount, tone: 'warning' },
      ]}
      subtitle={t('admin.sections.registrations.subtitle')}
      title={t('admin.sections.registrations.title')}
      totalCount={registrationsCount ?? registrationRows.length}
      actions={
        <>
          <ExportButton label={t('admin.actions.exportCsvAdmin')} onClick={onExportAdmin} disabled={!canEdit} />
          <ExportButton label={t('admin.actions.exportPluUsa')} onClick={onExportPluUsa} variant="gold" />
        </>
      }
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: filters.status,
          onChange: (value) => onSetFilters((current) => ({ ...current, status: value })),
          options: statusOptions,
        },
      ]}
      onQueryChange={handleQueryChange}
    >
      <DataTable
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            render: (row) => <AdminIdentityCell name={row.athlete} sub={row.document} />,
          },
          { key: 'event', label: t('admin.columns.event') },
          { key: 'category', label: t('admin.columns.category') },
          {
            key: 'status',
            label: t('admin.columns.status'),
            render: (row) => <StatusBadge value={row.status} />,
          },
          {
            key: 'payment',
            label: t('admin.columns.payment'),
            render: (row) => (
              <>
                <StatusBadge value={row.paymentStatus} />
                <span className="data-table__sub">{row.amount}</span>
              </>
            ),
          },
          {
            key: 'action',
            label: t('admin.columns.action'),
            render: (row) => (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => onApprovePayment(row.paymentId)}
                disabled={!canEdit || row.paymentStatus === 'aprobado'}
              >
                {t('admin.actions.validate')}
              </button>
            ),
          },
        ]}
        rows={registrationRows}
        emptyMessage={t('admin.sections.registrations.empty')}
      />
    </AdminListSection>
  )
}
