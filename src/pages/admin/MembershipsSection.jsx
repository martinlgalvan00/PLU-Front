import { useMemo, useState } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
  AdminPeriodCell,
} from '../../components/admin/AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { MEMBERSHIP_EXPIRING_FILTER_OPTIONS, MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { filterMemberships } from '../../services/membershipService.js'

export default function MembershipsSection({ memberships, onSelectAthlete }) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [expiring, setExpiring] = useState('all')

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const item of memberships) {
      counts[item.status] = (counts[item.status] ?? 0) + 1
    }
    return counts
  }, [memberships])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(MEMBERSHIP_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? memberships.length : (statusCounts[value] ?? 0),
      ]),
    [memberships.length, statusCounts, t],
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

  const stats = useMemo(
    () => [
      {
        label: t('admin.sections.memberships.statActive'),
        value: statusCounts.activa ?? 0,
        tone: 'success',
      },
      {
        label: t('admin.sections.memberships.statExpired'),
        value: statusCounts.vencida ?? 0,
        tone: 'warning',
      },
      {
        label: t('admin.sections.memberships.statCancelled'),
        value: statusCounts.cancelada ?? 0,
        tone: 'default',
      },
    ],
    [statusCounts, t],
  )

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.search.membership')}
      query={query}
      showHeader
      showStats
      eyebrow={t('admin.sections.memberships.eyebrow')}
      title={t('admin.sections.memberships.title')}
      subtitle={t('admin.sections.memberships.subtitle')}
      stats={stats}
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
        className="admin-data-table--memberships"
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            desktop: 'primary',
            sortable: true,
            defaultSort: 'asc',
            render: (row) => (
              <AdminIdentityCell accent="gold" name={row.athlete} sub={row.document} subMono />
            ),
          },
          {
            key: 'memberCode',
            label: t('admin.columns.code'),
            mobile: 'default',
            mobileSortLabel: t('admin.columns.code'),
            className: 'data-table__column--mono data-table__column--code',
            sortable: true,
            mobileSortable: false,
            render: (row) => <AdminMonoCell>{row.memberCode}</AdminMonoCell>,
          },
          {
            key: 'expirationDate',
            label: t('admin.columns.period'),
            mobile: 'default',
            mobileSortLabel: t('admin.columns.expiration'),
            className: 'data-table__column--period',
            sortable: true,
            mobileSortable: false,
            sortAccessor: (row) => row.expirationDate,
            render: (row) => (
              <AdminPeriodCell
                start={row.startDate}
                end={row.expirationDate}
                year={row.year}
                locale={locale}
              />
            ),
          },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            desktop: 'status',
            sortable: true,
            mobileSortable: false,
            render: (row) => <StatusBadge value={row.status} />,
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.memberships.empty')}
        onRowClick={(row) => row.athleteId && onSelectAthlete?.(row.athleteId)}
        rowClassName="data-table__row--clickable"
      />
    </AdminListSection>
  )
}
