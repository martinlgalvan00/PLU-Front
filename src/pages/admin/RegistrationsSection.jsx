import { useMemo } from 'react'
import { BadgeCheck, ClipboardList } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import { AdminIdentityCell, AdminPaymentCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { money } from '../../lib/format.js'

function findRegistrationPayment(payments, athleteId) {
  return payments.find((item) => item.athleteId === athleteId)
}

function matchesRegistrationFilter(registration, payment, filter) {
  if (filter === 'all') return true
  return registration.status === filter || registration.paymentStatus === filter || payment?.status === filter
}

function countRegistrationsByFilter(registrations, payments, filter) {
  return registrations.filter((registration) => {
    const payment = findRegistrationPayment(payments, registration.athleteId)
    return matchesRegistrationFilter(registration, payment, filter)
  }).length
}

export default function RegistrationsSection({
  canEdit,
  filters,
  filteredRegistrations,
  payments,
  registrations = [],
  registrationsCount,
  onApprovePayment,
  onExportAdmin,
  onExportPluUsa,
  onGoToEvents,
  onSetFilters,
}) {
  const { t } = useI18n()
  const total = registrationsCount ?? registrations.length
  const isGloballyEmpty = total === 0
  const isFilteredEmpty = !isGloballyEmpty && filteredRegistrations.length === 0

  const statusCounts = useMemo(() => {
    const counts = {}
    for (const [value] of REGISTRATION_FILTER_STATUSES) {
      counts[value] = countRegistrationsByFilter(registrations, payments, value)
    }
    return counts
  }, [payments, registrations])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        statusCounts[value] ?? 0,
      ]),
    [statusCounts, t],
  )
  const eventOptions = useMemo(
    () => [
      ['all', t('admin.filters.allEvents')],
      ...[...new Set(registrations.map((registration) => registration.event).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
        .map((event) => [event, event]),
    ],
    [registrations, t],
  )

  const registrationRows = useMemo(
    () =>
      filteredRegistrations.map((reg) => {
        const payment = findRegistrationPayment(payments, reg.athleteId)
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

  function handleStatusChange(value) {
    onSetFilters((current) => ({ ...current, status: value }))
  }

  function handleEventChange(value) {
    onSetFilters((current) => ({ ...current, event: value }))
  }

  function handleClearFilters() {
    onSetFilters((current) => ({ ...current, event: 'all', status: 'all', query: '' }))
  }

  return (
    <AdminListSection
      variant="registrations"
      eyebrow={t('admin.sections.registrations.eyebrow')}
      filteredCount={registrationRows.length}
      placeholder={t('admin.search.registration')}
      query={filters.query ?? ''}
      showHeader
      showStats={!isGloballyEmpty}
      showFilters={!isGloballyEmpty}
      stats={
        isGloballyEmpty
          ? []
          : [
              {
                label: t('admin.registrations.stats.total'),
                value: statusCounts.all ?? total,
                tone: 'default',
              },
              {
                label: t('admin.registrations.stats.pending'),
                value: statusCounts.pendiente_pago ?? 0,
                tone: 'warning',
              },
              {
                label: t('admin.registrations.stats.manual'),
                value: statusCounts.validacion_manual ?? 0,
                tone: 'warning',
              },
              {
                label: t('admin.registrations.stats.confirmed'),
                value: statusCounts.confirmada ?? 0,
                tone: 'success',
              },
            ]
      }
      title={t('admin.sections.registrations.title')}
      subtitle={t('admin.sections.registrations.subtitle')}
      totalCount={total}
      actions={
        isGloballyEmpty ? null : (
          <>
            <ExportButton
              iconOnly
              label={t('admin.actions.exportCsvAdmin')}
              onClick={onExportAdmin}
              disabled={!canEdit}
            />
            <ExportButton
              iconOnly
              label={t('admin.actions.exportPluUsa')}
              onClick={onExportPluUsa}
              variant="gold"
            />
          </>
        )
      }
      filters={
        isGloballyEmpty
          ? []
          : [
              {
                id: 'event',
                label: t('admin.filters.event'),
                value: filters.event ?? 'all',
                onChange: handleEventChange,
                options: eventOptions,
                variant: 'select',
              },
              {
                id: 'status',
                label: t('admin.filters.status'),
                value: filters.status,
                onChange: handleStatusChange,
                options: statusOptions,
              },
            ]
      }
      onQueryChange={handleQueryChange}
    >
      {isGloballyEmpty ? (
        <div className="admin-empty admin-empty--registrations">
          <span className="admin-empty__icon" aria-hidden>
            <ClipboardList size={22} strokeWidth={1.6} />
          </span>
          <h2 className="admin-empty__title">{t('admin.sections.registrations.emptyTitle')}</h2>
          <p className="admin-empty__lead">{t('admin.sections.registrations.emptyLead')}</p>
          {onGoToEvents ? (
            <Button type="button" variant="outline" onClick={onGoToEvents}>
              {t('admin.sections.registrations.emptyCta')}
            </Button>
          ) : null}
        </div>
      ) : isFilteredEmpty ? (
        <div className="admin-empty admin-empty--filtered">
          <span className="admin-empty__icon" aria-hidden>
            <ClipboardList size={20} strokeWidth={1.6} />
          </span>
          <h2 className="admin-empty__title">{t('admin.sections.registrations.emptyFilteredTitle')}</h2>
          <p className="admin-empty__lead">{t('admin.sections.registrations.emptyFiltered')}</p>
          <button type="button" className="admin-empty__text-link" onClick={handleClearFilters}>
            {t('admin.sections.registrations.clearFilters')}
          </button>
        </div>
      ) : (
        <AdminDataTable
          columns={[
            {
              key: 'athlete',
              label: t('admin.columns.athlete'),
              mobile: 'primary',
              sortable: true,
              render: (row) => <AdminIdentityCell name={row.athlete} sub={row.document} />,
            },
            {
              key: 'event',
              label: t('admin.columns.event'),
              mobile: 'default',
              sortable: true,
              render: (row) => [row.event, row.category].filter(Boolean).join(' · '),
            },
            { key: 'category', label: t('admin.columns.category'), mobile: 'hidden', sortable: true },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              sortable: true,
              render: (row) => <StatusBadge value={row.status} />,
            },
            {
              key: 'payment',
              label: t('admin.columns.payment'),
              mobile: 'badge',
              sortable: true,
              sortAccessor: (row) => row.amount,
              render: (row) => <AdminPaymentCell amount={row.amount} status={row.paymentStatus} />,
            },
            {
              key: 'action',
              label: t('admin.columns.action'),
              mobile: 'action',
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
      )}
    </AdminListSection>
  )
}
