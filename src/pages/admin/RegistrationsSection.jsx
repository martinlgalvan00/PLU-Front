import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ClipboardList,
  Eye,
  EyeOff,
  MessageSquare,
  PencilLine,
  Trash2,
} from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import ObservationsDialog from '../../components/admin/ObservationsDialog.jsx'
import RegistrationStatusDialog from '../../components/admin/RegistrationStatusDialog.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminPaymentReconciliationAlert from '../../components/admin/AdminPaymentReconciliationAlert.jsx'
import AdminScheduleAssigner from '../../components/admin/AdminScheduleAssigner.jsx'
import AdminSavedViews from '../../components/admin/AdminSavedViews.jsx'
import PaymentRecoveryAction from '../../components/admin/PaymentRecoveryAction.jsx'
import PaymentValidationAction from '../../components/admin/PaymentValidationAction.jsx'
import {
  AdminIdentityCell,
  AdminPaymentCell,
  AdminTableActions,
  AdminTableActionsEmpty,
} from '../../components/admin/AdminTableCells.jsx'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { EntitlementStateCell } from '../../components/admin/AdminStateCell.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getRegistrationsTourSteps } from '../../lib/adminTourSteps.js'
import { useEventSchedule } from '../../hooks/useEventSchedule.js'
import { ATHLETE_FILTER_STATUSES, REGISTRATION_FILTER_STATUSES } from '../../lib/constants.js'
import { EMPTY_DATE_RANGE } from '../../lib/adminDateRangeFilter.js'
import { formatScheduleSummary } from '../../lib/eventSchedule.js'
import { money } from '../../lib/format.js'
import {
  createRegistrationPaymentIndex,
  matchesRegistrationStatusFilter,
  resolveRegistrationPayment,
} from '../../services/registrationAdminService.js'
import {
  canForceSettleOrder,
  canApproveManualOrder,
  isManualOrder,
  isOpenOrder,
} from '../../services/paymentValidationService.js'
import {
  fetchPlatformFeatureToggles,
  VALIDATION_DISABLED_CODES,
} from '../../services/platformSettingsAdminService.js'
import { resolveStateBacking } from '../../services/stateCoherenceService.js'
import { findMatchingView, useAdminSavedFilterViews } from '../../hooks/useAdminSavedFilterViews.js'
import {
  buildAdminFacetOptions,
} from '../../lib/adminPeopleFilters.js'

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

/**
 * `canEdit` acá es la unión de inscripciones y pagos, así que no alcanza:
 * acreditar exige `admin.payments.approve`. Antes el botón salía habilitado
 * para quien sólo podía escribir inscripciones y la acción moría en un 403 que
 * la pantalla descartaba.
 *
 * La orden aparece mientras siga abierta y sea manual; que tenga comprobante
 * decide si el botón está habilitado, no si existe — mismo criterio que
 * Finanzas, para que no se lea como que la acción desapareció.
 */
function canValidateRegistrationPayment(row, canValidatePayments) {
  return Boolean(canValidatePayments && isManualOrder(row.payment) && isOpenOrder(row.payment))
}

/**
 * El caso "el pago figura cancelado pero la plata entró": revalidar aplica a
 * cualquier orden de Mercado Pago sin importar el permiso (no acredita nada
 * por sí sola); acreditar a mano exige el mismo permiso que en Finanzas.
 */
function canRecoverRegistrationPayment(row, canForceSettle) {
  if (!row.payment) return false
  return row.payment.method === 'mercado_pago' || (canForceSettle && canForceSettleOrder(row.payment))
}

/**
 * Contadores para los chips de estado y afiliación en una sola pasada sobre
 * `registrations` (antes: un `.filter()` completo por cada uno de los 5
 * estados solo para los badges de conteo).
 */
function buildRegistrationFilterCounts(registrations, resolvePayment, gatePendingIds) {
  const statusCounts = Object.fromEntries(REGISTRATION_FILTER_STATUSES.map(([value]) => [value, 0]))
  const affiliationCounts = Object.create(null)
  for (const registration of registrations) {
    const payment = resolvePayment(registration)
    for (const [value] of REGISTRATION_FILTER_STATUSES) {
      if (matchesRegistrationStatusFilter(registration, payment, value, gatePendingIds)) {
        statusCounts[value] += 1
      }
    }
    const affiliation = registration.athlete?.status
    if (affiliation) affiliationCounts[affiliation] = (affiliationCounts[affiliation] ?? 0) + 1
  }
  return { statusCounts, affiliationCounts }
}

export default function RegistrationsSection({
  canAssignSchedule = false,
  canEdit,
  canValidatePayments = false,
  filters,
  filteredRegistrations,
  gatePendingIds = EMPTY_GATE_PENDING_IDS,
  payments,
  registrations = [],
  athletes = [],
  registrationsCount,
  onApprovePayment,
  onForceSettlePayment,
  onRejectPayment,
  onExportAdmin,
  onExportPluUsa,
  onGoToEvents,
  onRefreshAthleteData,
  onScheduleAssigned,
  onSelectAthlete,
  onSetFilters,
  onSetRegistrationStatus,
  canForceSettle = false,
  canSetStatus = false,
  onDelete,
  onSetPublicVisibility,
  canDelete = false,
  canManageVisibility = false,
  unreconciledPayments = [],
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()
  const total = registrationsCount ?? registrations.length
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [visibilityChangingId, setVisibilityChangingId] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [observationsTarget, setObservationsTarget] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [validationEnabled, setValidationEnabled] = useState(true)
  const { views: savedViews, saveView, removeView } = useAdminSavedFilterViews('registrations')

  useEffect(() => {
    startTour('admin-registrations', getRegistrationsTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchPlatformFeatureToggles()
      .then((toggles) => {
        if (!cancelled) setValidationEnabled(toggles.registrationValidationEnabled !== false)
      })
      .catch(() => {
        if (!cancelled) setValidationEnabled(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
  const paymentIndex = useMemo(() => createRegistrationPaymentIndex(payments), [payments])

  const athletesById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  )
  const enrichedAdminRegistrations = useMemo(
    () =>
      registrations.map((registration) => ({
        ...registration,
        athlete: registration.athlete ?? athletesById.get(registration.athleteId),
      })),
    [registrations, athletesById],
  )

  const resolvePayment = useCallback(
    (registration) => resolveRegistrationPayment(paymentIndex, registration),
    [paymentIndex],
  )

  const { statusCounts, affiliationCounts } = useMemo(
    () => buildRegistrationFilterCounts(enrichedAdminRegistrations, resolvePayment, gatePendingIds),
    [enrichedAdminRegistrations, resolvePayment, gatePendingIds],
  )

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(REGISTRATION_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        statusCounts[value] ?? 0,
      ]),
    [statusCounts, t],
  )
  const affiliationOptions = useMemo(
    () =>
      translateFilterOptions(ATHLETE_FILTER_STATUSES, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? enrichedAdminRegistrations.length : (affiliationCounts[value] ?? 0),
      ]),
    [affiliationCounts, enrichedAdminRegistrations.length, t],
  )
  const gymOptions = useMemo(
    () =>
      buildAdminFacetOptions(
        enrichedAdminRegistrations,
        (registration) => registration.athlete?.gym,
        t('admin.filters.allGyms'),
      ),
    [enrichedAdminRegistrations, t],
  )
  const divisionOptions = useMemo(
    () =>
      buildAdminFacetOptions(
        enrichedAdminRegistrations,
        (registration) => registration.division,
        t('admin.filters.allDivisions'),
      ),
    [enrichedAdminRegistrations, t],
  )
  const eventOptions = useMemo(() => {
    const counts = new Map()
    for (const registration of enrichedAdminRegistrations) {
      if (!registration.event) continue
      counts.set(registration.event, (counts.get(registration.event) ?? 0) + 1)
    }
    const names = [...counts.keys()].sort((left, right) => left.localeCompare(right))
    return [
      ['all', t('admin.filters.allEvents'), enrichedAdminRegistrations.length],
      ...names.map((event) => [event, event, counts.get(event) ?? 0]),
    ]
  }, [enrichedAdminRegistrations, t])

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
          eventSlug: reg.eventSlug ?? null,
          category: `${reg.category} · ${reg.division}`,
          bodyweight: formatRegistrationWeight(reg),
          publicVisible: reg.publicVisible !== false,
          schedule: reg.schedule ?? null,
          status: reg.status,
          // La observación que escribió el operador al mover el estado, con su
          // firma y su fecha. Sin esto la columna pintaba un "Observada" pelado
          // y el motivo -- que sí se guarda -- no se leía en ninguna pantalla.
          stateBacking: resolveStateBacking(reg, payments),
          paymentStatus: payment?.status,
          paymentMethod: payment?.method,
          amount: payment ? money(payment.amount) : '—',
          paymentId: payment?.id,
          // La orden completa: el diálogo de validación necesita comprobante,
          // canal y notas, no sólo el id y el estado.
          payment: payment ?? null,
        }
      }),
    [filteredRegistrations, payments, resolvePayment],
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

  // Antes el resultado se descartaba en silencio: si la validación estaba
  // pausada (o cualquier otra falla), el botón "Validar" no hacía nada visible
  // y el operador no tenía forma de saber por qué. Ahora avisa por toast y, si
  // el 409 confirma el toggle apagado, sincroniza el estado local -- el fetch
  // de arriba corre una sola vez al montar la sección.
  async function handleApprovePayment(paymentId, options = {}) {
    const result = await onApprovePayment?.(paymentId, options)
    if (
      result?.code === VALIDATION_DISABLED_CODES.registration ||
      result?.code === VALIDATION_DISABLED_CODES.membership
    ) {
      setValidationEnabled(false)
    }
    // El resultado vuelve al diálogo: el aviso al operador y el toast salen de
    // `PaymentValidationAction`, que es el que sabe si sigue abierto.
    return result
  }

  async function togglePublicVisibility(row) {
    if (!onSetPublicVisibility || visibilityChangingId) return
    setVisibilityChangingId(row.id)
    try {
      await onSetPublicVisibility(row.id, !row.publicVisible)
    } finally {
      setVisibilityChangingId(null)
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

  function handleAffiliationChange(value) {
    onSetFilters((current) => ({ ...current, affiliationStatus: value }))
  }

  function handleGymChange(value) {
    onSetFilters((current) => ({ ...current, gym: value }))
  }

  function handleDivisionChange(value) {
    onSetFilters((current) => ({ ...current, division: value }))
  }

  function handleCreatedAtRangeChange(value) {
    onSetFilters((current) => ({ ...current, createdAtRange: value }))
  }

  function handleClearFilters() {
    onSetFilters((current) => ({
      ...current,
      event: 'all',
      status: 'all',
      affiliationStatus: 'all',
      gym: 'all',
      division: 'all',
      query: '',
      createdAtRange: { ...EMPTY_DATE_RANGE },
    }))
  }

  const eventCount = Math.max(0, eventOptions.length - 1)
  const eventFilter =
    eventCount <= 1
      ? null
      : {
          id: 'event',
          label: t('admin.filters.event'),
          value: filters.event ?? 'all',
          onChange: handleEventChange,
          options: eventOptions,
          variant: eventCount > EVENT_FILTER_CHIP_MAX ? 'select' : undefined,
          showLabel: true,
        }
  const affiliationFilter = {
    id: 'affiliationStatus',
    label: t('admin.filters.affiliation'),
    value: filters.affiliationStatus ?? 'all',
    onChange: handleAffiliationChange,
    options: affiliationOptions,
    showLabel: true,
  }
  const gymFilter = {
    id: 'gym',
    label: t('admin.filters.gym'),
    value: filters.gym ?? 'all',
    onChange: handleGymChange,
    options: gymOptions,
    variant: 'select',
  }
  const divisionFilter = {
    id: 'division',
    label: t('admin.filters.division'),
    value: filters.division ?? 'all',
    onChange: handleDivisionChange,
    options: divisionOptions,
    variant: 'select',
  }
  const createdAtRange = filters.createdAtRange ?? EMPTY_DATE_RANGE
  const createdAtFilter = {
    id: 'createdAtRange',
    label: t('admin.filters.registrationDate'),
    value: createdAtRange,
    onChange: handleCreatedAtRangeChange,
    variant: 'dateRange',
    defaultValue: { ...EMPTY_DATE_RANGE },
  }

  const savedViewSnapshot = useMemo(
    () => ({
      event: filters.event ?? 'all',
      status: filters.status ?? 'all',
      affiliationStatus: filters.affiliationStatus ?? 'all',
      gym: filters.gym ?? 'all',
      division: filters.division ?? 'all',
      query: filters.query ?? '',
      createdAtRange: {
        from: createdAtRange.from ?? '',
        to: createdAtRange.to ?? '',
      },
    }),
    [
      filters.event,
      filters.status,
      filters.affiliationStatus,
      filters.gym,
      filters.division,
      filters.query,
      createdAtRange,
    ],
  )
  const activeSavedView = useMemo(
    () => findMatchingView(savedViews, savedViewSnapshot),
    [savedViews, savedViewSnapshot],
  )
  const hasFiltersToSave =
    savedViewSnapshot.event !== 'all' ||
    savedViewSnapshot.status !== 'all' ||
    savedViewSnapshot.affiliationStatus !== 'all' ||
    savedViewSnapshot.gym !== 'all' ||
    savedViewSnapshot.division !== 'all' ||
    savedViewSnapshot.query.trim() !== '' ||
    Boolean(savedViewSnapshot.createdAtRange.from) ||
    Boolean(savedViewSnapshot.createdAtRange.to)

  function formatDateForSummary(isoDate) {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-AR')
  }

  // Resumen legible de filtros activos para el popover
  const filterSummary = useMemo(() => {
    const items = []
    if (savedViewSnapshot.query.trim()) items.push({ label: 'Búsqueda', value: savedViewSnapshot.query.trim() })
    if (savedViewSnapshot.event !== 'all') items.push({ label: t('admin.filters.event'), value: savedViewSnapshot.event })
    if (savedViewSnapshot.status !== 'all') {
      const opt = statusOptions.find(([v]) => v === savedViewSnapshot.status)
      if (opt) items.push({ label: t('admin.filters.status'), value: opt[1] })
    }
    if (savedViewSnapshot.affiliationStatus !== 'all') {
      const opt = affiliationOptions.find(([v]) => v === savedViewSnapshot.affiliationStatus)
      if (opt) items.push({ label: t('admin.filters.affiliation'), value: opt[1] })
    }
    if (savedViewSnapshot.gym !== 'all') {
      const opt = gymOptions.find(([v]) => v === savedViewSnapshot.gym)
      if (opt) items.push({ label: t('admin.filters.gym'), value: opt[1] })
    }
    if (savedViewSnapshot.division !== 'all') {
      const opt = divisionOptions.find(([v]) => v === savedViewSnapshot.division)
      if (opt) items.push({ label: t('admin.filters.division'), value: opt[1] })
    }
    const range = savedViewSnapshot.createdAtRange
    if (range.from || range.to) {
      const value =
        range.from && range.to
          ? `${formatDateForSummary(range.from)} – ${formatDateForSummary(range.to)}`
          : range.from
            ? t('admin.filters.registeredAtFrom', { date: formatDateForSummary(range.from) })
            : t('admin.filters.registeredAtTo', { date: formatDateForSummary(range.to) })
      items.push({ label: t('admin.filters.registrationDate'), value })
    }
    return items
  }, [savedViewSnapshot, statusOptions, affiliationOptions, gymOptions, divisionOptions, t])

  function applySavedView(view) {
    const snapshot = view.snapshot ?? {}
    onSetFilters((current) => ({
      ...current,
      ...snapshot,
      createdAtRange: {
        from: snapshot.createdAtRange?.from ?? '',
        to: snapshot.createdAtRange?.to ?? '',
      },
    }))
  }

  return (
    <>
      <AdminPaymentReconciliationAlert
        entries={unreconciledPayments}
        onSelectAthlete={onSelectAthlete}
      />
      {!validationEnabled ? (
        <div className="admin-payments-ops-callout" role="status">
          <AlertTriangle size={16} aria-hidden />
          <div className="admin-payments-ops-callout__body">
            <strong>{t('admin.sections.registrations.validationPaused')}</strong>
            <p>{t('admin.sections.registrations.validationPausedLead')}</p>
          </div>
        </div>
      ) : null}
      <AdminListSection
        variant="registrations"
        eyebrow={t('admin.sections.registrations.eyebrow')}
        filteredCount={registrationRows.length}
        filterLayout="panel"
        placeholder={t('admin.search.registration')}
        query={filters.query ?? ''}
        showHeader
        showStats={false}
        showFilters={!isGloballyEmpty}
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
                  value: filters.status,
                  onChange: handleStatusChange,
                  options: statusOptions,
                  showLabel: true,
                },
                affiliationFilter,
                gymFilter,
                divisionFilter,
                createdAtFilter,
              ].filter(Boolean)
        }
        onQueryChange={handleQueryChange}
        beforeFilters={
          isGloballyEmpty ? null : (
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
              onClear={handleClearFilters}
              onSave={(label) => saveView(label, savedViewSnapshot)}
              onRemove={removeView}
            />
          )
        }
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
              className="admin-data-table--registrations"
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
                  render: (row) => (
                    <EntitlementStateCell backing={row.stateBacking} status={row.status} />
                  ),
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
                  render: (row) => {
                    const canValidate = canValidateRegistrationPayment(row, canValidatePayments)
                    const canRecover = canRecoverRegistrationPayment(row, canForceSettle)
                    const hasActions =
                      canValidate || canRecover || canManageVisibility || canSetStatus || canDelete
                    if (!hasActions) return <AdminTableActionsEmpty />
                    return (
                      <AdminTableActions onClick={(event) => event.stopPropagation()}>
                        {canValidate ? (
                          /* Antes acreditaba de un click, sin abrir el
                             comprobante. Ahora es el mismo diálogo de Finanzas
                             y de la puerta: la evidencia se mira siempre. */
                          <PaymentValidationAction
                            athlete={{ fullName: row.athlete, documentId: row.document }}
                            detail={[row.event, row.category].filter(Boolean).join(' · ')}
                            disabled={!validationEnabled || !canApproveManualOrder(row.payment)}
                            label={
                              validationEnabled
                                ? t('admin.actions.validate')
                                : t('admin.athletePayments.validationPaused')
                            }
                            onApprove={handleApprovePayment}
                            onReject={onRejectPayment}
                            order={row.payment}
                          />
                        ) : null}
                        {canRecover ? (
                          /* "El pago figura cancelado pero la plata entró":
                             las mismas dos vías de Finanzas, sin tener que ir
                             a buscar esta misma orden en otra pantalla. */
                          <PaymentRecoveryAction
                            athlete={{ fullName: row.athlete, documentId: row.document }}
                            canForceSettle={canForceSettle}
                            detail={[row.event, row.category].filter(Boolean).join(' · ')}
                            onForceSettlePayment={onForceSettlePayment}
                            onRefreshAthleteData={onRefreshAthleteData}
                            order={row.payment}
                          />
                        ) : null}
                        {canManageVisibility && onSetPublicVisibility ? (
                          <AdminIconButton
                            disabled={visibilityChangingId === row.id}
                            icon={row.publicVisible ? EyeOff : Eye}
                            label={t(
                              row.publicVisible
                                ? 'admin.actions.hideRegistrationPublic'
                                : 'admin.actions.showRegistrationPublic',
                            )}
                            onClick={() => void togglePublicVisibility(row)}
                            spinning={visibilityChangingId === row.id}
                            variant="ghost"
                          />
                        ) : null}
                        {/* Anotar sin mover el estado. Va antes que "corregir
                            estado" porque es la acción menos invasiva de las
                            dos y la que más se usa: la mayoría de los casos se
                            resuelven anotando qué pasó, no cambiando nada. */}
                        <AdminIconButton
                          icon={MessageSquare}
                          label={t('admin.observations.open')}
                          onClick={() => setObservationsTarget(row)}
                          variant="ghost"
                        />
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
                    )
                  },
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
            {observationsTarget ? (
              <ObservationsDialog
                canWrite={canSetStatus}
                registration={observationsTarget}
                onClose={() => setObservationsTarget(null)}
                onChange={onRefreshAthleteData}
              />
            ) : null}
          </>
        )}
      </AdminListSection>
    </>
  )
}
