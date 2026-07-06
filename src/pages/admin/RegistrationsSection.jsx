import { useMemo } from 'react'
import { BadgeCheck } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminIdentityCell, AdminPaymentCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
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

  function handleQueryChange(value) {
    onSetFilters((current) => ({ ...current, query: value }))
  }

  return (
    <AdminListSection
      filteredCount={registrationRows.length}
      placeholder={t('admin.search.registration')}
      query={filters.query ?? ''}
      showHeader={false}
      showStats={false}
      totalCount={registrationsCount ?? registrationRows.length}
      actions={
        <>
          <ExportButton iconOnly label={t('admin.actions.exportCsvAdmin')} onClick={onExportAdmin} disabled={!canEdit} />
          <ExportButton
            iconOnly
            label={t('admin.actions.exportPluUsa')}
            onClick={onExportPluUsa}
            variant="gold"
          />
        </>
      }
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: filters.status,
          onChange: (value) => onSetFilters((current) => ({ ...current, status: value })),
          options: statusOptions,
          variant: 'select',
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
            render: (row) => <AdminPaymentCell amount={row.amount} status={row.paymentStatus} />,
          },
          {
            key: 'action',
            label: t('admin.columns.action'),
            render: (row) => (
              <AdminTableActions>
                <AdminIconButton
                  disabled={!canEdit || row.paymentStatus === 'aprobado'}
                  icon={BadgeCheck}
                  label={t('admin.actions.validate')}
                  onClick={() => onApprovePayment(row.paymentId)}
                  variant="celeste"
                />
              </AdminTableActions>
            ),
          },
        ]}
        rows={registrationRows}
        emptyMessage={t('admin.sections.registrations.empty')}
      />
    </AdminListSection>
  )
}
