import { formatModalities } from '../../../shared/registrationSelection.js'
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
  Upload,
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
import RegistrationSheetImportDialog from '../../components/admin/RegistrationSheetImportDialog.jsx'
import { downloadRegistrationSheet } from '../../services/registrationSheetService.js'
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
  buildAdminDivisionOptions,
  buildAdminFacetOptions,
} from '../../lib/adminPeopleFilters.js'
import {
  matchesRegistrationEventFilter,
  registrationEventFilterKey,
} from '../../lib/athleteEventStatus.js'
import { ageOnDate, todayCalendarDate } from '../../../shared/ageDivision.js'
import { normalizeGender } from '../../../shared/competitionLexicon.js'
import { formatDeclaredBodyWeight, formatExportDateDmy } from '../../../shared/exportRows.js'
import {
  LIFTERS_COLUMNS,
  classifyLifterExportRow,
  filterLiftersRowsByCompleteness,
  liftersImportColumnsMissing,
  liftersRowsForSpreadsheet,
  resolveLiftersColumnKeys,
  summarizeLifterMeet,
  validateLifterExport,
} from '../../../shared/liftersExport.js'
import {
  competitionBodyweight,
  competitionWeightClass,
  getWeightClassWarning,
  suggestWeightClass,
  weightClassLabelsForSex,
} from '../../../shared/pluWeightClasses.js'
import {
  correctOfficialWeightClass,
  correctRegistrationWeightClass,
  correctRegistrationsWeightClass,
  recordRegistrationWeighIn,
  setEventRosterFrozen,
} from '../../services/athleteApi.js'
import {
  loadLiftersExportStudioOptions,
  saveLiftersExportStudioOptions,
} from '../../lib/liftersExportStudio.js'

// Fallback estable para cuando no llega la prop (Storybook, tests) — evita
// tener que null-check `gatePendingIds` en cada lugar que lo usa.
const EMPTY_GATE_PENDING_IDS = new Set()
/** Con un solo evento el filtro no decide nada. Select nativo recién con muchos. */
function editStamp(actor, at) {
  const email = String(actor ?? '').includes(':')
    ? String(actor).split(':').slice(1).join(':')
    : String(actor ?? '')
  const match = String(at ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = match ? `${match[3]}/${match[2]}/${match[1]}` : ''
  return [email, date].filter(Boolean).join(' · ')
}

function registrationMeet(registration) {
  const bodyweight = formatDeclaredBodyWeight(
    registration.bodyweight ?? registration.athlete?.estimatedWeight,
  )
  const weighInBodyweight = formatDeclaredBodyWeight(registration.weighInBodyweight)
  const declaredClass = String(registration.declaredWeightClass ?? '').trim()
  const officialClass = String(registration.officialWeightClass ?? '').trim()
  const weightClass = competitionWeightClass(registration)
  const competitionKg = formatDeclaredBodyWeight(competitionBodyweight(registration)) || bodyweight
  const sheetRow = {
    name: registration.athlete?.fullName ?? '',
    gender: normalizeGender(registration.athlete?.sex),
    rawOrEquipped: registration.category ?? '',
    division: registration.division ?? '',
    declaredAwardsWeightClass: weightClass,
    bodyWeight: competitionKg,
    birthDate: formatExportDateDmy(registration.athlete?.birthDate),
    squatOpener: '',
    benchOpener: '',
    deadliftOpener: '',
    _meta: {
      athleteId: registration.athleteId ?? null,
      bodyweightSource: weighInBodyweight ? 'weigh-in' : 'declared',
      declaredWeightClass: declaredClass,
      officialWeightClass: officialClass,
      weighInBodyweight,
      rosterFrozen: Boolean(registration.rosterFrozenAt),
    },
  }
  return {
    sex: registration.athlete?.sex ?? '',
    age: ageOnDate(
      registration.athlete?.birthDate,
      registration.eventStartsAt || todayCalendarDate(),
    ),
    equipment: registration.category ?? '',
    division: registration.division ?? '',
    bodyweight,
    weighInBodyweight,
    declaredClass,
    officialClass,
    weightClass,
    suggestedClass: suggestWeightClass(registration.athlete?.sex, weighInBodyweight || bodyweight),
    rosterFrozen: Boolean(registration.rosterFrozenAt),
    declaredStamp: editStamp(registration.declaredWeightClassSetBy, registration.declaredWeightClassSetAt),
    officialStamp: editStamp(registration.officialWeightClassSetBy, registration.officialWeightClassSetAt),
    weighInStamp: editStamp(registration.weighInRecordedBy, registration.weighInRecordedAt),
    warning: getWeightClassWarning(competitionKg, weightClass, {
      source: weighInBodyweight ? 'weigh-in' : 'declared',
    }),
    exportStatus: classifyLifterExportRow(sheetRow),
  }
}

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

function liftersScopeSlug(value) {
  const slug = String(value ?? '').trim()
  return slug && slug !== 'all' ? slug : null
}

const LIFTERS_COLUMN_GROUPS = [
  ['identity', ['name', 'team', 'gender', 'birthDate', 'memberNumber']],
  ['session', ['lot', 'platform', 'session', 'flight']],
  ['class', ['rawOrEquipped', 'division', 'declaredAwardsWeightClass', 'bodyWeight']],
  ['lifts', ['squatOpener', 'benchOpener', 'deadliftOpener', 'squatRackHeight', 'benchRackHeight', 'deadliftRackHeight']],
  ['contact', ['country', 'state', 'instagram', 'notes']],
]

/**
 * "Raw · Junior + Open · Full Power + Banco": categoría, divisiones y, solo si no
 * es la modalidad de siempre, las modalidades del torneo.
 */
function registrationEntryLabel(reg) {
  const divisions = [reg.division, reg.secondaryDivision].filter(Boolean).join(' + ')
  const modalities = reg.modalities ?? []
  const customModalities =
    modalities.length > 0 && !(modalities.length === 1 && modalities[0] === 'full_power')
  return [
    `${reg.category} · ${divisions}`,
    customModalities ? formatModalities(modalities) : '',
  ]
    .filter(Boolean)
    .join(' · ')
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
  onExportLifters,
  onFetchLiftersReadiness,
  onNotifyAthletesIncomplete,
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
  const [sheetImportOpen, setSheetImportOpen] = useState(false)
  const [sheetExporting, setSheetExporting] = useState(false)
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
  const [liftersOpen, setLiftersOpen] = useState(false)
  const [liftersLoading, setLiftersLoading] = useState(false)
  const [liftersNotifying, setLiftersNotifying] = useState(false)
  const [liftersReadiness, setLiftersReadiness] = useState(null)
  const [liftersError, setLiftersError] = useState('')
  const [liftersStudio, setLiftersStudio] = useState(() => loadLiftersExportStudioOptions())
  const [liftersEventSlug, setLiftersEventSlug] = useState('all')
  const [liftersSheetRows, setLiftersSheetRows] = useState([])
  const [classEdit, setClassEdit] = useState(null)
  const [classEditMode, setClassEditMode] = useState('declared')
  const [classEditValue, setClassEditValue] = useState('')
  const [bulkClassOpen, setBulkClassOpen] = useState(false)
  const [bulkClassValue, setBulkClassValue] = useState('')
  const [bulkClassError, setBulkClassError] = useState('')
  const [savingBulkClass, setSavingBulkClass] = useState(false)
  const [freezingRoster, setFreezingRoster] = useState(false)
  const [rosterError, setRosterError] = useState('')
  const [classEditError, setClassEditError] = useState('')
  const [savingClass, setSavingClass] = useState(false)

  const updateLiftersStudio = useCallback((patch) => {
    setLiftersStudio((prev) => {
      const next = { ...prev, ...patch }
      if ('preset' in patch && !('columns' in patch)) next.columns = null
      return saveLiftersExportStudioOptions(next)
    })
  }, [])

  const liftersSelectedColumns = useMemo(
    () => resolveLiftersColumnKeys(liftersStudio),
    [liftersStudio],
  )

  const toggleLiftersColumn = useCallback((key) => {
    setLiftersStudio((prev) => {
      const current = resolveLiftersColumnKeys(prev)
      if (current.includes(key) && current.length === 1) return prev
      const selected = new Set(current)
      if (selected.has(key)) selected.delete(key)
      else selected.add(key)
      const columns = LIFTERS_COLUMNS.map((column) => column.key).filter((item) => selected.has(item))
      return saveLiftersExportStudioOptions({ ...prev, columns })
    })
  }, [])

  const liftersPreview = useMemo(() => {
    if (!liftersReadiness) return null
    const total = liftersReadiness.total ?? 0
    const incomplete = liftersReadiness.incomplete ?? 0
    const complete = liftersReadiness.complete ?? Math.max(0, total - incomplete)
    const rowCount =
      liftersStudio.rowFilter === 'complete'
        ? complete
        : liftersStudio.rowFilter === 'incomplete'
          ? incomplete
          : total
    return {
      rowCount,
      columnCount: resolveLiftersColumnKeys(liftersStudio).length,
    }
  }, [liftersReadiness, liftersStudio])

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

  // Las pestañas de estado cuentan dentro del evento elegido: con "Todos 12"
  // frente a una lista de 4 filas el número no coincidía con lo que se ve.
  const { statusCounts, affiliationCounts } = useMemo(
    () =>
      buildRegistrationFilterCounts(
        enrichedAdminRegistrations.filter((registration) =>
          matchesRegistrationEventFilter(registration, filters.event),
        ),
        resolvePayment,
        gatePendingIds,
      ),
    [enrichedAdminRegistrations, filters.event, resolvePayment, gatePendingIds],
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
      buildAdminDivisionOptions(enrichedAdminRegistrations, t('admin.filters.allDivisions')),
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
  const liftersEventLabel = useMemo(() => {
    const selected = liftersEventSlug && liftersEventSlug !== 'all' ? liftersEventSlug : 'all'
    const match = eventOptions.find((option) => option[0] === selected)
    return match?.[1] ?? t('admin.filters.allEvents')
  }, [eventOptions, liftersEventSlug, t])

  const loadLiftersReadiness = useCallback(
    async (nextSlug) => {
      const slug = nextSlug && nextSlug !== 'all' ? nextSlug : 'all'
      setLiftersEventSlug(slug)
      setLiftersOpen(true)
      setLiftersLoading(true)
      setLiftersError('')
      const result = await onFetchLiftersReadiness?.({ eventSlug: liftersScopeSlug(slug) })
      setLiftersLoading(false)
      if (result?.error) {
        setLiftersError(result.error)
        setLiftersReadiness(null)
        return
      }
      setLiftersReadiness(result?.readiness ?? null)
      setLiftersSheetRows(result?.rows ?? [])
    },
    [onFetchLiftersReadiness],
  )

  const liftersFileCheck = useMemo(() => {
    const filtered = filterLiftersRowsByCompleteness(liftersSheetRows, liftersStudio.rowFilter)
    if (!liftersSheetRows.length) return null
    return validateLifterExport(filtered)
  }, [liftersSheetRows, liftersStudio.rowFilter])

  const liftersMeetSummary = useMemo(() => {
    const filtered = filterLiftersRowsByCompleteness(liftersSheetRows, liftersStudio.rowFilter)
    if (!filtered.length) return null
    return summarizeLifterMeet(filtered)
  }, [liftersSheetRows, liftersStudio.rowFilter])

  const liftersImportBlocked = liftersImportColumnsMissing(liftersStudio)

  const liftersFilePreview = useMemo(() => {
    const keys = resolveLiftersColumnKeys(liftersStudio)
    const filtered = filterLiftersRowsByCompleteness(liftersSheetRows, liftersStudio.rowFilter)
    return {
      columns: keys,
      rows: liftersRowsForSpreadsheet(filtered, keys).slice(0, 5),
    }
  }, [liftersSheetRows, liftersStudio])

  const sheetEventSlug = filters.event && filters.event !== 'all' ? filters.event : null

  /** Planilla .xlsx de lo que muestra la tabla (con sus filtros). */
  async function exportRegistrationSheet() {
    if (!filteredRegistrations.length) {
      toastError(t('admin.registrationSheet.exportEmpty'))
      return
    }
    setSheetExporting(true)
    try {
      const result = await downloadRegistrationSheet({
        registrations: filteredRegistrations,
        athletes,
        payments,
        scope: sheetEventSlug ?? '',
      })
      if (result.ok) toastSuccess(t('admin.registrationSheet.exportDone', { count: result.rows }))
    } catch (error) {
      console.warn('No se pudo generar la planilla de inscripciones.', error)
      toastError(t('admin.registrationSheet.exportError'))
    } finally {
      setSheetExporting(false)
    }
  }

  const registrationRows = useMemo(
    () =>
      filteredRegistrations.map((reg) => {
        const payment = resolvePayment(reg)
        const meet = registrationMeet(reg)
        return {
          id: reg.id,
          athlete: reg.athlete?.fullName,
          athleteId: reg.athleteId,
          document: reg.athlete?.documentId,
          gym: reg.athlete?.gym ?? '',
          photoUrl: reg.athlete?.photoUrl ?? null,
          event: reg.event,
          eventSlug: reg.eventSlug ?? null,
          category: registrationEntryLabel(reg),
          bodyweight: formatRegistrationWeight(reg),
          meet,
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

  const bulkClassLabels = useMemo(() => {
    if (!visibleSelectedRows.length || visibleSelectedRows.some((row) => !row.meet?.sex)) return []
    const lists = [...new Set(visibleSelectedRows.map((row) => row.meet.sex))].map((sex) =>
      weightClassLabelsForSex(sex),
    )
    return lists.reduce((shared, list) => shared.filter((label) => list.includes(label)))
  }, [visibleSelectedRows])
  const selectedRosterFrozen = visibleSelectedRows.some((row) => row.meet?.rosterFrozen)

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
  const singleEventScope = Boolean(filters.event && filters.event !== 'all')
  const eventFilter =
    eventCount <= 1
      ? null
      : {
          id: 'event',
          label: t('admin.filters.event'),
          value: filters.event ?? 'all',
          onChange: handleEventChange,
          options: eventOptions,
          // Siempre a la vista junto al buscador: decide qué filas ve y qué
          // exporta quien opera varios meets a la vez.
          surface: 'scope',
          variant: 'select',
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
      {liftersOpen ? (
        <div
          className="admin-lifters-export"
          role="region"
          aria-label={t('admin.actions.exportLifters')}
        >
          <div className="admin-lifters-export__head">
            <div className="admin-lifters-export__head-copy">
              <strong className="admin-lifters-export__title">{t('admin.liftersExport.title')}</strong>
              <label className="admin-lifters-export__field admin-lifters-export__event-field">
                <span>{t('admin.liftersExport.eventLabel')}</span>
                <select
                  value={liftersEventSlug}
                  disabled={liftersLoading}
                  onChange={(event) => {
                    void loadLiftersReadiness(event.target.value)
                  }}
                >
                  {eventOptions.map(([value, label, count]) => (
                    <option key={value} value={value}>
                      {value === 'all' || count == null ? label : `${label} (${count})`}
                    </option>
                  ))}
                </select>
              </label>
              {liftersEventSlug === 'all' ? (
                <p className="admin-lifters-export__mixed">{t('admin.liftersExport.mixedEvents')}</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" onClick={() => setLiftersOpen(false)}>
              {t('admin.liftersExport.close')}
            </Button>
          </div>
          <ol className="admin-lifters-export__steps">
            <li className="admin-lifters-export__step">
              <div>
                <h3>{t('admin.liftersExport.steps.review')}</h3>
                {liftersReadiness ? (
                  <p className="admin-lifters-export__meta" role="status">
                    {t('admin.liftersExport.summary', {
                      complete: liftersReadiness.complete,
                      total: liftersReadiness.total,
                      incomplete: liftersReadiness.incomplete,
                    })}
                    {(liftersReadiness.divisionOpenUpgrade ?? 0) > 0
                      ? ` · ${t('admin.liftersExport.openUpgradeCount', {
                          count: liftersReadiness.divisionOpenUpgrade,
                        })}`
                      : ''}
                    {(liftersReadiness.divisionMismatch ?? 0) > 0 ? (
                      <span className="admin-lifters-export__meta-alert">
                        {` · ${t('admin.liftersExport.divisionMismatchLead', {
                          count: liftersReadiness.divisionMismatch,
                        })}`}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {liftersLoading ? (
                  <p className="admin-lifters-export__status">{t('admin.liftersExport.loading')}</p>
                ) : null}
                {liftersError ? (
                  <p className="admin-lifters-export__error" role="alert">
                    {liftersError}
                  </p>
                ) : null}
                {liftersReadiness?.incomplete > 0 ? (
                  <div className="admin-lifters-export__grid">
                    <div className="admin-lifters-export__gaps">
                      <h4>{t('admin.liftersExport.gapsTitle')}</h4>
                      <ol className="admin-lifters-export__gap-list">
                        {(liftersReadiness.topGaps ?? liftersReadiness.fieldGaps ?? [])
                          .slice(0, 5)
                          .map((gap) => (
                            <li key={gap.field}>
                              <span>{t(`admin.liftersExport.fields.${gap.field}`)}</span>
                        <span>
                          {t('admin.liftersExport.gapCount', {
                            count: gap.count,
                            total: liftersReadiness.total,
                          })}
                        </span>
                            </li>
                          ))}
                      </ol>
                    </div>
                    <div className="admin-lifters-export__athletes">
                      <h4>{t('admin.liftersExport.athletesTitle')}</h4>
                      <ul className="admin-lifters-export__list">
                        {liftersReadiness.athletes.slice(0, 6).map((row) => {
                          const contact = row.phone || row.email || ''
                          return (
                          <li key={row.athleteId}>
                            <span className="admin-lifters-export__who">
                              <button
                                type="button"
                                className="admin-empty__text-link"
                                onClick={() => onSelectAthlete?.(row.athleteId)}
                              >
                                {row.name || row.athleteId}
                              </button>
                              {contact ? (
                                <span className="admin-lifters-export__contact">{contact}</span>
                              ) : null}
                            </span>
                            <span className="admin-lifters-export__missing">
                              {(row.missing ?? [])
                                .slice(0, 3)
                                .map((field) => t(`admin.liftersExport.fields.${field}`))
                                .join(' · ')}
                              {(row.missing?.length ?? 0) > 3
                                ? ` +${row.missing.length - 3}`
                              : ''}
                          </span>
                          </li>
                          )
                        })}
                      </ul>
                      {liftersReadiness.athletes.length > 6 ? (
                        <p className="admin-lifters-export__more">
                          {t('admin.liftersExport.more', {
                            count: liftersReadiness.athletes.length - 6,
                          })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : liftersReadiness ? (
                  <p className="admin-lifters-export__ready">{t('admin.liftersExport.allComplete')}</p>
                ) : null}
              </div>
            </li>
            <li className="admin-lifters-export__step">
              <div>
                <h3>{t('admin.liftersExport.steps.build')}</h3>
          <div className="admin-lifters-export__studio">
            <div className="admin-lifters-export__studio-grid">
              <label className="admin-lifters-export__field">
                <span>{t('admin.liftersExport.presetLabel')}</span>
                <select
                  value={liftersStudio.preset}
                  onChange={(event) => updateLiftersStudio({ preset: event.target.value })}
                >
                  <option value="audit">{t('admin.liftersExport.presets.audit')}</option>
                  <option value="official">{t('admin.liftersExport.presets.official')}</option>
                  <option value="minimal">{t('admin.liftersExport.presets.minimal')}</option>
                  <option value="contact">{t('admin.liftersExport.presets.contact')}</option>
                </select>
              </label>
              <label className="admin-lifters-export__field">
                <span>{t('admin.liftersExport.rowFilterLabel')}</span>
                <select
                  value={liftersStudio.rowFilter}
                  onChange={(event) => updateLiftersStudio({ rowFilter: event.target.value })}
                >
                  <option value="all">{t('admin.liftersExport.rowFilters.all')}</option>
                  <option value="complete">{t('admin.liftersExport.rowFilters.complete')}</option>
                  <option value="incomplete">
                    {t('admin.liftersExport.rowFilters.incomplete')}
                  </option>
                </select>
              </label>
              <label className="admin-lifters-export__check">
                <input
                  type="checkbox"
                  checked={liftersStudio.highlightEmpty}
                  onChange={(event) =>
                    updateLiftersStudio({ highlightEmpty: event.target.checked })
                  }
                />
                <span>{t('admin.liftersExport.highlightEmpty')}</span>
              </label>
              <label className="admin-lifters-export__check">
                <input
                  type="checkbox"
                  checked={liftersStudio.freezeHeader}
                  onChange={(event) =>
                    updateLiftersStudio({ freezeHeader: event.target.checked })
                  }
                />
                <span>{t('admin.liftersExport.freezeHeader')}</span>
              </label>
              <label className="admin-lifters-export__check">
                <input
                  type="checkbox"
                  checked={liftersStudio.includeSummarySheet}
                  onChange={(event) =>
                    updateLiftersStudio({ includeSummarySheet: event.target.checked })
                  }
                />
                <span>{t('admin.liftersExport.includeSummarySheet')}</span>
              </label>
            </div>
            <fieldset className="admin-lifters-export__columns">
              <legend>{t('admin.liftersExport.columnPicker')}</legend>
              {LIFTERS_COLUMN_GROUPS.map(([group, keys]) => (
                <div key={group} className="admin-lifters-export__column-group">
                  <span>{t(`admin.liftersExport.columnGroups.${group}`)}</span>
                  <div>
                    {keys.map((key) => (
                      <label key={key} className="admin-lifters-export__check">
                        <input
                          type="checkbox"
                          checked={liftersSelectedColumns.includes(key)}
                          onChange={() => toggleLiftersColumn(key)}
                        />
                        <span>{t(`admin.liftersExport.sheetColumns.${key}`)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
            {liftersSelectedColumns.length < LIFTERS_COLUMNS.length ? (
              <p className="admin-lifters-export__hint">{t('admin.liftersExport.importColumnsHint')}</p>
            ) : null}
            {liftersPreview ? (
              <p className="admin-lifters-export__preview">
                {t('admin.liftersExport.preview', {
                  rows: liftersPreview.rowCount,
                  columns: liftersPreview.columnCount,
                })}
              </p>
            ) : null}
            {liftersFilePreview.rows.length ? (
              <div className="admin-lifters-export__file">
                <h4>{t('admin.liftersExport.filePreview')}</h4>
                <div className="admin-lifters-export__file-scroll">
                  <table>
                    <thead>
                      <tr>
                        {liftersFilePreview.columns.map((key) => {
                          const header =
                            LIFTERS_COLUMNS.find((column) => column.key === key)?.header ?? key
                          return (
                            <th key={key} scope="col" title={header}>
                              {t(`admin.liftersExport.sheetColumns.${key}`)}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {liftersFilePreview.rows.map((previewRow, index) => (
                        <tr key={`${previewRow.name ?? 'row'}-${index}`}>
                          {liftersFilePreview.columns.map((key) => {
                            const header =
                              LIFTERS_COLUMNS.find((column) => column.key === key)?.header ?? key
                            const value = previewRow[header]
                            const empty = value == null || String(value).trim() === ''
                            return (
                              <td key={key} className={empty ? 'is-empty' : undefined}>
                                {empty ? '—' : value}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="admin-lifters-export__hint">{t('admin.liftersExport.fileClassHint')}</p>
              </div>
            ) : null}
              </div>
              </div>
            </li>
            <li className="admin-lifters-export__step">
              <div>
                <h3>{t('admin.liftersExport.steps.deliver')}</h3>
            {liftersImportBlocked ? (
              <p className="admin-lifters-export__hint" role="alert">
                {t('admin.liftersExport.importColumnsBlocked')}
              </p>
            ) : null}
            {liftersMeetSummary ? (
              <div className="admin-lifters-export__brief">
                <p>
                  {t('admin.liftersExport.meetSummary', {
                    classes: liftersMeetSummary.classGroups.length,
                    small: liftersMeetSummary.smallClasses.length,
                    mismatches: liftersMeetSummary.mismatches.length,
                    missingWeighIn: liftersMeetSummary.missingWeighIn.length,
                  })}
                </p>
                {liftersMeetSummary.smallClasses.length ? (
                  <ul className="admin-lifters-export__roster">
                    {liftersMeetSummary.smallClasses.slice(0, 6).map((group) => (
                      <li key={`${group.gender}-${group.division}-${group.equipment}-${group.weightClass}`}>
                        <span>
                          {[group.gender, group.division, group.equipment].filter(Boolean).join(' · ')}
                        </span>
                        <span>
                          {group.weightClass} kg · {group.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {liftersMeetSummary.smallClasses.length > 6 ? (
                  <p className="admin-lifters-export__more">
                    {t('admin.liftersExport.more', {
                      count: liftersMeetSummary.smallClasses.length - 6,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {liftersFileCheck ? (
              <p className="admin-lifters-export__preview" role="status">
                {t('admin.liftersExport.exportSummary', {
                  total: liftersFileCheck.total,
                  ready: liftersFileCheck.ready,
                  warnings: liftersFileCheck.warnings,
                  errors: liftersFileCheck.errors,
                })}
              </p>
            ) : null}
            {liftersFileCheck && !liftersFileCheck.valid ? (
              <div className="admin-lifters-export__brief admin-lifters-export__brief--alert" role="alert">
                <p>{t('admin.liftersExport.exportBlocked')}</p>
                <ul className="admin-lifters-export__roster">
                  {liftersFileCheck.issues.slice(0, 8).map((issue) => (
                    <li key={`${issue.athleteId}-${issue.field}`}>
                      <span>{issue.athleteName || issue.athleteId}</span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
                {liftersFileCheck.issues.length > 8 ? (
                  <p className="admin-lifters-export__more">
                    {t('admin.liftersExport.more', { count: liftersFileCheck.issues.length - 8 })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {liftersFileCheck?.valid && liftersFileCheck.warnings > 0 ? (
              <p className="admin-lifters-export__hint">{t('admin.liftersExport.exportWarningsOk')}</p>
            ) : null}
            <div className="admin-lifters-export__actions">
            <Button
              type="button"
              variant="primary"
              disabled={
                liftersLoading ||
                !onExportLifters ||
                (liftersPreview != null && liftersPreview.rowCount === 0) ||
                (liftersFileCheck != null && !liftersFileCheck.valid) ||
                liftersImportBlocked
              }
              onClick={() =>
                onExportLifters?.({
                  eventSlug: liftersScopeSlug(liftersEventSlug),
                  options: liftersStudio,
                })
              }
            >
              {liftersScopeSlug(liftersEventSlug)
                ? t('admin.liftersExport.downloadEvent', { event: liftersEventLabel })
                : t('admin.liftersExport.download')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                liftersLoading ||
                liftersNotifying ||
                !onNotifyAthletesIncomplete ||
                !liftersReadiness?.incomplete
              }
              onClick={async () => {
                const ids = (liftersReadiness?.athletes ?? []).map((row) => row.athleteId)
                if (!ids.length) return
                const topFields = (liftersReadiness.topGaps ?? liftersReadiness.fieldGaps ?? [])
                  .slice(0, 4)
                  .map((gap) => t(`admin.liftersExport.fields.${gap.field}`))
                  .join(', ')
                const message = topFields
                  ? t('admin.liftersExport.notifyPresetWithGaps', { fields: topFields })
                  : t('admin.liftersExport.notifyPreset')
                setLiftersNotifying(true)
                try {
                  const result = await onNotifyAthletesIncomplete(ids, message)
                  toastSuccess(
                    t('admin.liftersExport.notifyDone', {
                      sent: result?.sent?.length ?? 0,
                      skipped: result?.skipped?.length ?? 0,
                    }),
                  )
                } catch (error) {
                  toastError(error?.message ?? t('admin.liftersExport.notifyError'))
                } finally {
                  setLiftersNotifying(false)
                }
              }}
            >
              {liftersNotifying
                ? t('admin.liftersExport.notifying')
                : t('admin.liftersExport.notify')}
            </Button>
            </div>
            {liftersReadiness?.incomplete > 0 ? (
              <p className="admin-lifters-export__hint">{t('admin.liftersExport.notifyHint')}</p>
            ) : null}
              </div>
            </li>
          </ol>
        </div>
      ) : null}
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
                label={t('admin.registrationSheet.export')}
                ariaLabel={t('admin.registrationSheet.exportAria', {
                  count: filteredRegistrations.length,
                })}
                onClick={() => void exportRegistrationSheet()}
                disabled={sheetExporting || filteredRegistrations.length === 0}
              />
              {canSetStatus ? (
                <button
                  type="button"
                  className="export-btn export-btn--default"
                  aria-label={t('admin.registrationSheet.importAria')}
                  title={t('admin.registrationSheet.importAria')}
                  onClick={() => setSheetImportOpen(true)}
                >
                  <Upload size={16} aria-hidden />
                  <span className="export-btn__label">{t('admin.registrationSheet.import')}</span>
                </button>
              ) : null}
              <ExportButton
                label={t('admin.actions.exportCsvShort')}
                ariaLabel={
                  filters.event && filters.event !== 'all'
                    ? t('admin.actions.exportCsvAdminFiltered')
                    : t('admin.actions.exportCsvAdmin')
                }
                onClick={() =>
                  onExportAdmin?.({
                    eventSlug:
                      filters.event && filters.event !== 'all' ? filters.event : null,
                  })
                }
                disabled={!canEdit}
              />
              <ExportButton
                label={t('admin.actions.exportPluUsaShort')}
                ariaLabel={
                  filters.event && filters.event !== 'all'
                    ? t('admin.actions.exportPluUsaFiltered')
                    : t('admin.actions.exportPluUsa')
                }
                onClick={() =>
                  onExportPluUsa?.({
                    eventSlug:
                      filters.event && filters.event !== 'all' ? filters.event : null,
                  })
                }
                variant="gold"
              />
              <ExportButton
                label={t('admin.actions.exportLiftersShort')}
                ariaLabel={t('admin.actions.exportLifters')}
                onClick={() => {
                  const eventSlug = filters.event && filters.event !== 'all' ? filters.event : 'all'
                  void loadLiftersReadiness(eventSlug)
                }}
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
                  <>
                    {canSetStatus && onBulkSetRegistrationStatus ? (
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
                    ) : null}
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="btn--small"
                        disabled={selectedRosterFrozen}
                        onClick={() => {
                          setBulkClassError(
                            selectedRosterFrozen ? t('admin.liftersExport.rosterFrozen') : '',
                          )
                          setBulkClassOpen(true)
                        }}
                      >
                        {t('admin.liftersExport.bulkWeightClass')}
                      </Button>
                    ) : null}
                  </>
                }
              />
            )}
            {/* Sin permiso de grilla no hay barra de arriba que lleve la
                cuenta de la selección -- esta es la única, no una segunda. */}
            {!canAssignSchedule && canEdit && visibleSelectedRows.length > 0 ? (
              <div
                className="admin-bulk-status-bar"
                role="region"
                aria-label={t('admin.registrationBulkStatus.action')}
              >
                <span className="admin-bulk-status-bar__lead">
                  <Users size={15} aria-hidden />
                  {t('admin.schedule.selectedCount', { count: visibleSelectedRows.length })}
                </span>
                {canSetStatus && onBulkSetRegistrationStatus ? (
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
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  className="btn--small"
                  disabled={selectedRosterFrozen}
                  onClick={() => {
                    setBulkClassError(selectedRosterFrozen ? t('admin.liftersExport.rosterFrozen') : '')
                    setBulkClassOpen(true)
                  }}
                >
                  {t('admin.liftersExport.bulkWeightClass')}
                </Button>
              </div>
            ) : null}
            {canEdit && filters.event && filters.event !== 'all' ? (
              <div className="admin-lifters-export__hint" role="status">
                <p>
                  {registrations.some(
                    (row) =>
                      registrationEventFilterKey(row) === filters.event && row.rosterFrozenAt,
                  )
                    ? t('admin.liftersExport.rosterFrozen')
                    : t('admin.liftersExport.rosterOpen')}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="btn--small"
                  disabled={freezingRoster}
                  onClick={async () => {
                    const frozen = registrations.some(
                      (row) =>
                        registrationEventFilterKey(row) === filters.event && row.rosterFrozenAt,
                    )
                    setFreezingRoster(true)
                    setRosterError('')
                    try {
                      await setEventRosterFrozen(filters.event, !frozen)
                      await onRefreshAthleteData?.()
                    } catch (error) {
                      setRosterError(error?.message ?? t('admin.liftersExport.rosterSaveError'))
                    } finally {
                      setFreezingRoster(false)
                    }
                  }}
                >
                  {registrations.some(
                    (row) =>
                      registrationEventFilterKey(row) === filters.event && row.rosterFrozenAt,
                  )
                    ? t('admin.liftersExport.reopenRoster')
                    : t('admin.liftersExport.freezeRoster')}
                </Button>
                {rosterError ? (
                  <p className="admin-lifters-export__error" role="alert">
                    {rosterError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <AdminDataTable
              className="admin-data-table--registrations"
              density="compact"
              fit
              columns={[
                ...(canAssignSchedule || canEdit
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
                // Con un solo evento filtrado el nombre se repite en cada fila: la
                // columna se va y el espacio vuelve a la competencia.
                ...(singleEventScope
                  ? []
                  : [
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
                          <span className="data-table__sub">{row.category}</span>
                        </div>
                      ),
                      mobileRender: (row) => row.event,
                    },
                  ]),
                {
                  key: 'meet',
                  label: t('admin.liftersExport.meetColumn'),
                  width: 196,
                  className: 'data-table__column--meet',
                  ellipsis: false,
                  mobile: 'default',
                  mobileMeta: 'labeled',
                  sortable: false,
                  render: (row) => {
                    const statusKey =
                      row.meet.exportStatus === 'READY'
                        ? 'exportReady'
                        : row.meet.exportStatus === 'WARNING'
                          ? 'exportWarning'
                          : 'exportError'
                    const identity = [
                      row.meet.sex,
                      row.meet.age != null ? String(row.meet.age) : '',
                      row.meet.division,
                      row.meet.equipment,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    const competingClass = row.meet.officialClass || row.meet.declaredClass || ''
                    const weightLine = [
                      row.meet.bodyweight ? `${row.meet.bodyweight} kg` : '',
                      row.meet.weighInBodyweight
                        ? t('admin.liftersExport.weighInShort', { weight: row.meet.weighInBodyweight })
                        : '',
                      competingClass ? `${competingClass} kg` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')
                    const dossier = [
                      identity,
                      `${t('admin.liftersExport.bodyweightLabel')}: ${row.meet.bodyweight ? `${row.meet.bodyweight} kg` : '—'}`,
                      `${t('admin.liftersExport.weighInLabel')}: ${row.meet.weighInBodyweight ? `${row.meet.weighInBodyweight} kg` : '—'}${row.meet.weighInStamp ? ` · ${row.meet.weighInStamp}` : ''}`,
                      `${t('admin.liftersExport.declaredClassLabel')}: ${row.meet.declaredClass ? `${row.meet.declaredClass} kg` : '—'}`,
                      `${t('admin.liftersExport.officialClassLabel')}: ${row.meet.officialClass ? `${row.meet.officialClass} kg` : '—'}${row.meet.officialStamp ? ` · ${row.meet.officialStamp}` : ''}`,
                    ].join('\n')
                    return (
                      <div className="admin-meet-facts" title={dossier}>
                        {identity ? <span className="admin-meet-facts__line">{identity}</span> : null}
                        {weightLine ? (
                          <span className="admin-meet-facts__line admin-meet-facts__muted">{weightLine}</span>
                        ) : null}
                        {row.meet.suggestedClass && row.meet.suggestedClass !== row.meet.weightClass ? (
                          <span
                            className="admin-meet-facts__line admin-meet-facts__warning"
                            title={t('admin.liftersExport.classSuggestion', {
                              className: row.meet.suggestedClass,
                            })}
                          >
                            {t('admin.liftersExport.classSuggestionShort', {
                              className: row.meet.suggestedClass,
                            })}
                          </span>
                        ) : null}
                        {row.meet.rosterFrozen ? (
                          <span className="admin-meet-facts__line">{t('admin.liftersExport.rosterFrozenShort')}</span>
                        ) : null}
                        {row.meet.warning ? (
                          <span className="admin-meet-facts__line admin-meet-facts__warning" title={row.meet.warning.message}>
                            {row.meet.warning.message}
                          </span>
                        ) : null}
                        <span className={`admin-meet-facts__line admin-export-readiness admin-export-readiness--${row.meet.exportStatus.toLowerCase()}`}>
                          {t(`admin.liftersExport.${statusKey}`)}
                        </span>
                        {canEdit ? (
                          <div className="admin-meet-facts__actions">
                            {!row.meet.rosterFrozen ? (
                              <button
                                type="button"
                                className="admin-empty__text-link"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setClassEdit(row)
                                  setClassEditMode('weigh-in')
                                  setClassEditValue(row.meet.weighInBodyweight)
                                  setClassEditError('')
                                }}
                              >
                                {t('admin.liftersExport.recordWeighIn')}
                              </button>
                            ) : null}
                            {!row.meet.rosterFrozen ? (
                              <button
                                type="button"
                                className="admin-empty__text-link"
                                aria-label={t('admin.liftersExport.editWeightClass')}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setClassEdit(row)
                                  setClassEditMode('declared')
                                  setClassEditValue(row.meet.declaredClass)
                                  setClassEditError('')
                                }}
                              >
                                {t('admin.liftersExport.editDeclaredShort')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="admin-empty__text-link"
                              aria-label={t('admin.liftersExport.editOfficialClass')}
                              onClick={(event) => {
                                event.stopPropagation()
                                setClassEdit(row)
                                setClassEditMode('official')
                                setClassEditValue(row.meet.officialClass)
                                setClassEditError('')
                              }}
                            >
                              {t('admin.liftersExport.editOfficialShort')}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  },
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
                  label: t('admin.liftersExport.bodyweightLabel'),
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
            {classEdit ? (
              <form
                className="admin-lifters-export admin-class-edit"
                role="dialog"
                aria-labelledby="class-edit-title"
                onSubmit={async (event) => {
                  event.preventDefault()
                  setSavingClass(true)
                  setClassEditError('')
                  try {
                    if (classEditMode === 'weigh-in') {
                      await recordRegistrationWeighIn(
                        classEdit.id,
                        classEditValue === '' ? null : Number(String(classEditValue).replace(',', '.')),
                      )
                    } else if (classEditMode === 'official') {
                      await correctOfficialWeightClass(classEdit.id, classEditValue)
                    } else {
                      await correctRegistrationWeightClass(classEdit.id, classEditValue)
                    }
                    await onRefreshAthleteData?.()
                    setClassEdit(null)
                    toastSuccess(t('admin.liftersExport.classSaved'))
                  } catch (error) {
                    setClassEditError(error?.message ?? t('admin.liftersExport.classSaveError'))
                  } finally {
                    setSavingClass(false)
                  }
                }}
              >
                <h3 id="class-edit-title">
                  {classEditMode === 'weigh-in'
                    ? t('admin.liftersExport.recordWeighIn')
                    : classEditMode === 'official'
                      ? t('admin.liftersExport.editOfficialClass')
                      : t('admin.liftersExport.editWeightClass')}
                </h3>
                <p>
                  {classEdit.athlete} · {t('admin.liftersExport.bodyweightLabel')}:{' '}
                  {classEdit.meet.bodyweight ? `${classEdit.meet.bodyweight} kg` : '—'}
                </p>
                {classEditMode === 'weigh-in' ? (
                  <label className="admin-lifters-export__field">
                    <span>{t('admin.liftersExport.weighInLabel')}</span>
                    <input
                      inputMode="decimal"
                      value={classEditValue}
                      onChange={(event) => setClassEditValue(event.target.value)}
                      required
                    />
                  </label>
                ) : (
                <label className="admin-lifters-export__field">
                  <span>
                    {classEditMode === 'official'
                      ? t('admin.liftersExport.officialClassLabel')
                      : t('admin.liftersExport.declaredClassLabel')}
                  </span>
                  <select
                    value={classEditValue}
                    onChange={(event) => setClassEditValue(event.target.value)}
                    required={classEditMode !== 'official'}
                  >
                    <option value="">
                      {classEditMode === 'official'
                        ? t('admin.liftersExport.clearOfficialClass')
                        : t('admin.liftersExport.chooseClass')}
                    </option>
                    {weightClassLabelsForSex(classEdit.meet.sex).map((label) => (
                      <option key={label} value={label}>
                        {label} kg
                      </option>
                    ))}
                  </select>
                </label>
                )}
                {classEditError ? (
                  <p className="admin-lifters-export__error" role="alert">
                    {classEditError}
                  </p>
                ) : null}
                <div className="admin-lifters-export__actions">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={savingClass || (classEditMode !== 'official' && !classEditValue)}
                  >
                    {savingClass
                      ? t('admin.liftersExport.classSaving')
                      : t('admin.liftersExport.classSave')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={savingClass}
                    onClick={() => setClassEdit(null)}
                  >
                    {t('admin.liftersExport.close')}
                  </Button>
                </div>
              </form>
            ) : null}
            {bulkClassOpen ? (
              <form
                className="admin-lifters-export admin-class-edit"
                onSubmit={async (event) => {
                  event.preventDefault()
                  setSavingBulkClass(true)
                  setBulkClassError('')
                  try {
                    await correctRegistrationsWeightClass(
                      visibleSelectedRows.map((row) => row.id),
                      bulkClassValue,
                    )
                    await onRefreshAthleteData?.()
                    setBulkClassOpen(false)
                    setSelectedIds(new Set())
                    toastSuccess(t('admin.liftersExport.classSaved'))
                  } catch (error) {
                    const details = Array.isArray(error?.body?.errors) ? error.body.errors : []
                    setBulkClassError(
                      details.length
                        ? details.map((item) => item.message).join(' ')
                        : (error?.message ?? t('admin.liftersExport.classSaveError')),
                    )
                  } finally {
                    setSavingBulkClass(false)
                  }
                }}
              >
                <h3>{t('admin.liftersExport.bulkWeightClass')}</h3>
                <p>{t('admin.schedule.selectedCount', { count: visibleSelectedRows.length })}</p>
                <label className="admin-lifters-export__field">
                  <span>{t('admin.liftersExport.declaredClassLabel')}</span>
                  <select
                    value={bulkClassValue}
                    onChange={(event) => setBulkClassValue(event.target.value)}
                    required
                  >
                    <option value="">{t('admin.liftersExport.chooseClass')}</option>
                    {bulkClassLabels.map((label) => (
                      <option key={label} value={label}>
                        {label} kg
                      </option>
                    ))}
                  </select>
                </label>
                {bulkClassError ? (
                  <p className="admin-lifters-export__error" role="alert">
                    {bulkClassError}
                  </p>
                ) : null}
                <div className="admin-lifters-export__actions">
                  <Button type="submit" variant="primary" disabled={savingBulkClass || !bulkClassValue}>
                    {savingBulkClass
                      ? t('admin.liftersExport.classSaving')
                      : t('admin.liftersExport.classSave')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={savingBulkClass}
                    onClick={() => setBulkClassOpen(false)}
                  >
                    {t('admin.liftersExport.close')}
                  </Button>
                </div>
              </form>
            ) : null}
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
      {sheetImportOpen ? (
        <RegistrationSheetImportDialog
          eventSlug={sheetEventSlug}
          eventLabel={
            sheetEventSlug
              ? (filteredRegistrations.find((item) => item.eventSlug === sheetEventSlug)?.event ??
                sheetEventSlug)
              : ''
          }
          onClose={() => setSheetImportOpen(false)}
          onApplied={() => void onRefreshAthleteData?.()}
        />
      ) : null}
    </>
  )
}
