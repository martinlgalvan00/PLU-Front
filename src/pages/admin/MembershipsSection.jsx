import { useMemo, useState } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { AdminIdentityCell } from '../../components/admin/AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { MEMBERSHIP_EXPIRING_FILTER_OPTIONS, MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { filterMemberships } from '../../services/membershipService.js'

export default function MembershipsSection({ memberships, onSelectAthlete }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [expiring, setExpiring] = useState('all')

  const statusOptions = useMemo(
    () => translateFilterOptions(MEMBERSHIP_FILTER_STATUSES, t),
    [t],
  )

  const expiringOptions = useMemo(
    () => translateFilterOptions(MEMBERSHIP_EXPIRING_FILTER_OPTIONS, t),
    [t],
  )

  const rows = useMemo(
    () =>
      filterMemberships(memberships, { query, status, expiring }).map((item) => ({
        id: item.id,
        athlete: item.athlete?.fullName ?? '—',
        athleteId: item.athleteId,
        document: item.athlete?.documentId ?? '—',
        memberCode: item.memberCode,
        year: item.year,
        status: item.status,
        startDate: item.startDate,
        expirationDate: item.expirationDate,
      })),
    [memberships, query, status, expiring],
  )

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.search.membership')}
      query={query}
      showHeader
      showStats={false}
      eyebrow={t('admin.sections.memberships.eyebrow')}
      title={t('admin.sections.memberships.title')}
      subtitle={t('admin.sections.memberships.subtitle')}
      totalCount={memberships.length}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
        {
          id: 'expiring',
          label: t('admin.filters.expiration'),
          value: expiring,
          onChange: setExpiring,
          options: expiringOptions,
        },
      ]}
      onQueryChange={setQuery}
    >
      <AdminDataTable
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            sortable: true,
            render: (row) => <AdminIdentityCell accent="gold" name={row.athlete} sub={row.document} />,
          },
          { key: 'memberCode', label: t('admin.columns.code'), mobile: 'default', sortable: true },
          { key: 'year', label: t('admin.columns.year'), mobile: 'default', desktop: 'numeric', align: 'end', sortable: true },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            sortable: true,
            render: (row) => <StatusBadge value={row.status} />,
          },
          { key: 'startDate', label: t('admin.columns.start'), mobile: 'default', sortable: true },
          { key: 'expirationDate', label: t('admin.columns.expiration'), mobile: 'default', sortable: true },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.memberships.empty')}
        onRowClick={(row) => row.athleteId && onSelectAthlete?.(row.athleteId)}
        rowClassName="data-table__row--clickable"
      />
    </AdminListSection>
  )
}
