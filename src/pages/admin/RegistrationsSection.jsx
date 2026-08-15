import { useCallback, useMemo, useState } from 'react'
import { BadgeCheck, ClipboardList, PencilLine, Trash2 } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import RegistrationStatusDialog from '../../components/admin/RegistrationStatusDialog.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminPaymentReconciliationAlert from '../../components/admin/AdminPaymentReconciliationAlert.jsx'
import AdminScheduleAssigner from '../../components/admin/AdminScheduleAssigner.jsx'
import {
  AdminIdentityCell,
  AdminPaymentCell,
  AdminTableActions,
} from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useEventSchedule } from '../../hooks/useEventSchedule.js'
import { REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { formatScheduleSummary } from '../../lib/eventSchedule.js'
import { money } from '../../lib/format.js'

// Fallback estable para cuando no llega la prop (Storybook, tests) — evita
// tener que null-check `gatePendingIds` en cada lugar que lo usa.
const EMPTY_GATE_PENDING_IDS = new Set()
/** Con un solo evento el filtro no decide nada. Select nativo recién con muchos. */
const EVENT_FILTER_CHIP_MAX = 8

function formatRegistrationWeight(registration) {
  const raw = registration.bodyweight ?? registration.athlete?.estimatedWeight ?? null
  if (raw == null || raw === '') return null
  const label = String(raw).trim()
  if (!label) return null
  return /kg/i.test(label) ? label : `${label} kg`
}

function canValidateRegistrationPayment(row, canEdit) {
  return Boolean(
    canEdit &&
    row.paymentId &&
    row.paymentMethod !== 'mercado_pago' &&
    row.paymentStatus !== 'aprobado',
  )
}

function matchesRegistrationFilter(registration, payment, filter, gatePendingIds) {
  if (filter === 'all') return true
  if (filter === 'gate_pending') return gatePendingIds.has(registration.id)
  return (
    registration.status === filter ||
    registration.paymentStatus === filter ||
    payment?.status === filter
  )
}

function countRegistrationsByFilter(registrations, resolvePayment, filter, gatePendingIds) {
  return registrations.filter((registration) => {
    const payment = resolvePayment(registration)
    return matchesRegistrationFilter(registration, payment, filter, gatePendingIds)
  }).length
}

export default function RegistrationsSection({
  canAssignSchedule = false,
  canEdit,
  filters,
  filteredRegistrations,
  gatePendingIds = EMPTY_GATE_PENDING_IDS,
  payments,
  registrations = [],
  registrationsCount,
  onApprovePayment,
  onExportAdmin,
  onExportPluUsa,
  onGoToEvents,
  onScheduleAssigned,
  onSelectAthlete,
  onSetFilters,
  onSetRegistrationStatus,
  canSetStatus = false,
  onDelete,
  canDelete = false,
  unreconciledPayments = [],
}) {
  const { locale, t } = useI18n()
  const total = registrationsCount ?? registrations.length
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [statusTarget, setStatusTarget] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const isGloballyEmpty = total === 0
  const isFilteredEmpty = !isGloballyEmpty && filteredRegistrations.length === 0

  // Indexa `payments` una sola vez en vez de escanearlo linealmente por cada
  // inscripción (antes: una vez por fila visible y otra vez por cada status
  // de los chips de filtro — O(statuses × registrations × payments)).
  // Misma semántica que `findRegistrationPayment`
  // (`src/services/registrationAdminService.js`, con tests propios en
  // `tests/registrationsDashboardPayments.test.js`): primero por
  // `paymentOrderId` exacto, si no por atleta+evento, y de última por
  // atleta solo (compatibilidad con datos viejos sin evento).
  const paymentIndex = useMemo(() => {
    const byOrderId = new Map()
    const byAthleteEvent = new Map()
    const byAthlete = new Map()
    for (const payment of payments ?? []) {
      if (payment.id != null && !byOrderId.has(payment.id)) byOrderId.set(payment.id, payment)
      const eventKey = `${payment.athleteId}|${payment.event}`
      if (!byAthleteEvent.has(eventKey)) byAthleteEvent.set(eventKey, payment)
      if (!byAthlete.has(payment.athleteId)) byAthlete.set(payment.athleteId, payment)
    }
    return { byOrderId, byAthleteEvent, byAthlete }
  }, [payments])

  const resolvePayment = useCallback(
    (registration) => {
      if (registration.paymentOrderId) {
        const exact = paymentIndex.byOrderId.get(registration.paymentOrderId)
        if (exact) return exact
      }
      if (registration.event) {
        return paymentIndex.byAthleteEvent.get(`${registration.athleteId}|${registration.event}`)
      }
      return paymentIndex.byAthlete.get(registration.athleteId)
    },
    [paymentIndex],
  )

  const statusCounts = useMemo(() => {
    const counts = {}
    for (const [value] of REGISTRATION_FILTER_STATUSES) {
      counts[value] = countRegistrationsByFilter(
        registrations,
        resolvePayment,
        value,
        gatePendingIds,
      )
    }
    return counts
  }, [registrations, resolvePayment, gatePendingIds])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        statusCounts[value] ?? 0,
      ]),
    [statusCounts, t],
  )
  const eventOptions = useMemo(() => {
    const counts = new Map()
    for (const registration of registrations) {
      if (!registration.event) continue
      counts.set(registration.event, (counts.get(registration.event) ?? 0) + 1)
    }
    const names = [...counts.keys()].sort((left, right) => left.localeCompare(right))
    return [
      ['all', t('admin.filters.allEvents'), registrations.length],
      ...names.map((event) => [event, event, counts.get(event) ?? 0]),
    ]
  }, [registrations, t])

  const registrationRows = useMemo(
    () =>
      filteredRegistrations.map((reg) => {
        const payment = resolvePayment(reg)
        return {
          id: reg.id,
          athlete: reg.athlete?.fullName,
          athleteId: reg.athleteId,
          document: reg.athlete?.documentId,
          gym: reg.athlete?.gym ?? '',
          photoUrl: reg.athlete?.photoUrl ?? null,
          event: reg.event,
          eventSlug: reg.eventSlug ?? eventSlugByTitle.get(reg.event) ?? null,
          category: `${reg.category} · ${reg.division}`,
          bodyweight: formatRegistrationWeight(reg),
          schedule: reg.schedule ?? null,
          status: reg.status,
          paymentStatus: payment?.status,
          paymentMethod: payment?.method,
          amount: payment ? money(payment.amount) : '—',
          paymentId: payment?.id,
        }
      }),
    [filteredRegistrations, resolvePayment],
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

  async function deleteRegistration() {
    if (!deleteTarget || !onDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await onDelete(deleteTarget.id)
      setDeleteTarget(null)
    } catch (error) {
      setDeleteError(error?.message ?? 'No se pudo eliminar la inscripción.')
    } finally {
      setDeleting(false)
    }
  }

  async function saveRegistrationStatus(status, reason) {
    if (!statusTarget || !onSetRegistrationStatus) return
    setSavingStatus(true)
    setStatusError('')
    try {
      const result = await onSetRegistrationStatus(statusTarget.id, status, reason)
      if (result?.error) {
        setStatusError(result.error)
        return
      }
      setStatusTarget(null)
    } catch (error) {
      setStatusError(error?.message ?? 'No se pudo cambiar el estado de la inscripción.')
    } finally {
      setSavingStatus(false)
    }
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

  const eventCount = Math.max(0, eventOptions.length - 1)
  const eventFilter =
    eventCount <= 1
      ? null
      : {
          id: 'event',
          label: t('admin.filters.event'),
          showLabel: true,
          value: filters.event ?? 'all',
          onChange: handleEventChange,
          options: eventOptions,
          variant: eventCount > EVENT_FILTER_CHIP_MAX ? 'select' : undefined,
        }

  return (
    <>
      <AdminPaymentReconciliationAlert
        entries={unreconciledPayments}
        onSelectAthlete={onSelectAthlete}
      />
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
                label={t('admin.actions.exportCsvShort')}
                ariaLabel={t('admin.actions.exportCsvAdmin')}
                onClick={onExportAdmin}
                disabled={!canEdit}
              />
              <ExportButton
                label={t('admin.actions.exportPluUsaShort')}
                ariaLabel={t('admin.actions.exportPluUsa')}
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
                eventFilter,
                {
                  id: 'status',
                  label: t('admin.filters.status'),
                  showLabel: true,
                  value: filters.status,
                  onChange: handleStatusChange,
                  options: statusOptions,
                },
              ].filter(Boolean)
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
            <h2 className="admin-empty__title">
              {t('admin.sections.registrations.emptyFilteredTitle')}
            </h2>
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
                        mobile: 'select',
                        mobileLabel: '',
                        label: (
                          <label
                            className="admin-schedule-select"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleAllVisible}
                              aria-label={t('admin.schedule.selectAll')}
                            />
                          </label>
                        ),
                        render: (row) => (
                          <label
                            className="admin-schedule-select"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleRow(row.id)}
                              aria-label={t('admin.schedule.selectRow', {
                                name: row.athlete ?? '',
                              })}
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
                    <AdminIdentityCell
                      name={row.athlete}
                      photoUrl={row.photoUrl}
                      sub={row.gym || row.document}
                      subMono={!row.gym}
                    />
                  ),
                },
                {
                  key: 'event',
                  label: t('admin.columns.event'),
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  sortable: true,
                },
                {
                  key: 'category',
                  label: t('admin.columns.category'),
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  mobileSortable: false,
                  sortable: true,
                },
                {
                  key: 'bodyweight',
                  label: t('admin.columns.weight'),
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  mobileSortable: false,
                  sortable: false,
                  render: (row) => row.bodyweight || null,
                },
                {
                  // Qué día compite. Ordena por el resumen, así las no asignadas
                  // quedan juntas y se ven de un vistazo las que faltan repartir.
                  key: 'schedule',
                  label: t('admin.columns.schedule'),
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  mobileSortable: false,
                  sortable: true,
                  sortAccessor: (row) => formatScheduleSummary(row.schedule, locale),
                  render: (row) =>
                    formatScheduleSummary(row.schedule, locale) || (
                      <span className="admin-muted-text">
                        {t('admin.schedule.unassignedShort')}
                      </span>
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
                  mobileSortable: false,
                  sortable: true,
                  sortAccessor: (row) => row.amount,
                  render: (row) => (
                    <AdminPaymentCell amount={row.amount} status={row.paymentStatus} />
                  ),
                },
                {
                  key: 'action',
                  label: t('admin.columns.action'),
                  mobile: 'action',
                  render: (row) =>
                    canValidateRegistrationPayment(row, canEdit) || canSetStatus || canDelete ? (
                      <AdminTableActions onClick={(event) => event.stopPropagation()}>
                        {canValidateRegistrationPayment(row, canEdit) ? (
                          <AdminIconButton
                            icon={BadgeCheck}
                            label={t('admin.actions.validate')}
                            onClick={() => onApprovePayment(row.paymentId)}
                            variant="celeste"
                          />
                        ) : null}
                        {canSetStatus && onSetRegistrationStatus ? (
                          <AdminIconButton
                            icon={PencilLine}
                            label={t('admin.registrationStatus.action')}
                            onClick={() => {
                              setStatusError('')
                              setStatusTarget(row)
                            }}
                            variant="ghost"
                          />
                        ) : null}
                        {canDelete ? (
                          <AdminIconButton
                            icon={Trash2}
                            label="Eliminar inscripción"
                            onClick={() => {
                              setDeleteError('')
                              setDeleteTarget(row)
                            }}
                            variant="danger"
                          />
                        ) : null}
                      </AdminTableActions>
                    ) : null,
                },
              ]}
              rows={registrationRows}
              emptyMessage={t('admin.sections.registrations.empty')}
              onRowClick={
                onSelectAthlete
                  ? (row) => row.athleteId && onSelectAthlete(row.athleteId)
                  : undefined
              }
              rowClassName={
                onSelectAthlete ? 'data-table__row--clickable data-table__row--registration' : ''
              }
            />
            {deleteTarget ? (
              <AdminDeleteConfirmDialog
                busy={deleting}
                error={deleteError}
                onCancel={() => {
                  if (!deleting) setDeleteTarget(null)
                }}
                onConfirm={deleteRegistration}
                title="Eliminar inscripción"
                description={`Vas a eliminar definitivamente la inscripción de ${deleteTarget.athlete} a ${deleteTarget.event}.`}
                warning="También se eliminará su acreditación. Los pagos y la auditoría se conservan."
                cancelLabel="Cancelar"
                confirmLabel="Eliminar definitivamente"
                busyLabel="Eliminando…"
              />
            ) : null}
            {statusTarget ? (
              <RegistrationStatusDialog
                registration={statusTarget}
                busy={savingStatus}
                error={statusError}
                onCancel={() => {
                  if (!savingStatus) setStatusTarget(null)
                }}
                onConfirm={saveRegistrationStatus}
              />
            ) : null}
          </>
        )}
      </AdminListSection>
    </>
  )
}
