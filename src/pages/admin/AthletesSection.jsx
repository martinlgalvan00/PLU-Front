import { useMemo, useState } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { AdminIdentityCell, AdminMonoCell } from '../../components/admin/AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { ATHLETE_FILTER_STATUSES } from '../../lib/constants.js'

export default function AthletesSection({ athletes, onSelectAthlete }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const athlete of athletes) {
      counts[athlete.status] = (counts[athlete.status] ?? 0) + 1
    }
    return counts
  }, [athletes])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(ATHLETE_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? athletes.length : (statusCounts[value] ?? 0),
      ]),
    [athletes.length, statusCounts, t],
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

  const stats = useMemo(
    () => [
      {
        label: t('admin.sections.athletes.statActive'),
        value: statusCounts.afiliado_activo ?? 0,
        tone: 'success',
      },
      {
        label: t('admin.sections.athletes.statExpired'),
        value: statusCounts.afiliado_vencido ?? 0,
        tone: 'warning',
      },
      {
        label: t('admin.sections.athletes.statBlocked'),
        value: statusCounts.bloqueado ?? 0,
        tone: 'default',
      },
    ],
    [statusCounts, t],
  )

  return (
    <AdminListSection
      filteredCount={rows.length}
      placeholder={t('admin.search.athlete')}
      query={query}
      showHeader
      showStats
      eyebrow={t('admin.sections.athletes.eyebrow')}
      title={t('admin.sections.athletes.title')}
      subtitle={t('admin.sections.athletes.subtitle')}
      stats={stats}
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
      <AdminDataTable
        variant="admin"
        columns={[
          {
            key: 'fullName',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            desktop: 'primary',
            sortable: true,
            defaultSort: 'asc',
            render: (row) => <AdminIdentityCell name={row.fullName} sub={row.email} />,
          },
          {
            key: 'documentId',
            label: t('admin.columns.document'),
            mobile: 'hidden',
            className: 'data-table__column--mono',
            sortable: true,
            mobileSortable: false,
            render: (row) => <AdminMonoCell>{row.documentId}</AdminMonoCell>,
          },
          {
            key: 'gym',
            label: t('admin.columns.gym'),
            mobile: 'default',
            className: 'data-table__column--meta',
            sortable: true,
            mobileSortable: false,
          },
          {
            key: 'division',
            label: t('admin.columns.division'),
            mobile: 'default',
            className: 'data-table__column--meta',
            sortable: true,
            mobileSortable: false,
          },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            mobileLabel: '',
            desktop: 'status',
            sortable: true,
            mobileSortable: false,
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
