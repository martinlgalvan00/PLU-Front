import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  EyeOff,
  MapPin,
  Plus,
  RefreshCw,
  Unlock,
  Users,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminEventWorkspace from '../../components/admin/AdminEventWorkspace.jsx'
import AdminEventEditor, {
  getAdminEventDraftSignature,
} from '../../components/admin/AdminEventEditor.jsx'
import AdminEventPaymentsTriage from '../../components/admin/AdminEventPaymentsTriage.jsx'
import AdminEventQuickCreate from '../../components/admin/AdminEventQuickCreate.jsx'
import AdminEventScanReportSection from '../../components/admin/AdminEventScanReportSection.jsx'
import AdminEventSecuritySection from '../../components/admin/AdminEventSecuritySection.jsx'
import AdminEventStructureEditor from '../../components/admin/AdminEventStructureEditor.jsx'
import AdminEventZonesSection from '../../components/admin/AdminEventZonesSection.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import Button from '../../components/ui/Button.jsx'
import StatusPill from '../../components/ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getEventsTourSteps } from '../../lib/adminTourSteps.js'
import { clearAdminEventRoute, pushAdminEventRoute } from '../../lib/adminEventRoute.js'
import { formatDayMonth, formatMonthYear } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
import { normalizeEventPublicSurface } from '../../lib/eventPublicSurface.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  buildAdminEventDraft,
  createAdminEventDraft,
  defaultAdminEventYear,
  filterAdminEvents,
  listAdminEventYears,
  pickLeadAdminEvent,
} from '../../services/eventAdminService.js'
import {
  buildEventPaymentTriage,
  formatEventPaymentTriageSummary,
} from '../../services/eventPaymentTriage.js'

function isFinishedEvent(event) {
  return event?.status === 'finalizado'
}

function sortByDate(list, direction) {
  return [...list].sort((a, b) => {
    const left = a.dateISO ?? ''
    const right = b.dateISO ?? ''
    return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left)
  })
}

function groupByMonthKey(list) {
  const byMonth = new Map()
  for (const row of list) {
    const key = row.dateISO?.slice(0, 7) || 'sin-fecha'
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(row)
  }
  return byMonth
}

function groupByYearKey(list) {
  const byYear = new Map()
  for (const row of list) {
    const key = row.dateISO?.slice(0, 4) || 'sin-fecha'
    if (!byYear.has(key)) byYear.set(key, [])
    byYear.get(key).push(row)
  }
  return byYear
}

function EventListRow({ row, selected, locale, onSelect, t, variant = 'catalog' }) {
  const isLead = variant === 'lead'
  const rawFill = row.slots > 0 ? Math.round((row.registered / row.slots) * 100) : 0
  const fill = Math.min(rawFill, 100)
  const capacityTone = rawFill >= 100 ? 'full' : rawFill >= 80 ? 'high' : 'available'
  const { tone } = getStatusMeta(row.status)
  const venueLine = [row.venue, row.location].filter(Boolean).join(', ')
  const [day, month] = (row.dateISO ? formatDayMonth(row.dateISO, locale) : (row.date ?? '')).split(
    ' ',
  )

  return (
    <li
      className={[
        'admin-event-row',
        `admin-event-row--${tone}`,
        isLead ? 'admin-event-row--lead' : '',
        selected ? 'admin-event-row--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      title={row.slug ? `${row.title} · ${row.slug}` : row.title}
      onClick={() => onSelect(row.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(row.id)
        }
      }}
    >
      <div className={`admin-event-row__date admin-event-row__date--${tone}`}>
        <span className="admin-event-row__day">{day}</span>
        <span className="admin-event-row__month">{month}</span>
      </div>

      <div className="admin-event-row__body">
        {isLead ? (
          <span className="admin-event-row__kicker">
            {row.featured
              ? t('admin.sections.events.featuredBadge')
              : t('admin.sections.events.nextKicker')}
          </span>
        ) : null}
        <div className="admin-event-row__title-wrap">
          <strong className="admin-event-row__title">{row.title}</strong>
          {row.published === false ? (
            <span
              className="admin-event-row__hidden-mark"
              title={t('admin.eventState.hiddenBadge')}
              aria-label={t('admin.eventState.hiddenBadge')}
            >
              <EyeOff size={12} aria-hidden />
            </span>
          ) : null}
          {row.requiresMembership === false ? (
            <span
              className="admin-event-row__open-mark"
              title={t('admin.eventState.openBadge')}
              aria-label={t('admin.eventState.openBadge')}
            >
              <Unlock size={12} aria-hidden />
            </span>
          ) : null}
        </div>

        {venueLine ? (
          <div className="admin-event-row__meta">
            <span className="admin-event-row__meta-item">
              <MapPin size={12} aria-hidden />
              {venueLine}
            </span>
          </div>
        ) : null}
      </div>

      <div className={`admin-event-row__capacity admin-event-row__capacity--${capacityTone}`}>
        <div
          className="admin-event-row__capacity-bar"
          role="progressbar"
          aria-label={t('admin.dashboard.slots')}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={fill}
        >
          <div className="admin-event-row__capacity-fill" style={{ width: `${fill}%` }} />
        </div>
        <span className="admin-event-row__capacity-label">
          <Users size={11} aria-hidden />
          {row.registered}/{row.slots}
        </span>
      </div>

      <div className="admin-event-row__badge">
        <StatusPill value={row.status} />
      </div>
    </li>
  )
}

/** Pestañas del workspace que no montan el editor del evento. */
const NON_EDITOR_SECTIONS = new Set(['structure', 'security', 'payments'])
/** Pestañas que sí viven del draft del editor. El resumen no entra: si
 *  “Cerrar sección” va a dashboard y la invariante rearma el form, el botón
 *  no cierra nada. */
const EDITOR_SECTIONS = new Set(['basics', 'sales', 'visibility'])

export default function EventsSection({
  adminEvents,
  /** Deep link `/admin/eventos/:slug`: abre el workspace de ese evento al entrar. */
  adminEventWorkspaceSlug = null,
  athletes = [],
  canEdit,
  canDeleteEvents = false,
  canManageUsers,
  canViewScanReport = false,
  canValidatePayments = false,
  isLoading = false,
  loadError = null,
  onApprovePayment,
  onApproveTicketOrder,
  onAssignSecurityZone,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onCreateSecurityZone,
  onDeactivateAllSecurityUsers,
  onDeleteEvent,
  onDeleteSecurityZone,
  onFetchDeleteImpact,
  onGetEventScanReport,
  onSetTicketAccessOverride,
  onListSecurityUsers,
  onListSecurityZones,
  onManageCheckin,
  onManagePayments,
  onManageRegistrations,
  onOpenFinanceForEvent,
  onPresetSecurityZones,
  onRefresh,
  onRefreshPayments,
  onRejectPayment,
  onRejectTicketOrder,
  onSaveEvent,
  onSetEventRegistrationPrice,
  onClearEventPriceSchedule,
  onSetEventState,
  onUpdateSecurityUserStatus,
  onUpdateSecurityZone,
  payments = [],
  pendingTicketOrders = [],
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [year, setYear] = useState('')
  const [selectedId, setSelectedId] = useState(adminEvents[0]?.id ?? null)

  useEffect(() => {
    startTour('admin-events', getEventsTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])
  const [formOpen, setFormOpen] = useState(false)
  // Alta rápida y editor completo son dos superficies distintas: crear no pide
  // las mismas decisiones que editar (ver AdminEventQuickCreate).
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  /**
   * Workspace del evento seleccionado. Reemplaza al listado a ancho completo,
   * ya no es un modal. El estado local es la fuente de verdad y la URL
   * (`/admin/eventos/:slug`) es su reflejo: así el componente funciona montado
   * solo -- un intento anterior dependía del rebote por `popstate` para abrir,
   * con lo cual tocar una fila no hacía nada fuera de la app completa.
   */
  const [consoleOpen, setConsoleOpen] = useState(false)
  /** Pestaña abierta: basics | structure | sales | security | payments | visibility. */
  const [consoleSection, setConsoleSection] = useState(null)
  const [consoleChapter, setConsoleChapter] = useState(null)
  /** Firma del draft al abrir el acordeón: el dirty sobrevive al cambiar de sección. */
  const [editorBaselineSignature, setEditorBaselineSignature] = useState(null)
  const [zonesReloadToken, setZonesReloadToken] = useState(0)
  const [draft, setDraft] = useState(createAdminEventDraft)
  const [editorFocus, setEditorFocus] = useState('details')
  const [message, setMessage] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteImpact, setDeleteImpact] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [requiresForce, setRequiresForce] = useState(false)
  // Slug del diálogo abierto: el impacto llega por red y no puede pisar el
  // estado si mientras tanto se cerró o se abrió el de otro evento.
  const deleteTargetRef = useRef(null)
  /** Cierre dirty-aware del editor embebido en la consola. */
  const exitEditRef = useRef(null)
  /** Si el editor dirty pide confirmación, abrir esta sección al descartar. */
  const pendingConsoleSectionRef = useRef(null)
  const pendingConsoleChapterRef = useRef(null)
  /** PATCH de estado pendiente: el editor lo dispara con “Guardar cambios”. */
  const [stateDirty, setStateDirty] = useState(false)
  const statePendingRef = useRef({})
  const discardStateRef = useRef(null)

  /**
   * Tocar una fila abre el workspace en Datos y sincroniza la URL. El orden
   * importa: primero se abre por estado -- que es lo que hace que la lista
   * reaccione al click incluso montada sola -- y después se empuja el path.
   */
  function handleSelectEvent(id) {
    const match = adminEvents.find((event) => event.id === id)
    setSelectedId(id)
    if (match) {
      openEditForm(match, 'basics')
      if (match.slug) pushAdminEventRoute(match.slug)
      return
    }
    setConsoleOpen(true)
  }

  function resetEventConsole() {
    setConsoleOpen(false)
    setConsoleSection(null)
    setConsoleChapter(null)
    setFormOpen(false)
    setEditorBaselineSignature(null)
    setDraft(createAdminEventDraft())
    setStateDirty(false)
    statePendingRef.current = {}
    pendingConsoleSectionRef.current = null
    pendingConsoleChapterRef.current = null
  }

  function closeEventConsole() {
    resetEventConsole()
    clearAdminEventRoute()
  }

  /**
   * Deep link: entrar por `/admin/eventos/:slug` abre el workspace de ese
   * evento con Datos listo. Espera a que la lista haya cargado el evento.
   */
  useEffect(() => {
    if (!adminEventWorkspaceSlug || consoleOpen) return
    const match = adminEvents.find((event) => event.slug === adminEventWorkspaceSlug)
    if (!match) return
    setSelectedId(match.id)
    openEditForm(match, 'basics')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al resolver el slug
  }, [adminEventWorkspaceSlug, adminEvents])

  const previousWorkspaceSlugRef = useRef(adminEventWorkspaceSlug)
  useEffect(() => {
    const previousSlug = previousWorkspaceSlugRef.current
    previousWorkspaceSlugRef.current = adminEventWorkspaceSlug
    if (!previousSlug || adminEventWorkspaceSlug) return
    resetEventConsole()
  }, [adminEventWorkspaceSlug])

  useEffect(() => {
    if (adminEvents.some((event) => event.id === selectedId)) return
    setSelectedId(adminEvents[0]?.id ?? null)
  }, [adminEvents, selectedId])

  const years = useMemo(() => listAdminEventYears(adminEvents), [adminEvents])
  const suggestedYear = useMemo(() => defaultAdminEventYear(adminEvents), [adminEvents])
  const yearFilter = years.length > 1 ? year || suggestedYear || 'all' : 'all'

  const scopedEvents = useMemo(
    () => filterAdminEvents(adminEvents, { query, year: yearFilter, status: 'all' }),
    [adminEvents, query, yearFilter],
  )

  const statusCounts = useMemo(() => {
    const counts = Object.create(null)
    for (const event of scopedEvents) {
      const key = event.status
      if (!key) continue
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [scopedEvents])

  const statusOptions = useMemo(
    () =>
      translateFilterOptions(ADMIN_EVENT_STATUS_OPTIONS, t).map(([value, label]) => [
        value,
        label,
        value === 'all' ? scopedEvents.length : (statusCounts[value] ?? 0),
      ]),
    [scopedEvents.length, statusCounts, t],
  )

  const yearOptions = useMemo(
    () => [
      ['all', t('admin.sections.events.yearAll'), adminEvents.length],
      ...years.map((value) => [
        value,
        value,
        adminEvents.filter((event) => (event.dateISO ?? '').startsWith(value)).length,
      ]),
    ],
    [adminEvents, t, years],
  )

  const rows = useMemo(
    () => filterAdminEvents(adminEvents, { query, status, year: yearFilter }),
    [adminEvents, query, status, yearFilter],
  )

  const leadEvent = useMemo(() => pickLeadAdminEvent(rows), [rows])

  const eventCatalog = useMemo(() => {
    const rest = rows.filter((row) => row.id !== leadEvent?.id)
    const upcoming = []
    const finished = []
    for (const row of rest) {
      if (isFinishedEvent(row)) finished.push(row)
      else upcoming.push(row)
    }

    function monthGroups(list, tone, direction, prefix) {
      const entries = [...groupByMonthKey(list).entries()].sort(([left], [right]) =>
        direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left),
      )
      return entries.map(([monthKey, monthRows]) => ({
        id: `${prefix}-${monthKey}`,
        tone,
        label:
          monthKey === 'sin-fecha'
            ? tone === 'finished'
              ? t('admin.sections.events.archive')
              : t('admin.sections.events.groupUpcoming')
            : formatMonthYear(monthKey, locale),
        rows: sortByDate(monthRows, direction),
      }))
    }

    const chapters = []
    const upcomingByYear = groupByYearKey(upcoming)
    const upcomingYears = [...upcomingByYear.keys()].sort((left, right) => left.localeCompare(right))
    for (const yearKey of upcomingYears) {
      chapters.push({
        id: `year-${yearKey}`,
        heading: upcomingYears.length > 1 ? yearKey : null,
        groups: monthGroups(upcomingByYear.get(yearKey), 'upcoming', 'asc', `up-${yearKey}`),
      })
    }

    if (finished.length) {
      const finishedByYear = groupByYearKey(finished)
      const finishedYears = [...finishedByYear.keys()].sort((left, right) =>
        right.localeCompare(left),
      )
      chapters.push({
        id: 'archive',
        heading: t('admin.sections.events.archive'),
        groups: finishedYears.flatMap((yearKey) =>
          monthGroups(finishedByYear.get(yearKey), 'finished', 'desc', `fin-${yearKey}`),
        ),
      })
    }

    return chapters.filter((chapter) => chapter.groups.some((group) => group.rows.length > 0))
  }, [leadEvent?.id, locale, rows, t])

  const selectedEvent = adminEvents.find((event) => event.id === selectedId) ?? rows[0] ?? null

  /**
   * Invariante del workspace: si la pestaña activa es del editor, el draft de
   * ese evento tiene que estar armado. Sin esto, descartar cambios o guardar
   * dejaba la pestaña Datos sin formulario -- el síntoma más visible del
   * intento anterior de esta pantalla, donde el editor no se podía abrir.
   */
  useEffect(() => {
    if (!consoleOpen || !canEdit || !selectedEvent) return
    const section = consoleSection ?? 'basics'
    if (!EDITOR_SECTIONS.has(section)) return
    if (formOpen && draft.id === selectedEvent.id) {
      if (!consoleSection) setConsoleSection('basics')
      return
    }
    armEditor(selectedEvent, section, consoleChapter)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invariante: no reacciona al capítulo
  }, [canEdit, consoleOpen, consoleSection, draft.id, formOpen, selectedEvent?.id])

  const editingSource = draft.id
    ? (adminEvents.find((event) => event.id === draft.id) ?? selectedEvent)
    : null

  const selectedPaymentTriage = useMemo(
    () =>
      buildEventPaymentTriage({
        event: selectedEvent,
        payments,
        athletes,
        pendingTicketOrders,
      }),
    [athletes, payments, pendingTicketOrders, selectedEvent],
  )
  const selectedPaymentSummary = useMemo(
    () => formatEventPaymentTriageSummary(selectedPaymentTriage.counts, t),
    [selectedPaymentTriage.counts, t],
  )

  const kpiStats = useMemo(() => {
    let totalRegistered = 0
    let totalSlots = 0
    let upcomingCount = 0

    for (const ev of rows) {
      totalRegistered += ev.registered ?? 0
      totalSlots += ev.slots ?? 0
      if (!isFinishedEvent(ev)) {
        upcomingCount++
      }
    }

    const fillPercent = totalSlots > 0 ? Math.round((totalRegistered / totalSlots) * 100) : 0

    return {
      upcomingCount,
      totalRegistered,
      fillPercent,
      inView: rows.length,
    }
  }, [rows])

  function openCreateForm() {
    setMessage(null)
    setQuickCreateOpen(true)
  }

  /** Salida del alta rápida hacia el formulario largo, sin perder lo tipeado. */
  function openFullEditorFromQuickCreate(quickDraft) {
    setQuickCreateOpen(false)
    setDraft({ ...createAdminEventDraft(), ...quickDraft })
    setEditorFocus('details')
    setFormOpen(true)
  }

  function resolveConsoleSection(focus = 'basics') {
    if (focus === 'sales' || focus === 'tickets') return 'sales'
    if (focus === 'visibility') return 'visibility'
    if (focus === 'structure') return 'structure'
    return 'basics'
  }

  /**
   * Estructura muestra los tres bloques juntos (`chapter = null` -> `showAll`
   * en AdminEventStructureEditor), no un capítulo a la vez: jornadas, pesajes y
   * tandas no son alternativas, son un orden -- sin jornadas no hay pesaje que
   * cargar, y sin pesaje la tanda no cierra.
   */
  function openStructureSection(chapter = null) {
    setFormOpen(false)
    setEditorBaselineSignature(null)
    setDraft(createAdminEventDraft())
    setConsoleSection('structure')
    setConsoleChapter(chapter)
    setConsoleOpen(true)
  }

  /**
   * Arma el draft del editor para una sección. No toca la selección ni los
   * mensajes: lo usa tanto la apertura explícita como la invariante de abajo,
   * y esta última corre justo después de guardar -- limpiar el mensaje ahí se
   * comía el "Evento actualizado".
   */
  function armEditor(event, section, chapter = null) {
    const nextDraft = buildAdminEventDraft(event)
    setEditorFocus(section)
    setConsoleSection(section)
    setConsoleChapter(section === 'sales' ? (chapter ?? 'cupo') : chapter)
    setDraft(nextDraft)
    setEditorBaselineSignature(getAdminEventDraftSignature(nextDraft))
    setFormOpen(true)
  }

  function openEditForm(event, focus = 'basics', chapter = null) {
    if (!event) return
    const section = resolveConsoleSection(focus)
    if (section === 'structure') {
      openStructureSection(chapter)
      return
    }
    setSelectedId(event.id)
    setMessage(null)
    armEditor(event, section, chapter)
    setConsoleOpen(true)
  }

  /**
   * Selecciona una pestaña del workspace. A diferencia del acordeón que
   * reemplaza, NO alterna: volver a tocar la pestaña activa no cierra nada.
   * Las pestañas que no son del editor -- estructura, zonas y pagos -- cierran
   * el draft en vez de intentar abrir uno, y si el editor está sucio se le
   * pide salir primero (`closeForm` desencola el destino).
   */
  function selectConsoleSection(event, section) {
    if (!event) return

    if (NON_EDITOR_SECTIONS.has(section)) {
      if (consoleSection === section) return
      if (formOpen && draft.id) {
        pendingConsoleSectionRef.current = section
        exitEditRef.current?.()
        return
      }
      if (section === 'structure') {
        openStructureSection()
        return
      }
      setFormOpen(false)
      setEditorBaselineSignature(null)
      setDraft(createAdminEventDraft())
      setConsoleSection(section)
      setConsoleChapter(null)
      setConsoleOpen(true)
      return
    }

    if (!canEdit) return
    if (formOpen && draft.id) {
      setEditorFocus(section)
      setConsoleSection(section)
      setConsoleChapter(section === 'sales' ? 'cupo' : null)
      return
    }
    openEditForm(event, section)
  }

  function selectConsoleChapter(event, section, chapter) {
    if (!event) return
    if (section === 'structure') {
      if (consoleSection === 'structure') {
        setConsoleChapter(chapter)
        return
      }
      if (formOpen && draft.id) {
        pendingConsoleSectionRef.current = 'structure'
        pendingConsoleChapterRef.current = chapter
        exitEditRef.current?.()
        return
      }
      openStructureSection(chapter)
      return
    }
    if (!canEdit) return
    if (formOpen && draft.id === event.id && consoleSection === section) {
      setConsoleChapter(chapter)
      return
    }
    openEditForm(event, section, chapter)
  }

  /**
   * Interruptor de un toque de un bloque de la pagina publica. Escribe sobre
   * el draft y deja abierta la pestaña Vista publica: es el atajo que evita
   * entrar al formulario para apagar el livestream.
   */
  function togglePublicModule(event, key) {
    if (!event || !canEdit) return
    const apply = (current) => {
      const surface = normalizeEventPublicSurface(current.publicSurface)
      return {
        ...current,
        publicSurface: { ...surface, [key]: !surface[key] },
      }
    }
    if (formOpen && draft.id === event.id) {
      setDraft(apply)
      setConsoleSection('visibility')
      setEditorFocus('visibility')
      return
    }
    const baseline = buildAdminEventDraft(event)
    setSelectedId(event.id)
    setEditorFocus('visibility')
    setConsoleSection('visibility')
    setConsoleChapter(null)
    setDraft(apply(baseline))
    setEditorBaselineSignature(getAdminEventDraftSignature(baseline))
    setMessage(null)
    setConsoleOpen(true)
    setFormOpen(true)
  }

  function toggleOccupancy(event) {
    if (!event || !canEdit) return
    const apply = (current) => ({
      ...current,
      capacityProgressPublic: current.capacityProgressPublic === false,
    })
    if (formOpen && draft.id === event.id) {
      setDraft(apply)
      setConsoleSection('visibility')
      setEditorFocus('visibility')
      return
    }
    const baseline = buildAdminEventDraft(event)
    setSelectedId(event.id)
    setEditorFocus('visibility')
    setConsoleSection('visibility')
    setConsoleChapter(null)
    setDraft(apply(baseline))
    setEditorBaselineSignature(getAdminEventDraftSignature(baseline))
    setMessage(null)
    setConsoleOpen(true)
    setFormOpen(true)
  }

  function closeForm({ returnToDashboard = false } = {}) {
    const wasEditingExisting = Boolean(draft.id)
    const pendingSection = pendingConsoleSectionRef.current
    const pendingChapter = pendingConsoleChapterRef.current
    pendingConsoleSectionRef.current = null
    pendingConsoleChapterRef.current = null
    discardStateRef.current?.()
    setFormOpen(false)
    setEditorBaselineSignature(null)
    setDraft(createAdminEventDraft())
    if (pendingSection === 'structure') {
      setConsoleSection('structure')
      setConsoleChapter(pendingChapter)
      setConsoleOpen(true)
      return
    }
    if (pendingSection && NON_EDITOR_SECTIONS.has(pendingSection)) {
      setConsoleSection(pendingSection)
      setConsoleChapter(null)
      setConsoleOpen(true)
      return
    }
    // En el workspace la pestaña del editor no se “pliega”: si nos quedamos
    // en Datos/Ventas, la invariante vuelve a armar el draft y el botón no
    // cierra nada. Volver al resumen es la salida de la sección.
    if (wasEditingExisting) {
      setConsoleOpen(true)
      if (returnToDashboard) {
        setConsoleSection('dashboard')
        setConsoleChapter(null)
      }
      return
    }
    setConsoleChapter(null)
    setConsoleSection(null)
  }

  /**
   * Alta rápida: mismo endpoint que el editor, pero al terminar deja el evento
   * seleccionado y la consola abierta -- que es donde queda el trabajo que el
   * alta deliberadamente no pidió (entradas, grilla, zonas).
   */
  async function handleQuickCreate(submittedDraft) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    setQuickCreateOpen(false)
    if (saved?.event?.id) setSelectedId(saved.event.id)
    setConsoleOpen(true)
    setMessage({ tone: 'success', text: t('admin.sections.events.created') })
    return saved
  }

  async function handleSubmit(submittedDraft) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    const wasCreate = !submittedDraft.id
    closeForm()
    if (saved?.event?.id) setSelectedId(saved.event.id)
    if (wasCreate) {
        setConsoleOpen(true)
    }
    setMessage({
      tone: 'success',
      text: submittedDraft.id
        ? t('admin.sections.events.updated')
        : t('admin.sections.events.created'),
    })
    return saved
  }

  /**
   * Estado / acceso / visibilidad: PATCH parcial. No pasa por el upsert
   * porque ese recrea días y tipos de entrada.
   */
  async function handleExtraStateSave() {
    const pending = statePendingRef.current
    const slug = selectedEvent?.slug
    if (!slug || !pending || Object.keys(pending).length === 0) return null
    const result = await onSetEventState?.(slug, pending)
    if (result?.error) throw new Error(result.error)
    const event = result?.event
    const synced = {}
    if (pending.status !== undefined) synced.status = event?.status ?? pending.status
    if (pending.published !== undefined) synced.published = event?.published ?? pending.published
    if (pending.requiresMembership !== undefined) {
      synced.requiresMembership = event?.requiresMembership ?? pending.requiresMembership
    }
    const nextDraft = { ...draft, ...synced }
    setDraft(nextDraft)
    setEditorBaselineSignature((current) =>
      current == null ? current : getAdminEventDraftSignature(nextDraft),
    )
    setMessage({
      tone: 'success',
      text: t('admin.sections.events.updated'),
    })
    return synced
  }

  async function handleStructureSave(submittedDraft) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    setMessage({
      tone: 'success',
      text: t('admin.sections.events.updated'),
    })
    return saved
  }

  /**
   * Borrado definitivo. El diálogo pide primero el impacto real (dry run en la
   * base) para que el operador vea qué se lleva puesto; si el evento ya movió
   * plata o gente, la API rechaza el primer intento y ahí se escala a escribir
   * el identificador del evento.
   */
  function openDeleteDialog(event) {
    if (!event) return
    setPendingDelete(event)
    setDeleteImpact(null)
    setDeleteError('')
    setRequiresForce(false)
    setMessage(null)

    deleteTargetRef.current = event.slug
    if (!onFetchDeleteImpact) return
    onFetchDeleteImpact(event.slug)
      .then((impact) => {
        if (deleteTargetRef.current !== event.slug) return
        setDeleteImpact(impact)
        setRequiresForce(impact?.requiresForce === true)
      })
      .catch((error) => {
        if (deleteTargetRef.current !== event.slug) return
        setDeleteError(error?.message ?? t('admin.sections.events.delete.error'))
      })
  }

  function closeDeleteDialog() {
    if (deleteBusy) return
    deleteTargetRef.current = null
    setPendingDelete(null)
    setDeleteImpact(null)
    setDeleteError('')
    setRequiresForce(false)
  }

  async function handleDelete() {
    if (!pendingDelete || !onDeleteEvent) return
    setDeleteError('')
    setDeleteBusy(true)
    try {
      const result = await onDeleteEvent(pendingDelete.slug, { force: requiresForce })
      if (result?.error) throw new Error(result.error)
      deleteTargetRef.current = null
      setPendingDelete(null)
      setDeleteImpact(null)
      setRequiresForce(false)
      // La consola no puede quedar mostrando un evento que ya no existe: el
      // fallback de selectedEvent a rows[0] la dejaría abierta sobre otro meet.
      setConsoleOpen(false)
      setMessage({
        tone: 'success',
        text: t('admin.sections.events.delete.done', { title: pendingDelete.title }),
      })
    } catch (error) {
      // 409 sin force: la base pide consentimiento explícito porque el evento
      // tiene actividad real. No es un fallo, es el segundo paso.
      if (error?.status === 409 && !requiresForce) setRequiresForce(true)
      setDeleteError(error?.message ?? t('admin.sections.events.delete.error'))
    } finally {
      setDeleteBusy(false)
    }
  }

  function renderEventGroup(group) {
    const isFinishedGroup = group.tone === 'finished'
    return (
      <li
        className={['admin-event-group', isFinishedGroup ? 'admin-event-group--finished' : '']
          .filter(Boolean)
          .join(' ')}
        key={group.id}
      >
        <div className="admin-event-group__label">
          <span>{group.label}</span>
          <strong>{group.rows.length}</strong>
        </div>
        <ul className="admin-event-group__list">
          {group.rows.map((row) => (
            <EventListRow
              key={row.id}
              row={row}
              selected={row.id === selectedEvent?.id}
              locale={locale}
              onSelect={handleSelectEvent}
              t={t}
            />
          ))}
        </ul>
      </li>
    )
  }


  const headerActions =
    onRefresh || canEdit ? (
      <div className="admin-events__header-actions">
        {onRefresh ? (
          <AdminIconButton
            className={
              isLoading ? 'admin-events__refresh-btn is-spinning' : 'admin-events__refresh-btn'
            }
            disabled={isLoading}
            icon={RefreshCw}
            label={
              isLoading ? t('admin.sections.events.refreshing') : t('admin.sections.events.refresh')
            }
            onClick={onRefresh}
            variant="ghost"
          />
        ) : null}
        {canEdit ? (
          <Button type="button" variant="gold" className="btn--small" onClick={openCreateForm}>
            <Plus size={15} aria-hidden />
            {t('admin.actions.newEvent')}
          </Button>
        ) : null}
      </div>
    ) : null

  const eventsKpis = (
    <div
      className="admin-events-kpis"
      role="group"
      aria-label={t('admin.sections.events.kpisAria')}
    >
      <div className="admin-events-kpi admin-events-kpi--primary">
        <strong className="admin-events-kpi__value">{kpiStats.upcomingCount}</strong>
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiUpcoming')}</span>
      </div>
      <div className="admin-events-kpi">
        <strong className="admin-events-kpi__value">{kpiStats.totalRegistered}</strong>
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiRegistered')}</span>
      </div>
      <div className="admin-events-kpi">
        <strong className="admin-events-kpi__value">{kpiStats.fillPercent}%</strong>
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiFill')}</span>
      </div>
      <div className="admin-events-kpi admin-events-kpi--quiet">
        <strong className="admin-events-kpi__value">{kpiStats.inView}</strong>
        <span className="admin-events-kpi__label">{t('admin.sections.events.kpiTotal')}</span>
      </div>
    </div>
  )

  const deleteDialog = pendingDelete ? (
    <AdminDeleteConfirmDialog
      busy={deleteBusy}
      error={deleteError}
      onCancel={closeDeleteDialog}
      onConfirm={() => void handleDelete()}
      title={t('admin.sections.events.delete.confirmTitle')}
      description={
        deleteImpact
          ? t('admin.sections.events.delete.confirmDescription', {
              title: pendingDelete.title,
              slug: pendingDelete.slug,
              registrations: deleteImpact.impact?.registrations ?? 0,
              tickets: deleteImpact.impact?.tickets ?? 0,
              orders: deleteImpact.impact?.ticketOrders ?? 0,
              checkIns: deleteImpact.impact?.checkIns ?? 0,
            })
          : t('admin.sections.events.delete.loading')
      }
      warning={
        requiresForce
          ? t('admin.sections.events.delete.forceWarning', {
              paidRegistrations: deleteImpact?.impact?.paidRegistrations ?? 0,
              paidTickets: deleteImpact?.impact?.paidTickets ?? 0,
              checkIns: deleteImpact?.impact?.checkIns ?? 0,
            })
          : t('admin.sections.events.delete.warning')
      }
      confirmPhrase={requiresForce ? pendingDelete.slug : null}
      confirmPhraseLabel={t('admin.sections.events.delete.phraseLabel')}
      confirmPhraseHint={t('admin.sections.events.delete.phraseHint', {
        slug: pendingDelete.slug,
      })}
      cancelLabel={t('admin.sections.events.delete.cancel')}
      confirmLabel={t('admin.sections.events.delete.confirm')}
      busyLabel={t('admin.sections.events.delete.deleting')}
    />
  ) : null

  /**
   * El workspace reemplaza el listado a ancho completo. No es un modal encima
   * de la lista: es la página del evento, con su propia URL.
   */
  if (consoleOpen && selectedEvent) {
    return (
      <>
        <AdminEventWorkspace
          activeSection={consoleSection}
          canDelete={canDeleteEvents && Boolean(onDeleteEvent)}
          canEdit={canEdit}
          canManageUsers={canManageUsers}
          editor={
            formOpen && draft.id && EDITOR_SECTIONS.has(consoleSection) ? (
              <AdminEventEditor
                key={draft.id}
                accordion
                embedded
                baselineSignature={editorBaselineSignature}
                canEdit={canEdit}
                draft={draft}
                forcedTab={consoleSection}
                forcedChapter={consoleChapter}
                sourceEvent={editingSource}
                onSetEventRegistrationPrice={onSetEventRegistrationPrice}
                onClearEventPriceSchedule={onClearEventPriceSchedule}
                onCancel={() => closeForm({ returnToDashboard: true })}
                onChange={setDraft}
                onRegisterClose={(fn) => {
                  exitEditRef.current = fn
                }}
                onRequestSection={(section) => {
                  setEditorFocus(section)
                  setConsoleSection(section)
                  setConsoleChapter(section === 'sales' ? (consoleChapter ?? 'cupo') : null)
                }}
                onSubmit={handleSubmit}
                extraDirty={stateDirty}
                onExtraSave={handleExtraStateSave}
                onExtraDiscard={() => discardStateRef.current?.()}
              />
            ) : null
          }
          event={selectedEvent}
          onBack={closeEventConsole}
          onDelete={openDeleteDialog}
          onManageCheckin={onManageCheckin}
          onManageRegistrations={onManageRegistrations}
          onSelectChapter={selectConsoleChapter}
          onSelectSection={selectConsoleSection}
          onSetEventState={onSetEventState}
          onStatePendingChange={(payload) => {
            const next = payload && typeof payload === 'object' ? payload : {}
            statePendingRef.current = next
            setStateDirty(Object.keys(next).length > 0)
          }}
          onRegisterStateDiscard={(fn) => {
            discardStateRef.current = fn
          }}
          onToggleOccupancy={toggleOccupancy}
          onTogglePublicModule={togglePublicModule}
          openChapter={consoleChapter}
          paymentSummary={selectedPaymentSummary}
          paymentsAttention={selectedPaymentTriage?.needsAttention?.length ?? null}
          paymentsSection={
            canValidatePayments || onManagePayments || onOpenFinanceForEvent ? (
              <AdminEventPaymentsTriage
                athletes={athletes}
                canEdit={canValidatePayments}
                event={selectedEvent}
                onApprovePayment={onApprovePayment}
                onApproveTicketOrder={onApproveTicketOrder}
                onOpenFinance={
                  onOpenFinanceForEvent ? () => onOpenFinanceForEvent(selectedEvent) : undefined
                }
                onRefresh={onRefreshPayments}
                onRejectPayment={onRejectPayment}
                onRejectTicketOrder={onRejectTicketOrder}
                payments={payments}
                pendingTicketOrders={pendingTicketOrders}
              />
            ) : null
          }
          previewDraft={
            formOpen && draft.id && draft.id === selectedEvent.id ? draft : null
          }
          securitySection={
            canManageUsers ? (
              <div className="admin-event-workspace__security-stack">
                <AdminEventZonesSection
                  canManageUsers={canManageUsers}
                  eventId={selectedEvent.id}
                  eventSlug={selectedEvent.slug}
                  onAssignMember={
                    onAssignSecurityZone
                      ? async (userId, zoneId) => {
                          const zones = await onAssignSecurityZone(userId, zoneId)
                          setZonesReloadToken((current) => current + 1)
                          return zones
                        }
                      : undefined
                  }
                  onCreateAccessLink={onCreateSecurityAccessLink}
                  onCreateZone={onCreateSecurityZone}
                  onDeleteZone={onDeleteSecurityZone}
                  onListSecurityUsers={onListSecurityUsers}
                  onListZones={onListSecurityZones}
                  onPresetZones={onPresetSecurityZones}
                  onUpdateZone={onUpdateSecurityZone}
                  reloadToken={zonesReloadToken}
                />
                <AdminEventSecuritySection
                  canManageUsers={canManageUsers}
                  eventId={selectedEvent.id}
                  eventSlug={selectedEvent.slug}
                  eventEndsAt={selectedEvent.endsAt}
                  onCreateSecurityUser={onCreateSecurityUser}
                  onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
                  onCreateSecurityAccessLink={onCreateSecurityAccessLink}
                  onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
                  onListSecurityUsers={onListSecurityUsers}
                  onTeamChange={() => setZonesReloadToken((current) => current + 1)}
                  onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
                  reloadToken={zonesReloadToken}
                />
                {canViewScanReport ? (
                  <AdminEventScanReportSection
                    canManageAccessOverride={canEdit}
                    eventSlug={selectedEvent.slug}
                    onGetReport={onGetEventScanReport}
                    onSetTicketAccessOverride={onSetTicketAccessOverride}
                  />
                ) : null}
              </div>
            ) : null
          }
          structureEditor={
            <AdminEventStructureEditor
              canEdit={canEdit}
              chapter={consoleChapter}
              event={selectedEvent}
              eventSlug={selectedEvent.slug}
              onSaveEvent={handleStructureSave}
            />
          }
          tickets={tickets}
        />
        {deleteDialog}
      </>
    )
  }

  return (
    <AdminListSection
      eyebrow={null}
      actions={headerActions}
      filteredCount={rows.length}
      placeholder={t('admin.search.event')}
      query={query}
      showHeader
      showStats={false}
      title={t('admin.sections.events.title')}
      subtitle={null}
      readOnlyHint={!canEdit ? t('admin.sections.events.readOnlyHint') : null}
      totalCount={adminEvents.length}
      variant="events"
      beforeFilters={eventsKpis}
      filters={[
        {
          id: 'status',
          label: t('admin.filters.status'),
          value: status,
          onChange: setStatus,
          options: statusOptions,
          showLabel: false,
        },
        ...(years.length > 1
          ? [
              {
                id: 'year',
                label: t('admin.sections.events.year'),
                value: yearFilter,
                onChange: setYear,
                defaultValue: suggestedYear,
                options: yearOptions,
                showLabel: true,
              },
            ]
          : []),
      ]}
      onQueryChange={setQuery}
    >
      {loadError ? (
        <div className="admin-events__notice admin-events__notice--error" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <div>
            <strong>{t('admin.sections.events.loadErrorTitle')}</strong>
            <p>{loadError}</p>
          </div>
          {onRefresh ? (
            <Button type="button" variant="outline" className="btn--small" onClick={onRefresh}>
              {t('admin.sections.events.retry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className={`admin-events__message admin-events__message--${message.tone}`} role="status">
          {message.text}
        </p>
      ) : null}

        <div className="admin-events-workspace">
          <div className="admin-events-workspace__main">
            {isLoading && adminEvents.length === 0 ? (
              <div className="admin-events__loading" role="status">
                <span className="plu-spinner plu-spinner--lg" aria-hidden="true" />
                <p>{t('admin.sections.events.loading')}</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="data-table__empty-wrap data-table__empty-wrap--admin">
                <span className="data-table__empty-icon" aria-hidden>
                  <CalendarDays size={20} strokeWidth={1.5} />
                </span>
                <p className="data-table__empty data-table__empty--admin admin-event-list__empty">
                  {adminEvents.length === 0
                    ? t('admin.sections.events.empty')
                    : t('admin.sections.events.emptyFiltered')}
                </p>
                <p className="admin-event-list__empty-lead">
                  {adminEvents.length === 0
                    ? t('admin.sections.events.emptyLead')
                    : t('admin.sections.events.emptyFilteredLead')}
                </p>
                {canEdit && adminEvents.length === 0 ? (
                  <Button
                    type="button"
                    variant="gold"
                    className="btn--small"
                    onClick={openCreateForm}
                  >
                    <Plus size={14} aria-hidden />
                    {t('admin.sections.events.createFirst')}
                  </Button>
                ) : null}
                {adminEvents.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="btn--small"
                    onClick={() => {
                      setQuery('')
                      setStatus('all')
                      setYear(suggestedYear || 'all')
                    }}
                  >
                    {t('admin.sections.events.clearFilters')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="admin-event-list" aria-label={t('admin.columns.event')}>
                {leadEvent ? (
                  <EventListRow
                    key={`lead-${leadEvent.id}`}
                    row={leadEvent}
                    selected={leadEvent.id === selectedEvent?.id}
                    locale={locale}
                    onSelect={handleSelectEvent}
                    t={t}
                    variant="lead"
                  />
                ) : null}
                {eventCatalog.map((chapter) => (
                  <li
                    key={chapter.id}
                    className={[
                      'admin-event-chapter',
                      chapter.id === 'archive' ? 'admin-event-chapter--archive' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {chapter.heading ? (
                      <h3 className="admin-event-chapter__label">{chapter.heading}</h3>
                    ) : null}
                    <ul className="admin-event-chapter__groups">
                      {chapter.groups.map(renderEventGroup)}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      {quickCreateOpen ? (
        <AdminEventQuickCreate
          canEdit={canEdit}
          onCancel={() => setQuickCreateOpen(false)}
          onOpenFullEditor={openFullEditorFromQuickCreate}
          onSubmit={handleQuickCreate}
        />
      ) : null}

      {/* Alta completa (sin id): sigue en modal propio; no hay consola de evento. */}
      {formOpen && !draft.id ? (
        <AdminEventEditor
          canEdit={canEdit}
          draft={draft}
          initialFocus={editorFocus}
          sourceEvent={editingSource}
          onSetEventRegistrationPrice={onSetEventRegistrationPrice}
          onClearEventPriceSchedule={onClearEventPriceSchedule}
          onCancel={closeForm}
          onChange={setDraft}
          onSubmit={handleSubmit}
        />
      ) : null}

      {deleteDialog}
    </AdminListSection>
  )
}
