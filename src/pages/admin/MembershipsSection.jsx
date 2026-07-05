import { useMemo, useState } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { MEMBERSHIP_EXPIRING_FILTER_OPTIONS, MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { filterMemberships } from '../../services/membershipService.js'

function MembershipIdentity({ document, name }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="data-table__identity">
      <span className="data-table__avatar data-table__avatar--gold" aria-hidden>
        {initial}
      </span>
      <div className="data-table__identity-copy">
        <strong>{name}</strong>
        <span className="data-table__sub">{document}</span>
      </div>
    </div>
  )
}

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

  const activeCount = useMemo(
    () => memberships.filter((item) => item.status === 'activa').length,
    [memberships],
  )

  const expiringSoonCount = useMemo(
    () => filterMemberships(memberships, { expiring: 'soon' }).length,
    [memberships],
  )

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.search.membership')}
      query={query}
      stats={[
        { label: t('admin.stats.total'), value: memberships.length },
        { label: t('admin.stats.active'), value: activeCount, tone: 'success' },
        { label: t('admin.stats.expiringSoon'), value: expiringSoonCount, tone: 'warning' },
      ]}
      subtitle={t('admin.sections.memberships.subtitle')}
      title={t('admin.sections.memberships.title')}
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
      <DataTable
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            render: (row) => <MembershipIdentity document={row.document} name={row.athlete} />,
          },
          { key: 'memberCode', label: t('admin.columns.code') },
          { key: 'year', label: t('admin.columns.year') },
          {
            key: 'status',
            label: t('admin.columns.status'),
            render: (row) => <StatusBadge value={row.status} />,
          },
          { key: 'startDate', label: t('admin.columns.start') },
          { key: 'expirationDate', label: t('admin.columns.expiration') },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.memberships.empty')}
        onRowClick={(row) => row.athleteId && onSelectAthlete?.(row.athleteId)}
        rowClassName="data-table__row--clickable"
      />
    </AdminListSection>
  )
}
