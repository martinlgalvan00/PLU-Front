import { useMemo, useState } from 'react'
import { Download, Lock } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import DataTable, { StatusBadge } from '../../components/ui/DataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { filterMemberships, isExpiringSoon } from '../../services/membershipService.js'

function RosterIdentity({ document, name }) {
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

export default function PluUsaSection({ athletes, memberships, registrations, onExportPluUsa }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')

  const statusOptions = useMemo(
    () => translateFilterOptions(MEMBERSHIP_FILTER_STATUSES, t),
    [t],
  )

  const activeCount = useMemo(
    () => memberships.filter((item) => item.status === 'activa').length,
    [memberships],
  )

  const expiringCount = useMemo(
    () => memberships.filter((item) => item.status === 'activa' && isExpiringSoon(item.expirationDate)).length,
    [memberships],
  )

  const confirmedCount = useMemo(
    () => registrations.filter((item) => ['confirmada', 'acreditada'].includes(item.status)).length,
    [registrations],
  )

  const rows = useMemo(
    () =>
      filterMemberships(memberships, { query, status }).map((item) => ({
        id: item.id,
        athlete: item.athlete?.fullName ?? '—',
        document: item.athlete?.documentId ?? '—',
        memberCode: item.memberCode,
        year: item.year,
        status: item.status,
        expirationDate: item.expirationDate,
      })),
    [memberships, query, status],
  )

  return (
    <AdminListSection
      variant="plu-usa"
      eyebrow={t('admin.sections.pluUsa.eyebrow')}
      title={t('admin.sections.pluUsa.title')}
      subtitle={t('admin.sections.pluUsa.subtitle')}
      totalCount={memberships.length}
      filteredCount={rows.length}
      query={query}
      onQueryChange={setQuery}
      placeholder={t('admin.search.membership')}
      beforeFilters={<p className="admin-list-shell__note">{t('admin.sections.pluUsa.recordsNote')}</p>}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
      ]}
      stats={[
        { label: t('admin.sections.pluUsa.statAthletes'), value: athletes.length },
        { label: t('admin.sections.pluUsa.statActive'), value: activeCount, tone: 'success' },
        { label: t('admin.sections.pluUsa.statExpiring'), value: expiringCount, tone: 'warning' },
        { label: t('admin.sections.pluUsa.statRegistrations'), value: confirmedCount, tone: 'celeste' },
      ]}
      actions={
        <>
          <span className="admin-readonly-tag">
            <Lock size={11} aria-hidden />
            {t('admin.sections.pluUsa.readonlyTag')}
          </span>
          <button type="button" className="btn btn--outline" onClick={onExportPluUsa}>
            <Download size={15} aria-hidden />
            {t('admin.sections.pluUsa.export')}
          </button>
        </>
      }
    >
      <DataTable
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            render: (row) => <RosterIdentity document={row.document} name={row.athlete} />,
          },
          { key: 'memberCode', label: t('admin.columns.code') },
          { key: 'year', label: t('admin.columns.year') },
          {
            key: 'status',
            label: t('admin.columns.status'),
            render: (row) => <StatusBadge value={row.status} />,
          },
          { key: 'expirationDate', label: t('admin.columns.expiration') },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.pluUsa.empty')}
      />
    </AdminListSection>
  )
}
