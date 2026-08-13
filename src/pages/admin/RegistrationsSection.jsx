import { useCallback, useMemo, useState } from 'react'
import { BadgeCheck, ClipboardList } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminScheduleAssigner from '../../components/admin/AdminScheduleAssigner.jsx'
import { AdminIdentityCell, AdminPaymentCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useEventSchedule } from '../../hooks/useEventSchedule.js'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { formatScheduleSummary } from '../../lib/eventSchedule.js'
import { money } from '../../lib/format.js'
import { findGatePendingRegistrations } from '../../lib/gateAccess.js'
import { findRegistrationPayment } from '../../services/registrationAdminService.js'

function matchesRegistrationFilter(registration, payment, filter, gatePendingIds) {
  if (filter === 'all') return true
  if (filter === 'gate_pending') return gatePendingIds.has(registration.id)
  return registration.status === filter || registration.paymentStatus === filter || payment?.status === filter
}

function countRegistrationsByFilter(registrations, payments, filter, gatePendingIds) {
  return registrations.filter((registration) => {
    const payment = findRegistrationPayment(payments, registration)
    return matchesRegistrationFilter(registration, payment, filter, gatePendingIds)
  }).length
}

export default function RegistrationsSection({
  canAssignSchedule = false,
  canEdit,
  filters,
  filteredRegistrations,
  payments,
  registrations = [],
  memberships = [],
  events = [],
  registrationsCount,
  onApprovePayment,
  onExportAdmin,
  onExportPluUsa,
  onGoToEvents,
  onScheduleAssigned,
  onSetFilters,
}) {
  const { locale, t } = useI18n()
  const total = registrationsCount ?? registrations.length
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const isGloballyEmpty = total === 0
  const isFilteredEmpty = !isGloballyEmpty && filteredRegistrations.length === 0

  const gatePendingIds = useMemo(
    () =>
      new Set(
        findGatePendingRegistrations(registrations, { memberships, events }).map((item) => item.id),
      ),
    [registrations, memberships, events],
  )

  const statusCounts = useMemo(() => {
    const counts = {}
    for (const [value] of REGISTRATION_FILTER_STATUSES) {
      counts[value] = countRegistrationsByFilter(registrations, payments, value, gatePendingIds)
    }
    return counts
  }, [payments, registrations, gatePendingIds])

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
  const eventSlugByTitle = useMemo(
    () =>
      new Map(
        events
          .filter((event) => event?.title && event?.slug)
          .map((event) => [event.title, event.slug]),
      ),
    [events],
  )

  const registrationRows = useMemo(
    () =>
      filteredRegistrations.map((reg) => {
        const payment = findRegistrationPayment(payments, reg)
        return {
          id: reg.id,
          athlete: reg.athlete?.fullName,
          document: reg.athlete?.documentId,
          event: reg.event,
          eventSlug: reg.eventSlug ?? eventSlugByTitle.get(reg.event) ?? null,
          category: `${reg.category} · ${reg.division}`,
          schedule: reg.schedule ?? null,
          status: reg.status,
          paymentStatus: payment?.status,
          paymentMethod: payment?.method,
          amount: payment ? money(payment.amount) : '—',
          paymentId: payment?.id,
        }
      }),
    [eventSlugByTitle, filteredRegistrations, payments],
  )

  // La selección se limita a las filas que el filtro deja a la vista: seguir
  // arrastrando ids ocultos haría que "asignar 40" tocara gente que el
  // operador ya no está mirando.
  const visibleSelectedRows = useMemo(
    () => registrationRows.filter((row) => selectedIds.has(row.id)),
    [registrationRows, selectedIds],
  )

  const selectedEventSlugs = useMemo(
    () => new Set(visibleSelectedRows.map((row) => row.eventSlug).filter(Boolean)),
    [visibleSelectedRows],
  )
  // La RPC de asignación trabaja sobre un evento por vez.
  const mixedEvents = selectedEventSlugs.size > 1
  const targetEventSlug = selectedEventSlugs.size === 1 ? [...selectedEventSlugs][0] : null

  const {
    assign,
    assigning,
    days,
    sessions,
    status: scheduleStatus,
  } = useEventSchedule(targetEventSlug, { enabled: canAssignSchedule && Boolean(targetEventSlug) })

  const allVisibleSelected =
    registrationRows.length > 0 && visibleSelectedRows.length === registrationRows.length

  const toggleRow = useCallback((rowId) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }, [])

  const toggleAllVisible = useCallback(() => {
    setSelectedIds((current) => {
      const visibleIds = registrationRows.map((row) => row.id)
      const everySelected = visibleIds.every((id) => current.has(id))
      const next = new Set(current)
      for (const id of visibleIds) {
        if (everySelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [registrationRows])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  async function handleAssign({ dayIndex, sessionId }) {
    const result = await assign({
      registrationIds: visibleSelectedRows.map((row) => row.id),
      dayIndex,
      sessionId,
    })
    clearSelection()
    // El snapshot del panel es el que alimenta la columna de grilla y el QR:
    // sin releerlo, la tabla seguiría mostrando la asignación vieja.
    await onScheduleAssigned?.(result)
  }

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
        <>
          {canAssignSchedule && (
            <AdminScheduleAssigner
              assigning={assigning}
              days={days}
              sessions={sessions}
              mixedEvents={mixedEvents}
              onAssign={handleAssign}
              onClearSelection={clearSelection}
              scheduleStatus={scheduleStatus}
              selectedCount={visibleSelectedRows.length}
              targetEventName={visibleSelectedRows[0]?.event ?? ''}
            />
          )}
          <AdminDataTable
            columns={[
              ...(canAssignSchedule
                ? [
                    {
                      key: 'select',
                      mobile: 'default',
                      mobileLabel: '',
                      label: (
                        <label className="admin-schedule-select">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleAllVisible}
                            aria-label={t('admin.schedule.selectAll')}
                          />
                        </label>
                      ),
                      render: (row) => (
                        <label className="admin-schedule-select">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleRow(row.id)}
                            aria-label={t('admin.schedule.selectRow', { name: row.athlete ?? '' })}
                          />
                        </label>
                      ),
                    },
                  ]
                : []),
              {
                key: 'athlete',
                label: t('admin.columns.athlete'),
                mobile: 'primary',
                sortable: true,
                render: (row) => (
                  <AdminIdentityCell name={row.athlete} sub={row.document} subMono />
                ),
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
                // Qué día compite. Ordena por el resumen, así las no asignadas
                // quedan juntas y se ven de un vistazo las que faltan repartir.
                key: 'schedule',
                label: t('admin.columns.schedule'),
                mobile: 'default',
                sortable: true,
                sortAccessor: (row) => formatScheduleSummary(row.schedule, locale),
                render: (row) =>
                  formatScheduleSummary(row.schedule, locale) || (
                    <span className="admin-muted-text">{t('admin.schedule.unassignedShort')}</span>
                  ),
              },
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
                      disabled={
                        !canEdit ||
                        !row.paymentId ||
                        row.paymentMethod === 'mercado_pago' ||
                        row.paymentStatus === 'aprobado'
                      }
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
        </>
      )}
    </AdminListSection>
  )
}

