import { useMemo, useState } from 'react'
import { QrCode } from 'lucide-react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminMembershipCredential from '../../components/admin/AdminMembershipCredential.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
  AdminPeriodCell,
} from '../../components/admin/AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { MEMBERSHIP_EXPIRING_FILTER_OPTIONS, MEMBERSHIP_FILTER_STATUSES } from '../../lib/constants.js'
import { filterMemberships, getMembershipStats } from '../../services/membershipService.js'

export default function MembershipsSection({
  memberships,
  onSelectAthlete,
  onSetMembershipStatus,
  canManage = false,
}) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [expiring, setExpiring] = useState('all')
  // Credencial abierta en el panel lateral. El id vive acá y no dentro de la
  // fila para que solo haya una abierta a la vez.
  const [credentialId, setCredentialId] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState('')

  async function applyStatus(membershipId, nextStatus) {
    setPendingId(membershipId)
    setActionError('')
    const result = await onSetMembershipStatus?.(membershipId, nextStatus)
    setPendingId(null)
    if (result?.error) setActionError(result.error)
  }

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

  // Métricas de gestión, no un recuento de estados: lo que el admin necesita
  // saber de un vistazo es cuántos socios cubre hoy la afiliación, cuántos
  // entraron este mes, a quiénes hay que ir a renovar y cuánto quedó trabado
  // esperando pago.
  const metrics = useMemo(() => getMembershipStats(memberships), [memberships])

  const stats = useMemo(
    () => [
      {
        label: t('admin.sections.memberships.statActive'),
        value: metrics.active,
        tone: 'success',
      },
      {
        label: t('admin.sections.memberships.statNewThisMonth'),
        value: metrics.newThisMonth,
        tone: 'default',
      },
      {
        label: t('admin.sections.memberships.statExpiringSoon'),
        value: metrics.expiringSoon,
        tone: 'warning',
      },
      {
        label: t('admin.sections.memberships.statPendingPayment'),
        value: metrics.pendingPayment,
        tone: metrics.pendingPayment > 0 ? 'warning' : 'default',
      },
    ],
    [metrics, t],
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
          variant: 'toggle',
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
          {
            key: 'actions',
            label: t('admin.columns.action'),
            mobile: 'default',
            sortable: false,
            mobileSortable: false,
            className: 'data-table__column--actions',
            render: (row) => (
              // stopPropagation: la fila entera navega a la ficha del atleta, y
              // estas acciones no deberían arrastrar al operador con ellas.
              <div
                className="admin-membership-actions"
                onClick={(event) => event.stopPropagation()}
                role="presentation"
              >
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  onClick={() => setCredentialId(credentialId === row.id ? null : row.id)}
                >
                  <QrCode size={14} aria-hidden />
                  {t('admin.sections.memberships.viewCredential')}
                </button>
                {canManage && row.status !== 'activa' && (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={pendingId === row.id}
                    onClick={() => applyStatus(row.id, 'activa')}
                  >
                    {pendingId === row.id
                      ? t('admin.sections.memberships.applying')
                      : t('admin.sections.memberships.activate')}
                  </button>
                )}
                {canManage && row.status === 'activa' && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    disabled={pendingId === row.id}
                    onClick={() => applyStatus(row.id, 'cancelada')}
                  >
                    {pendingId === row.id
                      ? t('admin.sections.memberships.applying')
                      : t('admin.sections.memberships.cancel')}
                  </button>
                )}
              </div>
            ),
          },
        ]}
        rows={rows}
        emptyMessage={t('admin.sections.memberships.empty')}
        onRowClick={(row) => row.athleteId && onSelectAthlete?.(row.athleteId)}
        rowClassName="data-table__row--clickable"
      />

      {actionError ? (
        <p className="form-submit-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {credentialId ? (
        <div className="admin-membership-credential-panel">
          <h3>{t('admin.sections.memberships.credentialTitle')}</h3>
          <AdminMembershipCredential membershipId={credentialId} canRotate={canManage} />
        </div>
      ) : null}
    </AdminListSection>
  )
}
