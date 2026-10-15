import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ClipboardList,
  Eye,
  EyeOff,
  Mail,
  MessageSquare,
  PencilLine,
  Trash2,
  Users,
} from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import ObservationsDialog from '../../components/admin/ObservationsDialog.jsx'
import RegistrationStatusDialog from '../../components/admin/RegistrationStatusDialog.jsx'
import RegistrationNotifyDialog from '../../components/admin/RegistrationNotifyDialog.jsx'
import AdminBulkRegistrationStatusDialog from '../../components/admin/AdminBulkRegistrationStatusDialog.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminPaymentReconciliationAlert from '../../components/admin/AdminPaymentReconciliationAlert.jsx'
import AdminScheduleAssigner from '../../components/admin/AdminScheduleAssigner.jsx'
import PaymentRecoveryAction from '../../components/admin/PaymentRecoveryAction.jsx'
import PaymentValidationAction from '../../components/admin/PaymentValidationAction.jsx'
import PaymentValidationDialog from '../../components/admin/PaymentValidationDialog.jsx'
import {
  AdminActionOverflow,
  AdminIdentityCell,
  AdminPaymentCell,
  AdminProofCell,
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
import {
  formatScheduleDate,
  formatScheduleSummary,
  hasScheduledDay,
} from '../../lib/eventSchedule.js'
import { money } from '../../lib/format.js'
import {
  createRegistrationPaymentIndex,
  matchesRegistrationStatusFilter,
  resolveRegistrationPayment,
} from '../../services/registrationAdminService.js'
import {
  buildPaymentValidationItem,
  canForceSettleOrder,
  canApproveManualOrder,
  describePaymentProof,
  isManualOrder,
  isOpenOrder,
} from '../../services/paymentValidationService.js'
import {
  fetchPlatformFeatureToggles,
  VALIDATION_DISABLED_CODES,
} from '../../services/platformSettingsAdminService.js'
import { isPlaceholderReason, resolveStateBacking } from '../../services/stateCoherenceService.js'
import { notifyError as toastError, notifySuccess as toastSuccess } from '../../lib/adminToast.js'
import {
  buildAdminFacetOptions,
} from '../../lib/adminPeopleFilters.js'
import { registrationEventFilterKey } from '../../lib/athleteEventStatus.js'

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
 * Con el pago ya aprobado no hay nada que recuperar: ofrecerlo era ruido en
 * cada fila sana y la acción que el operador más necesita quedaba debajo.
 */
function canRecoverRegistrationPayment(row, canForceSettle) {
  if (!row.payment || row.payment.status === 'aprobado') return false
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
  onBulkSetRegistrationStatus,
  onNotifyRegistrations,
  onPreviewRegistrationNotification,
  onDismissQueueItem,
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
  // Ninguno de los permisos que habilitan una acción sobre esta lista: el rol
  // activo la ve, pero no puede tocar nada en ella (ej. el rol "PLU" por
  // defecto, que lee inscripciones sin poder editarlas ni validar pagos).
  const hasAnyRegistrationEditCapability =
    canSetStatus || canValidatePayments || canForceSettle || canManageVisibility || canDelete
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [visibilityChangingId, setVisibilityChangingId] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [observationsTarget, setObservationsTarget] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [notifyTarget, setNotifyTarget] = useState(null)
  const [notifyError, setNotifyError] = useState('')
  const [notifyResult, setNotifyResult] = useState(null)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [bulkStatusError, setBulkStatusError] = useState('')
  const [savingBulkStatus, setSavingBulkStatus] = useState(false)
  const [validationEnabled, setValidationEnabled] = useState(true)
  const [proofTarget, setProofTarget] = useState(null)

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
      const key = registrationEventFilterKey(registration)
      if (!key) continue
      const label = String(registration.event ?? key).trim() || key
      const current = counts.get(key)
      counts.set(key, {
        label: current?.label ?? label,
        count: (current?.count ?? 0) + 1,
      })
    }
    const entries = [...counts.entries()].sort(([, left], [, right]) =>
      left.label.localeCompare(right.label, 'es'),
    )
    return [
      ['all', t('admin.filters.allEvents'), enrichedAdminRegistrations.length],
      ...entries.map(([value, entry]) => [value, entry.label, entry.count]),
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
          // Motivo ya guardado al cancelar, para precargar el aviso por mail.
          reasonHint:
            reg.manualOverride?.reason && !isPlaceholderReason(reg.manualOverride.reason)
              ? reg.manualOverride.reason
              : '',
          paymentStatus: payment?.status,
          paymentMethod: payment?.method,
          amount: payment ? money(payment.amount) : '—',
          paymentId: payment?.id,
          // Qué mostrar en la columna de comprobante, sin abrir nada.
          proof: describePaymentProof(payment),
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

  async function saveRegistrationStatus(status, reason, notify) {
    if (!statusTarget || !onSetRegistrationStatus) return
    setSavingStatus(true)
    setStatusError('')
    try {
      const result = await onSetRegistrationStatus(statusTarget.id, status, reason)
      if (result?.error) {
        setStatusError(result.error)
        return
      }
      const cancelledId = statusTarget.id
      setStatusTarget(null)
      // El aviso va por toast porque el diálogo ya se cerró: cambiar el
      // estado es la acción principal, avisar por mail es un paso opcional
      // sobre esa misma acción, no algo que valga la pena bloquear la
      // pantalla para confirmar.
      if (notify && status === 'cancelada' && onNotifyRegistrations) {
        void notifyAfterCancel(cancelledId, reason)
      }
    } catch (error) {
      setStatusError(error?.message ?? 'No se pudo cambiar el estado de la inscripción.')
    } finally {
      setSavingStatus(false)
    }
  }

  async function notifyAfterCancel(registrationId, reason) {
    try {
      const response = await onNotifyRegistrations([registrationId], {
        type: 'registration_cancelled',
        message: reason,
      })
      if (response?.error) {
        toastError(response.error)
        return
      }
      const outcome = response?.results?.[0]
      if (outcome?.status === 'sent') {
        toastSuccess(t('admin.toasts.registrationCancelledNotified'))
        dismissCancelledNotifyQueueItem(registrationId)
      } else if (outcome?.status === 'skipped') {
        toastError(t('admin.toasts.registrationNotifySkipped', { reason: outcome.reason ?? '' }))
      } else {
        toastError(t('admin.toasts.registrationNotifyFailed'))
      }
    } catch (error) {
      toastError(error?.message ?? t('admin.toasts.registrationNotifyFailed'))
    }
  }

  // Best-effort: la cola de pendientes es una comodidad de navegación, no una
  // fuente de verdad. Si falla (sin permiso, offline momentáneo) el aviso ya
  // salió igual y el ítem cae solo de la cola cuando venza la ventana.
  function dismissCancelledNotifyQueueItem(registrationId) {
    onDismissQueueItem?.(`action-cancel-notify-${registrationId}`, 'cancelled_registration')?.catch?.(
      () => {},
    )
  }

  async function saveBulkStatus(status, reason, notify) {
    if (!onBulkSetRegistrationStatus || visibleSelectedRows.length === 0) return
    const ids = visibleSelectedRows.map((row) => row.id)
    setSavingBulkStatus(true)
    setBulkStatusError('')
    try {
      const response = await onBulkSetRegistrationStatus(ids, status, reason)
      if (response?.error) {
        setBulkStatusError(response.error)
        return
      }
      const updated = response?.updated ?? 0
      const failed = response?.failed ?? 0
      setBulkStatusOpen(false)
      clearSelection()
      if (failed === 0) {
        toastSuccess(t('admin.registrationBulkStatus.resultUpdated', { count: updated }))
      } else if (updated > 0) {
        toastError(t('admin.registrationBulkStatus.resultPartial', { updated, failed }))
      } else {
        toastError(t('admin.registrationBulkStatus.resultFailed'))
      }
      // El aviso por mail va sobre lo que efectivamente quedó cancelado, no
      // sobre lo que se pidió cancelar -- una fila que falló acá tampoco
      // tiene sentido avisarla.
      if (notify && status === 'cancelada' && updated > 0 && onNotifyRegistrations) {
        const updatedIds = (response?.results ?? [])
          .filter((row) => row.status === 'updated')
          .map((row) => row.registrationId)
        void notifyManyAfterBulkCancel(updatedIds, reason)
      }
    } catch (error) {
      setBulkStatusError(error?.message ?? 'No se pudo cambiar el estado de las inscripciones.')
    } finally {
      setSavingBulkStatus(false)
    }
  }

  async function notifyManyAfterBulkCancel(registrationIds, reason) {
    try {
      const response = await onNotifyRegistrations(registrationIds, {
        type: 'registration_cancelled',
        message: reason,
      })
      if (response?.error) {
        toastError(response.error)
        return
      }
      const sent = (response?.results ?? []).filter((row) => row.status === 'sent').length
      if (sent > 0) toastSuccess(t('admin.toasts.registrationCancelledNotified'))
      if (sent < registrationIds.length) {
        toastError(
          t('admin.toasts.registrationNotifySkipped', {
            reason: `${registrationIds.length - sent}/${registrationIds.length}`,
          }),
        )
      }
    } catch (error) {
      toastError(error?.message ?? t('admin.toasts.registrationNotifyFailed'))
    }
  }

  async function sendRegistrationNotify(type, message) {
    if (!notifyTarget || !onNotifyRegistrations) return
    setSendingNotify(true)
    setNotifyError('')
    setNotifyResult(null)
    try {
      const response = await onNotifyRegistrations([notifyTarget.id], { type, message })
      if (response?.error) {
        setNotifyError(response.error)
        return
      }
      const outcome = response?.results?.[0] ?? null
      setNotifyResult(outcome)
      if (outcome?.status === 'sent') {
        dismissCancelledNotifyQueueItem(notifyTarget.id)
        setNotifyTarget(null)
      }
    } catch (error) {
      setNotifyError(error?.message ?? 'No se pudo enviar el aviso.')
    } finally {
      setSendingNotify(false)
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
    advanced: true,
  }
  const gymFilter = {
    id: 'gym',
    label: t('admin.filters.gym'),
    value: filters.gym ?? 'all',
    onChange: handleGymChange,
    options: gymOptions,
    variant: 'select',
    advanced: true,
  }
  const divisionFilter = {
    id: 'division',
    label: t('admin.filters.division'),
    value: filters.division ?? 'all',
    onChange: handleDivisionChange,
    options: divisionOptions,
    variant: 'select',
    advanced: true,
  }
  const createdAtRange = filters.createdAtRange ?? EMPTY_DATE_RANGE
  const createdAtFilter = {
    id: 'createdAtRange',
    label: t('admin.filters.registrationDate'),
    value: createdAtRange,
    onChange: handleCreatedAtRangeChange,
    variant: 'dateRange',
    defaultValue: { ...EMPTY_DATE_RANGE },
    advanced: true,
  }

  // En la card compacta las secundarias van al menú “más”: el footer no
  // puede ser una franja de 44px. Validar queda a la vista.
  function renderRowActions(row, { compact = false } = {}) {
    const canValidate = canValidateRegistrationPayment(row, canValidatePayments)
    const canRecover = canRecoverRegistrationPayment(row, canForceSettle)
    const hasActions =
      canValidate || canRecover || canManageVisibility || canSetStatus || canDelete
    if (!hasActions) return compact ? null : <AdminTableActionsEmpty />

    const validateAction = canValidate ? (
      <PaymentValidationAction
        key="validate"
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
    ) : null
    const recoverAction = canRecover ? (
      <PaymentRecoveryAction
        key="recover"
        athlete={{ fullName: row.athlete, documentId: row.document }}
        canForceSettle={canForceSettle}
        detail={[row.event, row.category].filter(Boolean).join(' · ')}
        onForceSettlePayment={onForceSettlePayment}
        onRefreshAthleteData={onRefreshAthleteData}
        order={row.payment}
      />
    ) : null

    const secondary = [
      <AdminIconButton
        key="observations"
        icon={MessageSquare}
        label={t('admin.observations.open')}
        onClick={() => setObservationsTarget(row)}
        variant="ghost"
      />,
      canManageVisibility && onSetPublicVisibility ? (
        <AdminIconButton
          key="visibility"
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
      ) : null,
      canSetStatus && onSetRegistrationStatus ? (
        <AdminIconButton
          key="status"
          icon={PencilLine}
          label={t('admin.registrationStatus.action')}
          onClick={() => {
            setStatusError('')
            setStatusTarget(row)
          }}
          variant="ghost"
        />
      ) : null,
      canSetStatus && onNotifyRegistrations && row.status === 'cancelada' ? (
        <AdminIconButton
          key="notify"
          icon={Mail}
          label={t('admin.registrationNotify.action')}
          onClick={() => {
            setNotifyError('')
            setNotifyResult(null)
            setNotifyTarget(row)
          }}
          variant="ghost"
        />
      ) : null,
      canDelete ? (
        <AdminIconButton
          key="delete"
          icon={Trash2}
          label="Eliminar inscripción"
          onClick={() => {
            setDeleteError('')
            setDeleteTarget(row)
          }}
          variant="danger"
        />
      ) : null,
    ].filter(Boolean)

    // Una acción a la vista (validar, o la primera secundaria) y el resto en el
    // menú "más", también en escritorio: una fila con cuatro íconos sueltos se
    // leía como una barra de herramientas por cada atleta. Recuperar un pago va
    // siempre al menú — son hasta tres botones y solo aplican a pagos caídos.
    const primaryActions = validateAction ? [validateAction] : secondary.slice(0, 1)
    const overflowActions = [
      ...(validateAction ? secondary : secondary.slice(1)),
      recoverAction,
    ].filter(Boolean)

    return (
      <AdminTableActions onClick={(event) => event.stopPropagation()}>
        {primaryActions}
        {overflowActions.length > 0 ? (
          <AdminActionOverflow label={t('admin.actions.more')}>
            {overflowActions}
          </AdminActionOverflow>
        ) : null}
      </AdminTableActions>
    )
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
        filterLayout="toolbar"
        compactHeader
        eyebrow={t('admin.sections.registrations.eyebrow')}
        filteredCount={registrationRows.length}
        placeholder={t('admin.search.registration')}
        query={filters.query ?? ''}
        showHeader
        showStats={false}
        showFilters={!isGloballyEmpty}
        title={t('admin.sections.registrations.title')}
        subtitle={t('admin.sections.registrations.subtitle')}
        readOnlyHint={
          !hasAnyRegistrationEditCapability ? t('admin.sections.registrations.readOnlyHint') : null
        }
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
                  surface: 'rail',
                  label: t('admin.filters.status'),
                  value: filters.status,
                  onChange: handleStatusChange,
                  options: statusOptions,
                },
                affiliationFilter,
                gymFilter,
                divisionFilter,
                createdAtFilter,
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
                extraAction={
                  canSetStatus && onBulkSetRegistrationStatus ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="btn--small"
                      onClick={() => {
                        setBulkStatusError('')
                        setBulkStatusOpen(true)
                      }}
                    >
                      <Users size={14} aria-hidden />
                      {t('admin.registrationBulkStatus.action')}
                    </Button>
                  ) : null
                }
              />
            )}
            {/* Sin permiso de grilla no hay barra de arriba que lleve la
                cuenta de la selección -- esta es la única, no una segunda. */}
            {!canAssignSchedule &&
            canSetStatus &&
            onBulkSetRegistrationStatus &&
            visibleSelectedRows.length > 0 ? (
              <div
                className="admin-bulk-status-bar"
                role="region"
                aria-label={t('admin.registrationBulkStatus.action')}
              >
                <span className="admin-bulk-status-bar__lead">
                  <Users size={15} aria-hidden />
                  {t('admin.schedule.selectedCount', { count: visibleSelectedRows.length })}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="btn--small"
                  onClick={() => {
                    setBulkStatusError('')
                    setBulkStatusOpen(true)
                  }}
                >
                  {t('admin.registrationBulkStatus.action')}
                </Button>
              </div>
            ) : null}
            <AdminDataTable
              className="admin-data-table--registrations"
              density="compact"
              fit
              columns={[
                ...(canAssignSchedule
                  ? [
                      {
                        key: 'select',
                        width: 44,
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
                  // Todas las columnas llevan ancho: la planilla es de layout
                  // fijo, el sobrante se reparte entre ellas en proporción y la
                  // suma (~910px) es lo mínimo antes de que se corte la acción.
                  // Sin ancho, esta absorbía todo (700px para un nombre y un
                  // gimnasio) y apretaba el resto.
                  width: 168,
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
                  // Tabla: evento y, debajo, categoría · división · peso. Cards:
                  // el evento solo; categoría y peso van en sus propias filas.
                  key: 'event',
                  label: t('admin.columns.event'),
                  width: 120,
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  sortable: true,
                  render: (row) => (
                    <div className="data-table__stack">
                      <span className="data-table__stack-main">{row.event}</span>
                      <span className="data-table__sub">
                        {[row.category, row.bodyweight].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  ),
                  mobileRender: (row) => row.event,
                },
                {
                  key: 'category',
                  label: t('admin.columns.category'),
                  cardOnly: true,
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  mobileSortable: false,
                  sortable: false,
                },
                {
                  key: 'bodyweight',
                  label: t('admin.columns.weight'),
                  cardOnly: true,
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
                  width: 96,
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  mobileSortable: false,
                  sortable: true,
                  sortAccessor: (row) => formatScheduleSummary(row.schedule, locale),
                  render: (row) => {
                    // Día y fecha arriba, tanda abajo: en una sola línea se
                    // cortaba con puntos suspensivos ("Día 1 · sáb 14 n…").
                    if (!hasScheduledDay(row.schedule)) {
                      return (
                        <span className="admin-muted-text">
                          {t('admin.schedule.unassignedShort')}
                        </span>
                      )
                    }
                    const day = [row.schedule.dayLabel, formatScheduleDate(row.schedule, locale)]
                      .filter(Boolean)
                      .join(' · ')
                    return (
                      <div className="data-table__stack" title={formatScheduleSummary(row.schedule, locale)}>
                        <span className="data-table__stack-main">{day}</span>
                        {row.schedule.sessionName ? (
                          <span className="data-table__sub">{row.schedule.sessionName}</span>
                        ) : null}
                      </div>
                    )
                  },
                },
                {
                  key: 'status',
                  label: t('admin.columns.status'),
                  width: 152,
                  mobile: 'badge',
                  sortable: true,
                  render: (row) => (
                    <EntitlementStateCell backing={row.stateBacking} status={row.status} />
                  ),
                },
                {
                  key: 'payment',
                  label: t('admin.columns.payment'),
                  width: 136,
                  mobile: 'badge',
                  mobileSortable: false,
                  sortable: true,
                  sortAccessor: (row) => row.amount,
                  render: (row) => (
                    <AdminPaymentCell amount={row.amount} status={row.paymentStatus} />
                  ),
                },
                {
                  // Siempre a la vista: adjunto (se abre en lectura), efectivo,
                  // Mercado Pago o "Sin comprobante". Sin precargar binarios.
                  key: 'proof',
                  label: t('admin.columns.proof'),
                  width: 120,
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  mobileSortable: false,
                  sortable: false,
                  render: (row) => (
                    <AdminProofCell
                      proof={row.proof}
                      viewLabel={t('admin.registrationProof.viewAria', { name: row.athlete ?? '' })}
                      onView={() => setProofTarget(row)}
                    />
                  ),
                },
                {
                  key: 'action',
                  label: t('admin.columns.action'),
                  width: 84,
                  mobile: 'action',
                  render: (row) => renderRowActions(row),
                  mobileRender: (row) => renderRowActions(row, { compact: true }),
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
                onPreview={
                  onPreviewRegistrationNotification
                    ? (type, message) =>
                        onPreviewRegistrationNotification(statusTarget.id, { type, message })
                    : undefined
                }
              />
            ) : null}
            {proofTarget?.payment ? (
              <PaymentValidationDialog
                item={buildPaymentValidationItem(proofTarget.payment, {
                  mode: 'view',
                  athlete: { fullName: proofTarget.athlete, documentId: proofTarget.document },
                  detail: [proofTarget.event, proofTarget.category].filter(Boolean).join(' · '),
                  meta: proofTarget.amount,
                })}
                mode="view"
                onCancel={() => setProofTarget(null)}
                onConfirm={() => {}}
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
            {notifyTarget ? (
              <RegistrationNotifyDialog
                registration={notifyTarget}
                busy={sendingNotify}
                error={notifyError}
                result={notifyResult}
                onCancel={() => {
                  if (!sendingNotify) setNotifyTarget(null)
                }}
                onConfirm={sendRegistrationNotify}
                onPreview={
                  onPreviewRegistrationNotification
                    ? (type, message) =>
                        onPreviewRegistrationNotification(notifyTarget.id, { type, message })
                    : undefined
                }
              />
            ) : null}
            {bulkStatusOpen ? (
              <AdminBulkRegistrationStatusDialog
                count={visibleSelectedRows.length}
                busy={savingBulkStatus}
                error={bulkStatusError}
                onCancel={() => {
                  if (!savingBulkStatus) setBulkStatusOpen(false)
                }}
                onConfirm={saveBulkStatus}
              />
            ) : null}
          </>
        )}
      </AdminListSection>
    </>
  )
}
