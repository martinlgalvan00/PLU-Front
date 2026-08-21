import { useEffect, useMemo, useState } from 'react'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AdminAthletesBulkBar from '../../components/admin/AdminAthletesBulkBar.jsx'
import AdminSavedViews from '../../components/admin/AdminSavedViews.jsx'
import { AdminIdentityCell, AdminMonoCell } from '../../components/admin/AdminTableCells.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAthletesTourSteps } from '../../lib/adminTourSteps.js'
import { getStatusMeta } from '../../lib/status.js'
import { ATHLETE_FILTER_STATUSES, REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { findMatchingView, useAdminSavedFilterViews } from '../../hooks/useAdminSavedFilterViews.js'
import {
  createRegistrationPaymentIndex,
  groupRegistrationsByAthlete,
  matchesRegistrationStatusFilter,
  resolveRegistrationPayment,
} from '../../services/registrationAdminService.js'

const EMPTY_GATE_PENDING_IDS = new Set()

export default function AthletesSection({
  athletes,
  registrations = [],
  payments = [],
  gatePendingIds = EMPTY_GATE_PENDING_IDS,
  onSelectAthlete,
  canEdit = false,
  onBulkUpdate,
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [registrationStatus, setRegistrationStatus] = useState('all')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const { startTour } = useAdminTour()
  const { views: savedViews, saveView, removeView } = useAdminSavedFilterViews('athletes')

  useEffect(() => {
    startTour('admin-athletes', getAthletesTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

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
        // Mismo tono que ya pinta el status-pill de la fila, para que el
        // chip activo prediga el color del resultado en vez de un celeste
        // genérico ("all" queda sin tono, es el chip neutro).
        value === 'all' ? undefined : getStatusMeta(value).tone,
      ]),
    [athletes.length, statusCounts, t],
  )

  // Índice de pagos + inscripciones por atleta, una sola pasada cada uno
  // (mismo patrón que RegistrationsSection): "¿este atleta tiene alguna
  // inscripción que matchee el filtro X?" no debería recorrer todo el
  // array de inscripciones por cada atleta.
  const paymentIndex = useMemo(() => createRegistrationPaymentIndex(payments), [payments])
  const registrationsByAthlete = useMemo(
    () => groupRegistrationsByAthlete(registrations),
    [registrations],
  )

  function athleteMatchesRegistrationFilter(athleteId, filter) {
    if (filter === 'all') return true
    const athleteRegistrations = registrationsByAthlete.get(athleteId) ?? []
    return athleteRegistrations.some((registration) =>
      matchesRegistrationStatusFilter(
        registration,
        resolveRegistrationPayment(paymentIndex, registration),
        filter,
        gatePendingIds,
      ),
    )
  }

  const registrationStatusCounts = useMemo(() => {
    const counts = Object.fromEntries(REGISTRATION_FILTER_STATUSES.map(([value]) => [value, 0]))
    for (const athlete of athletes) {
      for (const [value] of REGISTRATION_FILTER_STATUSES) {
        if (athleteMatchesRegistrationFilter(athlete.id, value)) counts[value] += 1
      }
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps -- athleteMatchesRegistrationFilter depende de paymentIndex/registrationsByAthlete/gatePendingIds, ya listados
  }, [athletes, paymentIndex, registrationsByAthlete, gatePendingIds])

  const registrationStatusOptions = useMemo(
    () =>
      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        registrationStatusCounts[value] ?? 0,
      ]),
    [registrationStatusCounts, t],
  )

  const savedViewSnapshot = useMemo(
    () => ({ query, status, registrationStatus }),
    [query, status, registrationStatus],
  )
  const activeSavedView = useMemo(
    () => findMatchingView(savedViews, savedViewSnapshot),
    [savedViews, savedViewSnapshot],
  )
  const hasFiltersToSave = query.trim() !== '' || status !== 'all' || registrationStatus !== 'all'

  function applySavedView(view) {
    setQuery(view.snapshot.query ?? '')
    setStatus(view.snapshot.status ?? 'all')
    setRegistrationStatus(view.snapshot.registrationStatus ?? 'all')
  }

  function clearSavedView() {
    setQuery('')
    setStatus('all')
    setRegistrationStatus('all')
  }

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return athletes
      .filter((athlete) => {
        const statusMatch = status === 'all' || athlete.status === status
        const registrationMatch = athleteMatchesRegistrationFilter(athlete.id, registrationStatus)
        const queryMatch =
          !normalizedQuery ||
          athlete.fullName.toLowerCase().includes(normalizedQuery) ||
          athlete.documentId.includes(normalizedQuery) ||
          athlete.email.toLowerCase().includes(normalizedQuery) ||
          athlete.gym?.toLowerCase().includes(normalizedQuery)
        return statusMatch && registrationMatch && queryMatch
      })
      .map((athlete) => ({ ...athlete, id: athlete.id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- athleteMatchesRegistrationFilter depende de paymentIndex/registrationsByAthlete/gatePendingIds, ya listados
  }, [
    athletes,
    query,
    status,
    registrationStatus,
    paymentIndex,
    registrationsByAthlete,
    gatePendingIds,
  ])

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
      variant="athletes"
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
          label: t('admin.filters.affiliation'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
        },
        {
          id: 'registrationStatus',
          label: t('admin.filters.registrationStatus'),
          value: registrationStatus,
          onChange: setRegistrationStatus,
          options: registrationStatusOptions,
          advanced: true,
        },
      ]}
      onQueryChange={setQuery}
      beforeFilters={
        <AdminSavedViews
          views={savedViews}
          activeViewId={activeSavedView?.id ?? null}
          allLabel={t('admin.savedViews.all')}
          caption={t('admin.savedViews.caption')}
          addLabel={t('admin.savedViews.add')}
          namePlaceholder={t('admin.savedViews.namePlaceholder')}
          removeAriaLabel={(label) => t('admin.savedViews.remove', { label })}
          canSave={hasFiltersToSave && !activeSavedView}
          onApply={applySavedView}
          onClear={clearSavedView}
          onSave={(label) => saveView(label, savedViewSnapshot)}
          onRemove={removeView}
        />
      }
    >
      {canEdit ? (
        <AdminAthletesBulkBar
          selectedIds={selectedRowKeys}
          statusFieldOptions={statusOptions
            .filter(([value]) => value !== 'all')
            .map(([value, label]) => [value, label])}
          onBulkUpdate={onBulkUpdate}
          onClearSelection={() => setSelectedRowKeys([])}
        />
      ) : null}
      <AdminDataTable
        variant="admin"
        rowSelection={
          canEdit
            ? {
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                preserveSelectedRowKeys: true,
              }
            : undefined
        }
        columns={[
          {
            key: 'fullName',
            label: t('admin.columns.athlete'),
            mobile: 'primary',
            desktop: 'primary',
            sortable: true,
            defaultSort: 'asc',
            render: (row) => (
              <AdminIdentityCell
                name={row.fullName}
                photoUrl={row.photoUrl}
                sub={row.gym || row.email}
              />
            ),
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
