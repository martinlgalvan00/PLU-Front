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
import {
  ATHLETE_FILTER_STATUSES,
  FORM_OPTIONS,
  REGISTRATION_FILTER_STATUSES,
} from '../../lib/constants.js'
import { findMatchingView, useAdminSavedFilterViews } from '../../hooks/useAdminSavedFilterViews.js'
import {
  createRegistrationPaymentIndex,
  groupRegistrationsByAthlete,
  matchesRegistrationStatusFilter,
  resolveRegistrationPayment,
} from '../../services/registrationAdminService.js'

function normalizeGymName(name) {
  if (!name) return ''
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

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
  const [gym, setGym] = useState('all')
  const [division, setDivision] = useState('all')
  const [registeredRange, setRegisteredRange] = useState({ from: '', to: '' })
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

  const gymOptions = useMemo(() => {
    const map = new Map()
    for (const athlete of athletes) {
      const original = athlete.gym?.trim()
      if (original) {
        const normalized = normalizeGymName(original)
        if (!map.has(normalized)) {
          map.set(normalized, original)
        } else {
          // Preferir versiones con mayúsculas sobre minúsculas puras
          const current = map.get(normalized)
          if (original !== current && original.charAt(0) === original.charAt(0).toUpperCase() && current.charAt(0) === current.charAt(0).toLowerCase()) {
            map.set(normalized, original)
          }
        }
      }
    }
    return [
      ['all', t('admin.filters.allGyms')],
      ...Array.from(map.entries())
        .sort((a, b) => a[1].localeCompare(b[1], 'es'))
        .map(([norm, original]) => [norm, original]),
    ]
  }, [athletes, t])

  const divisionCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const athlete of athletes) {
      counts[athlete.division] = (counts[athlete.division] ?? 0) + 1
    }
    return counts
  }, [athletes])

  const divisionOptions = useMemo(
    () => [
      ['all', t('admin.filters.allDivisions'), athletes.length],
      ...FORM_OPTIONS.division.map((value) => [value, value, divisionCounts[value] ?? 0]),
    ],
    [athletes.length, divisionCounts, t],
  )

  function matchesRegisteredRange(createdAt, range) {
    if (!range.from && !range.to) return true
    if (!createdAt) return false
    const createdDate = createdAt.slice(0, 10)
    if (range.from && createdDate < range.from) return false
    if (range.to && createdDate > range.to) return false
    return true
  }

  function formatDateForSummary(isoDate) {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-AR')
  }

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
    () => ({ query, status, registrationStatus, gym, division, registeredRange }),
    [query, status, registrationStatus, gym, division, registeredRange],
  )
  const activeSavedView = useMemo(
    () => findMatchingView(savedViews, savedViewSnapshot),
    [savedViews, savedViewSnapshot],
  )
  const hasFiltersToSave =
    query.trim() !== '' ||
    status !== 'all' ||
    registrationStatus !== 'all' ||
    gym !== 'all' ||
    division !== 'all' ||
    Boolean(registeredRange.from) ||
    Boolean(registeredRange.to)

  // Resumen legible de los filtros activos para el popover
  const filterSummary = useMemo(() => {
    const items = []
    if (query.trim()) items.push({ label: 'Búsqueda', value: query.trim() })
    if (status !== 'all') {
      const opt = statusOptions.find(([v]) => v === status)
      if (opt) items.push({ label: t('admin.filters.affiliation'), value: opt[1] })
    }
    if (registrationStatus !== 'all') {
      const opt = registrationStatusOptions.find(([v]) => v === registrationStatus)
      if (opt) items.push({ label: t('admin.filters.registrationStatus'), value: opt[1] })
    }
    if (gym !== 'all') {
      const opt = gymOptions.find(([v]) => v === gym)
      if (opt) items.push({ label: t('admin.filters.gym'), value: opt[1] })
    }
    if (division !== 'all') {
      const opt = divisionOptions.find(([v]) => v === division)
      if (opt) items.push({ label: t('admin.filters.division'), value: opt[1] })
    }
    if (registeredRange.from || registeredRange.to) {
      const value =
        registeredRange.from && registeredRange.to
          ? `${formatDateForSummary(registeredRange.from)} – ${formatDateForSummary(registeredRange.to)}`
          : registeredRange.from
            ? t('admin.filters.registeredAtFrom', { date: formatDateForSummary(registeredRange.from) })
            : t('admin.filters.registeredAtTo', { date: formatDateForSummary(registeredRange.to) })
      items.push({ label: t('admin.filters.registeredAt'), value })
    }
    return items
  }, [
    query,
    status,
    registrationStatus,
    gym,
    division,
    registeredRange,
    statusOptions,
    registrationStatusOptions,
    gymOptions,
    divisionOptions,
    t,
  ])

  function applySavedView(view) {
    setQuery(view.snapshot.query ?? '')
    setStatus(view.snapshot.status ?? 'all')
    setRegistrationStatus(view.snapshot.registrationStatus ?? 'all')
    setGym(view.snapshot.gym ?? 'all')
    setDivision(view.snapshot.division ?? 'all')
    setRegisteredRange(view.snapshot.registeredRange ?? { from: '', to: '' })
  }

  function clearSavedView() {
    setQuery('')
    setStatus('all')
    setRegistrationStatus('all')
    setGym('all')
    setDivision('all')
    setRegisteredRange({ from: '', to: '' })
  }

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return athletes
      .filter((athlete) => {
        const statusMatch = status === 'all' || athlete.status === status
        const registrationMatch = athleteMatchesRegistrationFilter(athlete.id, registrationStatus)
        const gymMatch = gym === 'all' || normalizeGymName(athlete.gym) === gym
        const divisionMatch = division === 'all' || athlete.division === division
        const dateMatch = matchesRegisteredRange(athlete.createdAt, registeredRange)
        const queryMatch =
          !normalizedQuery ||
          athlete.fullName.toLowerCase().includes(normalizedQuery) ||
          athlete.documentId.includes(normalizedQuery) ||
          athlete.email.toLowerCase().includes(normalizedQuery) ||
          athlete.gym?.toLowerCase().includes(normalizedQuery)
        return (
          statusMatch && registrationMatch && gymMatch && divisionMatch && dateMatch && queryMatch
        )
      })
      .map((athlete) => ({ ...athlete, id: athlete.id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- athleteMatchesRegistrationFilter/matchesRegisteredRange dependen de paymentIndex/registrationsByAthlete/gatePendingIds, ya listados
  }, [
    athletes,
    query,
    status,
    registrationStatus,
    gym,
    division,
    registeredRange,
    paymentIndex,
    registrationsByAthlete,
    gatePendingIds,
  ])

  return (
    <AdminListSection
      variant="athletes"
      filteredCount={rows.length}
      placeholder={t('admin.search.athlete')}
      query={query}
      showHeader
      showStats={false}
      eyebrow={t('admin.sections.athletes.eyebrow')}
      title={t('admin.sections.athletes.title')}
      subtitle={t('admin.sections.athletes.subtitle')}
      totalCount={athletes.length}
      filterLayout="panel"
      filters={[
        {
          id: 'status',
          label: t('admin.filters.affiliation'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
          showLabel: true,
        },
        {
          id: 'registrationStatus',
          label: t('admin.filters.registrationStatus'),
          value: registrationStatus,
          onChange: setRegistrationStatus,
          options: registrationStatusOptions,
          showLabel: true,
        },
        {
          id: 'gym',
          label: t('admin.filters.gym'),
          value: gym,
          onChange: setGym,
          options: gymOptions,
          variant: 'select',
        },
        {
          id: 'division',
          label: t('admin.filters.division'),
          value: division,
          onChange: setDivision,
          options: divisionOptions,
          showLabel: true,
        },
        {
          id: 'registeredAt',
          label: t('admin.filters.registeredAt'),
          value: registeredRange,
          onChange: setRegisteredRange,
          variant: 'dateRange',
          defaultValue: { from: '', to: '' },
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
          filterSummary={filterSummary}
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
