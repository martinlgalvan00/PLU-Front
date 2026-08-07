import { useMemo, useState } from 'react'
import { Download, Lock } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
} from '../../components/admin/AdminTableCells.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import {
  CONFIRMED_REGISTRATION_STATUSES,
  MEMBERSHIP_FILTER_STATUSES,
} from '../../lib/constants.js'
import { formatShortMemberCode } from '../../lib/format.js'
import { filterMemberships, isExpiringSoon } from '../../services/membershipService.js'

/**
 * PluUsaSection — PLU ARG
 *
 * Vista de socio: solo lectura + export. El nav ya nombra la sección;
 * acá priorizamos búsqueda, estado y descarga, sin cabecera decorativa.
 */
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
    () =>
      memberships.filter(
        (item) => item.status === 'activa' && isExpiringSoon(item.expirationDate),
      ).length,
    [memberships],
  )

  const confirmedCount = useMemo(
    () =>
      registrations.filter((item) => CONFIRMED_REGISTRATION_STATUSES.includes(item.status)).length,
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

  const filterActions = (
    <div className="admin-plu-usa__toolbar">
      <span className="admin-readonly-tag" title={t('admin.sections.pluUsa.readonlyHint')}>
        <Lock size={11} aria-hidden />
        <span>{t('admin.sections.pluUsa.readonlyTag')}</span>
      </span>
      <Button
        type="button"
        variant="secondary"
        className="btn--small admin-plu-usa__export"
        onClick={onExportPluUsa}
      >
        <Download size={14} aria-hidden />
        <span>{t('admin.sections.pluUsa.export')}</span>
      </Button>
    </div>
  )

  return (
    <AdminListSection
      variant="plu-usa"
      filteredCount={rows.length}
      filterActions={filterActions}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
      ]}
      placeholder={t('admin.search.membership')}
      query={query}
      showHeader={false}
      showStats
      collapseStatsOnMobile
      stats={[
        { label: t('admin.sections.pluUsa.statAthletes'), value: athletes.length },
        { label: t('admin.sections.pluUsa.statActive'), value: activeCount, tone: 'success' },
        { label: t('admin.sections.pluUsa.statExpiring'), value: expiringCount, tone: 'warning' },
        {
          label: t('admin.sections.pluUsa.statRegistrations'),
          value: confirmedCount,
          tone: 'celeste',
        },
      ]}
      totalCount={memberships.length}
      onQueryChange={setQuery}
      beforeShell={
        <p className="admin-plu-usa__note">{t('admin.sections.pluUsa.recordsNote')}</p>
      }
    >
      <AdminDataTable
        variant="admin"
        columns={[
          {
            key: 'athlete',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            render: (row) => (
              <AdminIdentityCell accent="gold" name={row.athlete} sub={row.document} subMono />
            ),
          },
          {
            key: 'memberCode',
            label: t('admin.columns.code'),
            mobile: 'default',
            className: 'data-table__column--mono data-table__column--code',
            render: (row) => (
              <AdminMonoCell title={row.memberCode}>
                {formatShortMemberCode(row.memberCode)}
              </AdminMonoCell>
            ),
          },
          {
            key: 'year',
            label: t('admin.columns.year'),
            mobile: 'default',
            desktop: 'numeric',
            align: 'end',
          },
          {
            key: 'status',
            label: t('admin.columns.status'),
            mobile: 'badge',
            render: (row) => <StatusBadge value={row.status} />,
          },
          { key: 'expirationDate', label: t('admin.columns.expiration'), mobile: 'default' },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.pluUsa.empty')}
      />
    </AdminListSection>
  )
}
