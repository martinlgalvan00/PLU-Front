import { useMemo, useState } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { ATHLETE_FILTER_STATUSES } from '../../lib/constants.js'

function AthleteIdentity({ email, name }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="data-table__identity">
      <span className="data-table__avatar" aria-hidden>
        {initial}
      </span>
      <div className="data-table__identity-copy">
        <strong>{name}</strong>
        <span className="data-table__sub">{email}</span>
      </div>
    </div>
  )
}

export default function AthletesSection({ athletes, onSelectAthlete }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const statusOptions = useMemo(
    () => translateFilterOptions(ATHLETE_FILTER_STATUSES, t),
    [t],
  )

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return athletes
      .filter((athlete) => {
        const statusMatch = status === 'all' || athlete.status === status
        const queryMatch =
          !normalizedQuery ||
          athlete.fullName.toLowerCase().includes(normalizedQuery) ||
          athlete.documentId.includes(normalizedQuery) ||
          athlete.email.toLowerCase().includes(normalizedQuery)
        return statusMatch && queryMatch
      })
      .map((athlete) => ({ ...athlete, id: athlete.id }))
  }, [athletes, query, status])

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.search.athlete')}
      query={query}
      showHeader
      showStats={false}
      eyebrow={t('admin.sections.athletes.eyebrow')}
      title={t('admin.sections.athletes.title')}
      subtitle={t('admin.sections.athletes.subtitle')}
      totalCount={athletes.length}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
      ]}
      onQueryChange={setQuery}
    >
      <DataTable
        variant="admin"
        columns={[
          {
            key: 'fullName',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            sortable: true,
            render: (row) => <AthleteIdentity email={row.email} name={row.fullName} />,
          },
          { key: 'documentId', label: t('admin.columns.document'), mobile: 'default', sortable: true },
          { key: 'gym', label: t('admin.columns.gym'), mobile: 'default', sortable: true },
          { key: 'division', label: t('admin.columns.division'), mobile: 'default', sortable: true },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            sortable: true,
            render: (row) => <StatusBadge value={row.status} />,
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.athletes.empty')}
        onRowClick={(row) => onSelectAthlete?.(row.id)}
        rowClassName="data-table__row--clickable"
      />
    </AdminListSection>
  )
}
