import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Construction,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Star,
  Unlock,
  X,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminEventWorkspace, {
  formatEventVenueLine,
} from '../../components/admin/AdminEventWorkspace.jsx'
import AdminEventEditor, {
  getAdminEventDraftSignature,
} from '../../components/admin/AdminEventEditor.jsx'
import AdminEventMark from '../../components/admin/AdminEventMark.jsx'
import AdminEventPaymentsTriage from '../../components/admin/AdminEventPaymentsTriage.jsx'
import AdminEventRegistrationsPanel, {
  buildEventRegistrationStatusCounts,
} from '../../components/admin/AdminEventRegistrationsPanel.jsx'
import AdminEventQuickCreate from '../../components/admin/AdminEventQuickCreate.jsx'
import AdminEventScanReportSection from '../../components/admin/AdminEventScanReportSection.jsx'
import AdminEventOrganizersSection from '../../components/admin/AdminEventOrganizersSection.jsx'
import AdminEventSecuritySection from '../../components/admin/AdminEventSecuritySection.jsx'
import AdminEventStructureEditor from '../../components/admin/AdminEventStructureEditor.jsx'
import AdminEventZonesSection from '../../components/admin/AdminEventZonesSection.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminListSection from '../../components/admin/AdminListSection.jsx'
import AdminSiteTeaserControl from '../../components/admin/AdminSiteTeaserControl.jsx'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { translateFilterOptions } from '../../i18n/adminHelpers.js'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getEventsTourSteps } from '../../lib/adminTourSteps.js'
import {
  clearAdminEventRoute,
  isAdminEventCreateSlug,
  pushAdminEventCreateRoute,
  pushAdminEventRoute,
} from '../../lib/adminEventRoute.js'
import { notifyError, notifySuccess, notifyWarning } from '../../lib/adminToast.js'
import { formatDayMonth, formatMonthYear } from '../../lib/format.js'
import { getStatusMeta } from '../../lib/status.js'
import {
  resolveEventPublishConfirmChecks,
  summarizeEventPaymentChannels,
} from '../../lib/eventPublishChecks.js'
import { resolveRegistrationSale } from '../../../shared/registrationSaleState.js'
import { eventSiteState } from '../../lib/eventPublicSurface.js'
import { EVENT_PAYMENT_CHANNELS } from '../../lib/eventPaymentChannels.js'
import { getCompetitionNavEvents } from '../../lib/eventNavigation.js'
import useEventPayments from '../../hooks/useEventPayments.js'
import useEventTickets from '../../hooks/useEventTickets.js'
import usePlatformPaymentChannels from '../../hooks/usePlatformPaymentChannels.js'
import { fetchSiteTeaser, saveSiteTeaser } from '../../services/siteTeaserService.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  buildAdminEventDraft,
  createAdminEventDraft,
  filterAdminEvents,
  listAdminEventYears,
} from '../../services/eventAdminService.js'
import {
  buildEventPaymentTriage,
  formatEventPaymentTriageSummary,
} from '../../services/eventPaymentTriage.js'

import '../../styles/pages/admin-events-index.css'

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

/** Solo el mes ("Diciembre"), para los grupos que ya cuelgan de un año. */
function formatMonthName(monthKey, locale = 'es') {
  const date = new Date(`${monthKey}-01T12:00:00`)
  if (Number.isNaN(date.getTime())) return monthKey
  const label = date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
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

/** Lo único de Mercado Pago que la lista tiene que decir: que no va a poder cobrar. */
function mercadoPagoIssue(row, summary) {
  if (!summary.registration.includes('mercado_pago')) return null
  const readiness = row.mercadoPagoReadiness
  const destination =
    readiness?.destination ?? (row.mercadoPagoProfileId ? 'profile' : 'platform')
  if (destination === 'missing') return 'mpMissing'
  if (readiness?.connectionStatus === 'needs_reconnect') return 'mpNeedsReconnect'
  return null
}

/**
 * La venta de inscripciones del evento, en la lista: el mismo estado que el
 * control de venta del Resumen (`resolveRegistrationSale`) y, debajo, un solo
 * dato que lo explica — con qué cobra, qué la bloquea o cuándo abre.
 *
 * Antes la columna "Cobro" apilaba hasta cuatro líneas por fila (semáforo,
 * medios de inscripción, de entradas y la cuenta de Mercado Pago) iguales en
 * casi todos los eventos, y la columna "Estado" repetía el estado guardado,
 * que podía decir "Inscripción abierta" con el evento oculto.
 */
function EventSaleCell({ row, platform, locale, t }) {
  const summary = summarizeEventPaymentChannels(row, platform)
  const sale = resolveRegistrationSale(row, {
    platform,
    registrationChannels: platform ? summary.registration : null,
  })
  const mpIssue = mercadoPagoIssue(row, summary)

  let detail = null
  if (sale.state === 'on_sale') {
    detail =
      summary.registration.length === EVENT_PAYMENT_CHANNELS.length
        ? t('admin.sections.events.payAll')
        : summary.registration
            .map((channel) => t(`admin.eventEditor.paymentChannelShort.${channel}`))
            .join(' · ')
  } else if (sale.state === 'scheduled') {
    detail = t('admin.eventSale.listOpensOn', { date: formatDayMonth(sale.opensAt, locale) })
  } else if (sale.state === 'blocked') {
    detail = t(`admin.eventSale.listBlocker_${sale.blockers[0]}`)
  } else if (sale.state === 'closed') {
    detail = t(`admin.eventSale.listClosed_${sale.reason ?? 'notOpened'}`)
  }

  return (
    <span className={`admin-event-row__pay admin-event-row__sale is-${sale.state}`}>
      <span className="admin-event-row__sale-state">
        <span className="admin-event-row__sale-dot" aria-hidden />
        {t(`admin.eventSale.listState_${sale.state}`)}
      </span>
      {detail ? <span className="admin-event-row__sale-detail">{detail}</span> : null}
      {mpIssue && ['on_sale', 'scheduled', 'blocked'].includes(sale.state) ? (
        <span className="admin-event-row__mp admin-event-row__mp--warn">
          {t(`admin.sections.events.${mpIssue}`)}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Estado de publicación de la fila. Con permiso es el interruptor de un toque
 * (antes había que entrar a la consola de cada meet para publicarlo); sin
 * permiso, o con el meet ya terminado, es el mismo dato como texto.
 */
function EventVisibilityControl({ row, canToggle, busy, onToggle, t }) {
  const published = row.published !== false
  // Publicado con la landing apagada: se ve el cartel de "en construcción".
  const construction = published && eventSiteState(row) === 'construction'
  const label = construction
    ? t('admin.eventConsole.siteConstruction')
    : published
      ? t('admin.eventState.published')
      : t('admin.eventState.hidden')
  const Icon = construction ? Construction : published ? Eye : EyeOff
  const content = (
    <>
      <Icon size={14} aria-hidden />
      <span className="admin-event-row__vis-label">{label}</span>
    </>
  )
  if (!canToggle) {
    return <span className="admin-event-row__vis admin-event-row__vis--static">{content}</span>
  }
  const action = published
    ? t('admin.sections.events.hideAria', { title: row.title })
    : t('admin.sections.events.publishAria', { title: row.title })
  return (
    <button
      type="button"
      className={`admin-event-row__vis${published ? ' is-published' : ''}`}
      aria-label={action}
      title={action}
      disabled={busy}
      onClick={() => onToggle(row)}
    >
      {content}
    </button>
  )
}

function EventListRow({
  row,
  platform = null,
  selected,
  locale,
  inNav = false,
  onSelect,
  onTogglePin,
  onDuplicate,
  onToggleVisibility,
  pinBusy = false,
  visibilityBusy = false,
  canPin = false,
  justCreated = false,
  selectMode = false,
  checked = false,
  onToggleSelect,
  t,
}) {
  const { tone } = getStatusMeta(row.status)
  const venueLine = formatEventVenueLine(row.venue, row.location)
  const dateLabel = row.dateISO ? formatDayMonth(row.dateISO, locale) : (row.date ?? '')
  const rawFill = row.slots > 0 ? Math.round((row.registered / row.slots) * 100) : 0
  const capacityTone = rawFill >= 100 ? 'full' : rawFill >= 80 ? 'high' : 'available'
  const finished = isFinishedEvent(row)
  const canToggle = canPin && !finished

  return (
    <li
      className={[
        'admin-event-row',
        `admin-event-row--${tone}`,
        row.featured ? 'admin-event-row--featured' : '',
        justCreated ? 'admin-event-row--new' : '',
        selected && !selectMode ? 'admin-event-row--selected' : '',
        selectMode ? 'admin-event-row--selecting' : '',
        selectMode && checked ? 'admin-event-row--checked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-event-id={row.id}
    >
      {selectMode ? (
        <input
          type="checkbox"
          className="admin-event-row__check"
          checked={checked}
          aria-label={t('admin.sections.events.selectRowAria', { title: row.title })}
          onChange={() => onToggleSelect?.(row.id)}
        />
      ) : null}
      <button
        type="button"
        className="admin-event-row__main"
        aria-current={selected && !selectMode ? 'true' : undefined}
        title={row.slug ? `${row.title} · ${row.slug}` : row.title}
        onClick={() => (selectMode ? onToggleSelect?.(row.id) : onSelect(row.id))}
      >
        <AdminEventMark event={row} size="sm" />

        <span className="admin-event-row__title-wrap">
          <strong className="admin-event-row__title">{row.title}</strong>
          {row.featured ? (
            <span
              className="admin-event-row__featured-mark"
              title={t('admin.sections.events.leadFeatured')}
              aria-label={t('admin.sections.events.leadFeatured')}
            >
              <Star size={12} aria-hidden />
            </span>
          ) : null}
          {row.rosterFrozenAt ? (
            <span className="admin-event-row__nav-mark" title={t('admin.liftersExport.rosterFrozen')}>
              {t('admin.liftersExport.rosterFrozenShort')}
            </span>
          ) : null}
          {inNav ? (
            <span
              className="admin-event-row__nav-mark"
              title={t('admin.sections.events.inNavHint')}
            >
              {t('admin.sections.events.inNav')}
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
        </span>

        <span className="admin-event-row__meta">
          {dateLabel ? <span className="admin-event-row__date">{dateLabel}</span> : null}
          {venueLine ? <span className="admin-event-row__venue">{venueLine}</span> : null}
        </span>

        <EventSaleCell locale={locale} platform={platform} row={row} t={t} />

        <span className="admin-event-row__status">
          <span className={`admin-event-row__capacity admin-event-row__capacity--${capacityTone}`}>
            <strong>
              {row.registered}
              <span>/{row.slots}</span>
            </strong>
            <small>{t('admin.sections.events.registeredCaption')}</small>
          </span>
        </span>
      </button>

      {selectMode ? null : (
        <span className="admin-event-row__actions">
          <EventVisibilityControl
            row={row}
            canToggle={canToggle && Boolean(onToggleVisibility)}
            busy={visibilityBusy}
            onToggle={onToggleVisibility}
            t={t}
          />
          {canPin && onDuplicate ? (
            <button
              type="button"
              className="admin-event-row__pin admin-event-row__duplicate"
              aria-label={t('admin.sections.events.duplicateAria', { title: row.title })}
              title={t('admin.sections.events.duplicate')}
              onClick={() => onDuplicate(row)}
            >
              <Copy size={15} aria-hidden />
            </button>
          ) : null}
          {canToggle ? (
            <button
              type="button"
              className="admin-event-row__pin"
              aria-pressed={Boolean(row.featured)}
              aria-label={
                row.featured ? t('admin.sections.events.unpin') : t('admin.sections.events.pin')
              }
              title={row.featured ? t('admin.sections.events.unpin') : t('admin.sections.events.pin')}
              disabled={pinBusy}
              onClick={() => onTogglePin?.(row)}
            >
              <Star size={15} aria-hidden />
            </button>
          ) : null}
          <ChevronRight size={16} aria-hidden className="admin-event-row__chevron" />
        </span>
      )}
    </li>
  )
}

/** Pestañas del workspace que no montan el editor del evento. */
const NON_EDITOR_SECTIONS = new Set(['structure', 'security', 'payments', 'registrations'])
/** Pestañas que sí viven del draft del editor. El resumen no entra: si
 *  “Cerrar sección” va a dashboard y la invariante rearma el form, el botón
 *  no cierra nada. */
const EDITOR_SECTIONS = new Set(['basics', 'sales', 'visibility'])
/** Destino pendiente de `closeForm`: salir del workspace al listado. */
const CONSOLE_BACK = '__back__'

export default function EventsSection({
  adminEvents,
  /** Deep link `/admin/eventos/:slug`: abre el workspace de ese evento al entrar. */
  adminEventWorkspaceSlug = null,
  athletes = [],
  canEdit,
  canDeleteEvents = false,
  canManageUsers,
  // Equipo de puerta del evento: lo gestionan quienes administran usuarios Y el
  // organizador (con `admin.event_team.write`) sobre sus eventos. Sin valor, vale
  // lo que `canManageUsers`.
  canManageEventTeam = null,
  // Cuenta por evento (organizador): ve y edita solo sus eventos. No crea, publica,
  // destaca ni toca el aviso del sitio: esas rutas están cerradas para él en el servidor.
  eventScoped = false,
  /** Staff del panel: sirve para listar/asignar organizadores de este meet. */
  users = [],
  onCreateUser,
  onSetEventAccess,
  canViewScanReport = false,
  canValidatePayments = false,
  canSetRegistrationStatus = false,
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
  gatePendingIds,
  onManageCheckin,
  onManagePayments,
  onManageRegistrations,
  onOpenFinanceForEvent,
  registrations = [],
  /** Organizer sin `registrations.read`: no monta la pestaña. Staff: true. */
  showRegistrations = true,
  onPresetSecurityZones,
  onRefresh,
  onRefreshAthleteData,
  onRefreshPayments,
  onRejectPayment,
  onRejectTicketOrder,
  onSaveEvent,
  onSetRegistrationStatus,
  onSetEventLogo,
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
  /** Sección de la lista: próximos, archivo o todo. */
  const [view, setView] = useState('upcoming')
  const [pinBusyId, setPinBusyId] = useState(null)
  const [visibilityBusyId, setVisibilityBusyId] = useState(null)
  // Evento recién dado de alta: la lista lo resalta y lo trae a la vista.
  const [justCreatedId, setJustCreatedId] = useState(null)
  const [selectedId, setSelectedId] = useState(adminEvents[0]?.id ?? null)

  useEffect(() => {
    startTour('admin-events', getEventsTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])
  // Anuncio "Pronto habrá novedades": `null` hasta que se lee, para no mostrar
  // un estado inventado.
  const [teaserEnabled, setTeaserEnabled] = useState(null)
  const [teaserBusy, setTeaserBusy] = useState(false)
  const [teaserLoadFailed, setTeaserLoadFailed] = useState(false)

  async function loadSiteTeaser() {
    setTeaserBusy(true)
    setTeaserLoadFailed(false)
    try {
      const teaser = await fetchSiteTeaser()
      setTeaserEnabled(teaser.eventsEnabled)
    } catch {
      setTeaserEnabled(null)
      setTeaserLoadFailed(true)
    } finally {
      setTeaserBusy(false)
    }
  }

  useEffect(() => {
    // El aviso del sitio es global (de PLU): el organizador no lo ve ni lo pide.
    if (eventScoped) return undefined
    let active = true
    fetchSiteTeaser()
      .then((teaser) => {
        if (active) {
          setTeaserEnabled(teaser.eventsEnabled)
          setTeaserLoadFailed(false)
        }
      })
      .catch(() => {
        if (active) {
          setTeaserEnabled(null)
          setTeaserLoadFailed(true)
        }
      })
    return () => {
      active = false
    }
  }, [eventScoped])

  async function handleToggleTeaser(next) {
    if (!canEdit || teaserBusy) return
    setTeaserBusy(true)
    setMessage(null)
    try {
      const saved = await saveSiteTeaser(next)
      setTeaserEnabled(saved.eventsEnabled)
      setTeaserLoadFailed(false)
      setMessage({
        tone: 'success',
        text: t(
          saved.eventsEnabled
            ? 'admin.sections.events.teaser.enabledDone'
            : 'admin.sections.events.teaser.disabledDone',
        ),
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error?.message || t('admin.sections.events.teaser.saveError'),
      })
    } finally {
      setTeaserBusy(false)
    }
  }

  const [formOpen, setFormOpen] = useState(false)
  // Alta rápida y editor completo son dos superficies distintas: crear no pide
  // las mismas decisiones que editar (ver AdminEventQuickCreate). El alta es una
  // página con su URL (`/admin/eventos/nuevo`): el estado local manda y la URL
  // lo refleja, igual que el workspace, así funciona también montada sola.
  // Quién ve la pestaña "Zonas y seguridad" y puede armar el equipo de puerta.
  const teamAccess = canManageEventTeam ?? canManageUsers
  const [quickCreateOpen, setQuickCreateOpen] = useState(
    () => !eventScoped && isAdminEventCreateSlug(adminEventWorkspaceSlug),
  )
  // Duplicar un evento abre el alta con sus datos repetibles ya cargados.
  const [duplicateSource, setDuplicateSource] = useState(null)
  const duplicateRunRef = useRef(0)
  // Selección en lote para publicar u ocultar varios eventos de una vez.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const platformChannels = usePlatformPaymentChannels()
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
  // `formOpen` y el borrador del último render, para callbacks que terminan
  // después (un PATCH en vuelo, el "Deshacer" de un aviso).
  const formOpenRef = useRef(false)
  formOpenRef.current = formOpen
  const draftRef = useRef(null)
  draftRef.current = draft
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
    setJustCreatedId(null)
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
   * "Volver" del workspace. Con el editor abierto, la salida pasa por él: si
   * hay cambios sin guardar muestra su confirmación (guardar / descartar) y
   * recién después `closeForm` cierra la consola. Antes se reseteaba el draft
   * directo y los cambios de la landing se perdían sin aviso.
   */
  function backFromEventConsole() {
    if (formOpen && draft.id && exitEditRef.current) {
      pendingConsoleSectionRef.current = CONSOLE_BACK
      exitEditRef.current()
      return
    }
    // En el Resumen el editor no está montado pero el borrador sigue vivo (la
    // vista previa lo usa): si tiene cambios, se pregunta antes de tirarlo.
    if (
      formOpen &&
      draft.id &&
      editorBaselineSignature != null &&
      getAdminEventDraftSignature(draft) !== editorBaselineSignature &&
      !window.confirm(t('admin.eventConsole.discardBackConfirm'))
    ) {
      return
    }
    closeEventConsole()
  }

  /**
   * Deep link: entrar por `/admin/eventos/:slug` abre el workspace de ese
   * evento con Datos listo. Espera a que la lista haya cargado el evento.
   */
  /**
   * El alta sigue a la URL en los dos sentidos: entrar por `/admin/eventos/nuevo`
   * la abre, y el "atrás" del navegador (slug a null) la cierra.
   */
  const createRouteActive = isAdminEventCreateSlug(adminEventWorkspaceSlug)
  const wasCreateRouteRef = useRef(createRouteActive)
  useEffect(() => {
    if (createRouteActive && !eventScoped) {
      setQuickCreateOpen(true)
    } else if (wasCreateRouteRef.current) {
      setQuickCreateOpen(false)
    }
    wasCreateRouteRef.current = createRouteActive
  }, [createRouteActive, eventScoped])

  useEffect(() => {
    if (!adminEventWorkspaceSlug || consoleOpen || createRouteActive) return
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
  const navigationEvents = useMemo(() => getCompetitionNavEvents(adminEvents), [adminEvents])
  const navEventSlugs = useMemo(
    () => new Set(navigationEvents.map((event) => event.slug)),
    [navigationEvents],
  )
  // El año no se recorta solo: «Próximos» son todos los que no terminaron, sea
  // cual sea su año, y los contadores de las pestañas no cambian al pasar de una a
  // otra. Solo filtra por año quien lo elige en el selector.
  const yearFilter = years.length > 1 ? year || 'all' : 'all'

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

  // Qué filtros están escondiendo eventos: se dicen en voz alta, porque un
  // listado que muestra uno solo sin explicar por qué parece un error.
  const activeFilterLabels = useMemo(() => {
    const labels = []
    if (yearFilter !== 'all') labels.push(t('admin.sections.events.filterYear', { year: yearFilter }))
    if (status !== 'all') {
      const option = statusOptions.find(([value]) => value === status)
      labels.push(t('admin.sections.events.filterStatus', { status: option?.[1] ?? status }))
    }
    if (query.trim()) labels.push(t('admin.sections.events.filterQuery', { query: query.trim() }))
    return labels
  }, [query, status, statusOptions, t, yearFilter])
  const hiddenByFilters = activeFilterLabels.length > 0 ? adminEvents.length - rows.length : 0

  function showAllEvents() {
    setQuery('')
    setStatus('all')
    setYear('all')
  }

  const viewCounts = useMemo(() => {
    const finished = rows.filter(isFinishedEvent).length
    return { upcoming: rows.length - finished, archive: finished, all: rows.length }
  }, [rows])

  /** Si la sección elegida quedó vacía por los filtros, mostrar la que tenga algo. */
  const activeView =
    viewCounts[view] > 0 ? view : viewCounts.upcoming > 0 ? 'upcoming' : viewCounts.archive > 0 ? 'archive' : view

  const visibleRows = useMemo(
    () =>
      rows.filter((row) =>
        activeView === 'all' ? true : activeView === 'archive' ? isFinishedEvent(row) : !isFinishedEvent(row),
      ),
    [activeView, rows],
  )

  // La selección en lote opera sobre lo que se ve: si un filtro esconde un
  // evento elegido, deja de contar -- nunca se publica algo que no se está viendo.
  const selectedRows = useMemo(
    () => (selectMode ? visibleRows.filter((row) => selectedIds.has(row.id)) : []),
    [selectMode, selectedIds, visibleRows],
  )
  const unpublishedRows = useMemo(
    () => visibleRows.filter((row) => row.published === false && !isFinishedEvent(row)),
    [visibleRows],
  )

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function enterSelectMode(ids = []) {
    setMessage(null)
    setSelectedIds(new Set(ids))
    setSelectMode(true)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  /** Aplica publicado/oculto de a uno (PATCH parcial) y devuelve qué salió bien y qué no. */
  async function setVisibilityFor(rows, published) {
    const done = []
    const failed = []
    for (const row of rows) {
      try {
        const result = await onSetEventState?.(row.slug, { published })
        if (!result || result.error) throw new Error(result?.error || '')
        done.push(row)
      } catch (error) {
        failed.push({ row, reason: error?.message || t('admin.eventState.saveFailed') })
      }
    }
    return { done, failed }
  }

  /**
   * Publicar es lo que ve el público: antes de hacerlo se avisa de los eventos
   * que quedarían sin cobro posible. Es un aviso, no un bloqueo.
   */
  function confirmPublishChecks(targets) {
    const flagged = targets
      .map((row) => ({
        row,
        checks: resolveEventPublishConfirmChecks(row, platformChannels.platform),
      }))
      .filter((entry) => entry.checks.length > 0)
    if (flagged.length === 0) return true
    const lines = flagged.map(
      ({ row, checks }) =>
        `• ${row.title}: ${checks
          .map((code) => t(`admin.eventEditor.publishChecks.codes.${code}`))
          .join(' ')}`,
    )
    return window.confirm(
      [
        t('admin.eventEditor.publishChecks.bulkIntro', { count: flagged.length }),
        lines.join('\n'),
        t('admin.eventEditor.publishChecks.confirmOutro'),
      ].join('\n\n'),
    )
  }

  /**
   * Ocultar un evento del sitio corta su venta (`hidden` bloquea el cobro).
   * Para seguir vendiendo sin la página lista existe "En construcción", que
   * oculta solo la landing: se avisa antes de cortar una venta abierta o
   * programada. Es un aviso, no un bloqueo.
   */
  function confirmHideSelling(targets) {
    const selling = targets.filter((row) => {
      const { state } = resolveRegistrationSale(row)
      return state === 'on_sale' || state === 'scheduled'
    })
    if (selling.length === 0) return true
    return window.confirm(
      [
        t('admin.sections.events.hideSellingIntro', { count: selling.length }),
        selling.map((row) => `• ${row.title}`).join('\n'),
        t('admin.sections.events.hideSellingOutro'),
      ].join('\n\n'),
    )
  }

  /** Publicar u ocultar un solo evento desde su fila, sin abrir la consola. */
  async function handleToggleVisibility(row) {
    if (!canEdit || !onSetEventState || visibilityBusyId) return
    const published = row.published === false
    if (published && !confirmPublishChecks([row])) return
    if (!published && !confirmHideSelling([row])) return
    setVisibilityBusyId(row.id)
    setMessage(null)
    const { done, failed } = await setVisibilityFor([row], published)
    setVisibilityBusyId(null)
    if (failed.length > 0) {
      setMessage({ tone: 'error', text: failed[0].reason })
      return
    }
    if (done.length > 0) {
      notifySuccess(
        t(published ? 'admin.sections.events.bulkPublishedOne' : 'admin.sections.events.bulkHiddenOne'),
        {
          label: t('admin.sections.events.bulkUndo'),
          onClick: () => {
            void setVisibilityFor(done, !published).then((undo) => {
              if (undo.failed.length > 0) notifyError(undo.failed[0].reason)
            })
          },
        },
      )
    }
  }

  async function applyVisibility(published) {
    if (!onSetEventState || bulkBusy) return
    const targets = selectedRows.filter((row) => (row.published === true) !== published)
    if (targets.length === 0) {
      setMessage({ tone: 'success', text: t('admin.sections.events.bulkNothing') })
      return
    }
    if (published && !confirmPublishChecks(targets)) return
    if (!published && !confirmHideSelling(targets)) return
    setBulkBusy(true)
    setMessage(null)
    const { done, failed } = await setVisibilityFor(targets, published)
    setBulkBusy(false)

    if (done.length > 0) {
      const one = published
        ? 'admin.sections.events.bulkPublishedOne'
        : 'admin.sections.events.bulkHiddenOne'
      const many = published
        ? 'admin.sections.events.bulkPublishedMany'
        : 'admin.sections.events.bulkHiddenMany'
      // Publicar es lo que ve el público: se puede deshacer sin buscar los eventos de nuevo.
      notifySuccess(done.length === 1 ? t(one) : t(many, { count: done.length }), {
        label: t('admin.sections.events.bulkUndo'),
        onClick: () => {
          void setVisibilityFor(done, !published).then((undo) => {
            if (undo.failed.length > 0) notifyError(undo.failed[0].reason)
          })
        },
      })
    }
    if (failed.length > 0) {
      setMessage({
        tone: 'error',
        text: t('admin.sections.events.bulkPartial', {
          done: done.length,
          total: targets.length,
          title: failed[0].row.title,
          reason: failed[0].reason,
        }),
      })
      return
    }
    exitSelectMode()
  }

  const eventCatalog = useMemo(() => {
    const rest = visibleRows
    const upcoming = []
    const finished = []
    for (const row of rest) {
      if (isFinishedEvent(row)) finished.push(row)
      else upcoming.push(row)
    }

    function monthGroups(list, tone, direction, prefix, monthOnly = false) {
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
            : monthOnly
              ? formatMonthName(monthKey, locale)
              : formatMonthYear(monthKey, locale),
        rows: sortByDate(monthRows, direction),
      }))
    }

    const chapters = []
    const upcomingByYear = groupByYearKey(upcoming)
    const upcomingYears = [...upcomingByYear.keys()].sort((left, right) => left.localeCompare(right))
    for (const yearKey of upcomingYears) {
      // Con varios años, el año es el título del capítulo y el mes ya no lo repite
      // ("2026 / Diciembre", no "2026 / Diciembre de 2026").
      const headed = upcomingYears.length > 1
      chapters.push({
        id: `year-${yearKey}`,
        heading: headed ? yearKey : null,
        groups: monthGroups(
          upcomingByYear.get(yearKey),
          'upcoming',
          'asc',
          `up-${yearKey}`,
          headed,
        ),
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
  }, [locale, t, visibleRows])

  const selectedEvent = adminEvents.find((event) => event.id === selectedId) ?? rows[0] ?? null

  // Trae a la vista la fila recién creada una vez que la lista la pinta.
  const scrolledToCreatedRef = useRef(null)
  useEffect(() => {
    if (!justCreatedId || consoleOpen || quickCreateOpen) return undefined
    if (scrolledToCreatedRef.current === justCreatedId) return undefined
    const frame = requestAnimationFrame(() => {
      const row = [...document.querySelectorAll('.admin-event-row')].find(
        (node) => node.dataset.eventId === String(justCreatedId),
      )
      if (!row) return
      scrolledToCreatedRef.current = justCreatedId
      row.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [justCreatedId, consoleOpen, quickCreateOpen, visibleRows])

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

  // Un organizador no puede leer los listados globales de pagos: sus cobros salen del
  // endpoint de SU evento. El resto del staff sigue usando el snapshot global.
  const scopedPayments = useEventPayments(selectedEvent?.slug, {
    enabled: eventScoped && Boolean(selectedEvent),
  })
  // Idem para el Resumen: las entradas emitidas del evento abierto, no el snapshot global.
  const scopedTickets = useEventTickets(selectedEvent?.slug, {
    enabled: eventScoped && Boolean(selectedEvent),
  })
  // Staff general: `tickets` es la lista de todo el sistema. El Resumen sumaba
  // recaudación, check-ins y pendientes de todos los eventos en cada consola.
  const selectedSlug = selectedEvent?.slug ?? null
  const selectedEventTickets = useMemo(
    () => (selectedSlug ? tickets.filter((ticket) => ticket.eventSlug === selectedSlug) : []),
    [tickets, selectedSlug],
  )
  const paymentsSource = eventScoped
    ? {
        payments: scopedPayments.payments,
        athletes: scopedPayments.athletes,
        pendingTicketOrders: scopedPayments.pendingTicketOrders,
      }
    : { payments, athletes, pendingTicketOrders }
  const handleRefreshPayments = eventScoped ? scopedPayments.reload : onRefreshPayments

  const selectedPaymentTriage = useMemo(
    () =>
      buildEventPaymentTriage({
        event: selectedEvent,
        payments: paymentsSource.payments,
        athletes: paymentsSource.athletes,
        pendingTicketOrders: paymentsSource.pendingTicketOrders,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paymentsSource se arma en cada render
    [
      paymentsSource.athletes,
      paymentsSource.payments,
      paymentsSource.pendingTicketOrders,
      selectedEvent,
    ],
  )
  const selectedPaymentSummary = useMemo(
    () => formatEventPaymentTriageSummary(selectedPaymentTriage.counts, t),
    [selectedPaymentTriage.counts, t],
  )

  const selectedRegistrationCounts = useMemo(
    () =>
      buildEventRegistrationStatusCounts(
        registrations,
        selectedEvent,
        gatePendingIds ?? undefined,
      ),
    [gatePendingIds, registrations, selectedEvent],
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
    }
  }, [rows])

  function openCreateForm() {
    setMessage(null)
    setDuplicateSource(null)
    duplicateRunRef.current += 1
    setQuickCreateOpen(true)
    pushAdminEventCreateRoute()
  }

  /** Cierra el alta y suelta la URL `/nuevo`, si era la que estaba activa. */
  function closeQuickCreate() {
    setQuickCreateOpen(false)
    setDuplicateSource(null)
    duplicateRunRef.current += 1
    if (createRouteActive) clearAdminEventRoute()
  }

  /**
   * Duplicar: el alta arranca con título, sede, ciudad, cupo, acceso y medios
   * de cobro del original. Fechas, entradas y días no se copian (cambian en
   * cada meet). El
   * logo se descarga aparte y entra cuando llega: si falla, el alta sigue sin él.
   */
  function handleDuplicate(row) {
    if (!row) return
    openCreateForm()
    const run = duplicateRunRef.current
    setDuplicateSource({
      title: row.title,
      draft: {
        title: row.title ?? '',
        venue: row.venue ?? '',
        location: row.location ?? '',
        slots: row.slots ?? createAdminEventDraft().slots,
        requiresMembership: row.requiresMembership !== false,
        // Los medios de cobro son del organizador, no del meet: se copian. Las
        // fechas y las entradas no.
        paymentChannelOverrides: row.paymentChannelOverrides ?? null,
        bankTransferProfileId: row.bankTransferProfileId ?? null,
        mercadoPagoProfileId: row.mercadoPagoProfileId ?? null,
        // Plantilla + slots de landing (sin imagen hero: se sube de nuevo).
        landing: row.landing
          ? {
              ...row.landing,
              slots: { ...(row.landing.slots ?? {}), heroImagePath: '' },
            }
          : undefined,
        publicCopy: row.publicCopy ?? undefined,
        publicSurface: row.publicSurface ?? undefined,
      },
      logo: null,
    })
    if (!row.logoUrl) return
    fetch(row.logoUrl)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || !blob.type.startsWith('image/') || duplicateRunRef.current !== run) return
        const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'webp'
        const file = new File([blob], `logo.${extension}`, { type: blob.type })
        setDuplicateSource((current) => (current ? { ...current, logo: file } : current))
      })
      .catch(() => {})
  }

  /** Salida del alta rápida hacia el formulario largo, sin perder lo tipeado. */
  function openFullEditorFromQuickCreate(quickDraft) {
    closeQuickCreate()
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

    // El resumen no vive del draft: sin formulario abierto se muestra tal cual
    // (antes, desde Pagos o Zonas, "Resumen" armaba el editor y caía en Datos).
    // Con el formulario abierto sigue por el camino de abajo, que conserva los
    // cambios sin guardar para la vista previa.
    if (section === 'dashboard' && !(formOpen && draft.id)) {
      setConsoleSection('dashboard')
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

  function closeForm({ returnToDashboard = false } = {}) {
    const wasEditingExisting = Boolean(draft.id)
    const pendingSection = pendingConsoleSectionRef.current
    const pendingChapter = pendingConsoleChapterRef.current
    pendingConsoleSectionRef.current = null
    pendingConsoleChapterRef.current = null
    discardStateRef.current?.()
    if (pendingSection === CONSOLE_BACK) {
      closeEventConsole()
      return
    }
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
  async function handleQuickCreate(submittedDraft, { logo = null, another = false } = {}) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    // Se creó, pero con el cobro a medio configurar: no es un error, pero tiene
    // que verse (el evento queda oculto, así que nadie paga todavía).
    if (saved?.warnings?.length) {
      notifyError(
        t('admin.eventQuickCreate.createdWithWarning', { message: saved.warnings[0].message }),
      )
    }

    // El logo se sube apenas el evento existe. Si falla no se deshace el alta
    // (el evento está bien): se avisa y se puede subir desde la ficha.
    const loadedSlug = saved?.event?.slug ?? submittedDraft.slug
    if (logo && loadedSlug && onSetEventLogo) {
      try {
        const logoResult = await onSetEventLogo(loadedSlug, logo, { prepared: true })
        if (logoResult?.error) throw new Error(logoResult.error)
      } catch {
        notifyError(t('admin.eventQuickCreate.logoUploadFailed'))
      }
    }

    // El alta se queda abierta: con «Crear y cargar otro» para el siguiente, y
    // si no en su pantalla «Listo», que dice si ya se puede vender. De ahí se
    // sale con `finishQuickCreate`.
    void another
    return saved
  }

  /**
   * Salida de la pantalla «Listo» del alta: al evento recién creado (en el
   * Resumen, o en el capítulo de Venta que arregla lo que falta) o a la lista.
   */
  function finishQuickCreate(created, { open = false, section = 'dashboard', chapter = null } = {}) {
    setQuickCreateOpen(false)
    setDuplicateSource(null)
    if (createRouteActive) clearAdminEventRoute()
    const match = adminEvents.find((event) => event.id === created?.id) ?? null
    if (!open || !match) {
      showCreatedEvent(created)
      return
    }
    setSelectedId(match.id)
    setJustCreatedId(null)
    if (section === 'dashboard') {
      setConsoleSection('dashboard')
      setConsoleChapter(null)
      setConsoleOpen(true)
    } else {
      openEditForm(match, section, chapter)
    }
    if (match.slug) pushAdminEventRoute(match.slug)
  }

  /**
   * Terminado el alta se vuelve a la lista, que es donde se ve el evento junto
   * al resto del calendario. La consola ya no se abre sola: el trabajo que el
   * alta no pidió (entradas, grilla, zonas) se retoma tocando la fila. Un
   * filtro previo (año, estado, búsqueda, pestaña) no puede esconder justo el
   * evento que se acaba de crear.
   */
  function showCreatedEvent(created) {
    if (created?.id) {
      setSelectedId(created.id)
      setJustCreatedId(created.id)
      scrolledToCreatedRef.current = null
    }
    setQuery('')
    setStatus('all')
    setView(created?.status === 'finalizado' ? 'archive' : 'upcoming')
    // Todos los años, no el del evento nuevo: fijar su año escondía el resto del
    // calendario (crear un meet de otro año hacía "desaparecer" los demás).
    setYear('all')
    setMessage({ tone: 'success', text: t('admin.sections.events.created') })
  }

  async function handleSubmit(submittedDraft) {
    const saved = await onSaveEvent?.(submittedDraft)
    if (saved?.error) throw new Error(saved.error)
    const wasCreate = !submittedDraft.id
    closeForm()
    if (wasCreate) {
      showCreatedEvent(saved?.event)
      return saved
    }
    if (saved?.event?.id) setSelectedId(saved.event.id)
    // Guardado, pero con algo a medio configurar (p. ej. el cobro): el editor
    // se vuelve a armar al cerrar el formulario y su propio aviso se perdía.
    if (saved?.warnings?.length) {
      notifyWarning(
        t('admin.sections.events.updatedWithWarning', { message: saved.warnings[0].message }),
      )
    }
    setMessage({ tone: 'success', text: t('admin.sections.events.updated') })
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
    const synced = syncOpenDraft(pending, result?.event)
    setMessage({
      tone: 'success',
      text: t('admin.sections.events.updated'),
    })
    return synced
  }

  /**
   * Lleva al borrador abierto lo que un PATCH parcial acaba de guardar
   * (estado, publicación, acceso, ventana de inscripción). Sin esto, el
   * próximo "Guardar" del editor volvía a escribir los valores viejos: abrir
   * las inscripciones desde el control de venta y después guardar un título
   * las volvía a cerrar.
   */
  function syncOpenDraft(pending, event, slug = event?.slug) {
    const synced = {}
    if (pending.status !== undefined) synced.status = event?.status ?? pending.status
    if (pending.published !== undefined) synced.published = event?.published ?? pending.published
    if (pending.requiresMembership !== undefined) {
      synced.requiresMembership = event?.requiresMembership ?? pending.requiresMembership
    }
    // El borrador guarda las fechas como `datetime-local`, igual que al abrirlo.
    const eventDraft = event ? buildAdminEventDraft(event) : null
    for (const key of ['registrationOpensAt', 'registrationClosesAt']) {
      if (pending[key] !== undefined) synced[key] = eventDraft?.[key] ?? ''
    }
    if (Object.keys(synced).length === 0) return synced
    // Sobre el borrador de ahora, no el del render que arrancó el pedido: lo
    // que se editó mientras viajaba el PATCH (o antes de un "Deshacer" del
    // aviso) no se pisa.
    if (slug && draftRef.current?.slug !== slug) return synced
    setDraft((current) => ({ ...current, ...synced }))
    // La línea base avanza solo en lo que se acaba de guardar. Antes pasaba a
    // la firma del borrador entero: si el upsert siguiente fallaba, lo que
    // estaba editado en Datos quedaba como "Sin cambios pendientes", con
    // Guardar apagado y sin aviso al cerrar.
    setEditorBaselineSignature((current) => {
      if (current == null) return current
      try {
        return JSON.stringify({ ...JSON.parse(current), ...synced })
      } catch {
        return current
      }
    })
    return synced
  }

  /** Acciones rápidas y control de venta del workspace: PATCH + borrador abierto al día. */
  async function setEventStateFromWorkspace(slug, payload) {
    const result = await onSetEventState?.(slug, payload)
    // El borrador se lee al aplicar (no se captura acá): ver `syncOpenDraft`.
    if (!result?.error && formOpenRef.current) syncOpenDraft(payload, result?.event, slug)
    return result
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

  /**
   * Fija o suelta el evento principal desde la lista. Es el mismo guardado que
   * hace el editor con el interruptor "Evento destacado": el servidor baja el
   * flag de los demás, así que solo hay un principal por vez.
   */
  async function handleTogglePin(row) {
    if (!canEdit || !onSaveEvent || pinBusyId) return
    const next = !row.featured
    setPinBusyId(row.id)
    setMessage(null)
    try {
      const saved = await onSaveEvent({ ...buildAdminEventDraft(row), featured: next })
      if (saved?.error) throw new Error(saved.error)
      setMessage({
        tone: 'success',
        text: t(
          next ? 'admin.sections.events.pinDone' : 'admin.sections.events.unpinDone',
          { title: row.title },
        ),
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error?.message || t('admin.sections.events.pinError'),
      })
    } finally {
      setPinBusyId(null)
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
              platform={platformChannels.platform}
              selected={row.id === selectedEvent?.id}
              inNav={navEventSlugs.has(row.slug)}
              locale={locale}
              onSelect={handleSelectEvent}
              onTogglePin={handleTogglePin}
              onDuplicate={handleDuplicate}
              onToggleVisibility={onSetEventState ? handleToggleVisibility : undefined}
              pinBusy={pinBusyId === row.id}
              visibilityBusy={visibilityBusyId === row.id}
              justCreated={row.id === justCreatedId}
              canPin={canEdit && !eventScoped}
              selectMode={selectMode}
              checked={selectedIds.has(row.id)}
              onToggleSelect={toggleSelected}
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
        {canEdit && onSetEventState && adminEvents.length > 1 ? (
          <Button
            type="button"
            variant="outline"
            className="btn--small"
            aria-pressed={selectMode}
            onClick={() => (selectMode ? exitSelectMode() : enterSelectMode())}
          >
            {selectMode ? t('admin.sections.events.selectDone') : t('admin.sections.events.select')}
          </Button>
        ) : null}
        {canEdit && !eventScoped ? (
          <Button type="button" variant="gold" className="btn--small" onClick={openCreateForm}>
            <Plus size={15} aria-hidden />
            {t('admin.actions.newEvent')}
          </Button>
        ) : null}
      </div>
    ) : null

  // El aviso de ocultos vive en la línea del resumen: es un dato del calendario,
  // no una franja aparte que empuje la lista.
  const unpublishedNotice =
    canEdit && onSetEventState && !selectMode && unpublishedRows.length > 0 ? (
      <p className="admin-events__unpublished">
        <EyeOff size={14} aria-hidden />
        <span>
          {unpublishedRows.length === 1
            ? t('admin.sections.events.unpublishedOne')
            : t('admin.sections.events.unpublishedMany', { count: unpublishedRows.length })}
        </span>
        <button type="button" onClick={() => enterSelectMode(unpublishedRows.map((row) => row.id))}>
          {t('admin.sections.events.unpublishedReview')}
        </button>
      </p>
    ) : null

  const eventsKpis = (
    <>
      <div className="admin-events-summary">
        <div
          className="admin-events-kpis"
          role="group"
          aria-label={t('admin.sections.events.kpisAria')}
        >
          <div className="admin-events-kpi admin-events-kpi--primary">
            <strong className="admin-events-kpi__value">{kpiStats.upcomingCount}</strong>
            <span className="admin-events-kpi__label">
              {t('admin.sections.events.kpiUpcoming')}
            </span>
          </div>
          <div className="admin-events-kpi">
            <strong className="admin-events-kpi__value">{kpiStats.totalRegistered}</strong>
            <span className="admin-events-kpi__label">
              {t('admin.sections.events.kpiRegistered')}
            </span>
          </div>
          <div className="admin-events-kpi">
            <strong className="admin-events-kpi__value">{kpiStats.fillPercent}%</strong>
            <span className="admin-events-kpi__label">{t('admin.sections.events.kpiFill')}</span>
          </div>
        </div>
        {unpublishedNotice}
      </div>
      <section
        className="admin-events-navigation-preview"
        aria-labelledby="admin-events-navigation-preview-title"
      >
        <div className="admin-events-navigation-preview__heading">
          <div>
            <span className="admin-events-navigation-preview__eyebrow">
              {t('admin.sections.events.navigationPreviewEyebrow')}
            </span>
            <h2 id="admin-events-navigation-preview-title">
              {t('admin.sections.events.navigationPreviewTitle')}
            </h2>
          </div>
          <p>{t('admin.sections.events.navigationPreviewHint')}</p>
        </div>
        {navigationEvents.length > 0 ? (
          <ol className="admin-events-navigation-preview__list">
            {navigationEvents.map((event, index) => (
              <li key={event.id ?? event.slug}>
                <span className="admin-events-navigation-preview__position" aria-hidden="true">
                  {index + 1}
                </span>
                <button type="button" onClick={() => handleSelectEvent(event.id)}>
                  <span>
                    <strong>{event.title}</strong>
                    <small>
                      {index === 0
                        ? t('admin.sections.events.navigationPrimary')
                        : t('admin.sections.events.navigationNext')}
                      {event.dateISO ? ` - ${formatDayMonth(event.dateISO, locale)}` : ''}
                    </small>
                  </span>
                  {index === 0 ? <Star size={15} aria-hidden /> : <CalendarDays size={15} aria-hidden />}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="admin-events-navigation-preview__empty">
            {t('admin.sections.events.navigationPreviewEmpty')}
          </p>
        )}
      </section>
      <div
        className="admin-events-views"
        role="tablist"
        aria-label={t('admin.sections.events.viewsAria')}
      >
        {[
          ['upcoming', t('admin.sections.events.viewUpcoming')],
          ['archive', t('admin.sections.events.viewArchive')],
          ['all', t('admin.sections.events.viewAll')],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeView === id}
            className={`admin-events-views__tab${activeView === id ? ' is-active' : ''}`}
            onClick={() => setView(id)}
          >
            {label}
            <span>{viewCounts[id]}</span>
          </button>
        ))}
      </div>
    </>
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
          canManageUsers={teamAccess}
          editor={
            formOpen && draft.id && EDITOR_SECTIONS.has(consoleSection) ? (
              <AdminEventEditor
                key={draft.id}
                landingSourceEvents={adminEvents}
                accordion
                embedded
                eventScoped={eventScoped}
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
                onKeepEditing={() => {
                  // Sin esto, el destino que pidió la salida (Volver, otra
                  // pestaña) quedaba vivo y el próximo guardado lo ejecutaba.
                  pendingConsoleSectionRef.current = null
                  pendingConsoleChapterRef.current = null
                }}
                onSaved={() => notifySuccess(t('admin.sections.events.updated'))}
              />
            ) : null
          }
          event={selectedEvent}
          inNav={navEventSlugs.has(selectedEvent.slug)}
          onBack={backFromEventConsole}
          onDelete={openDeleteDialog}
          onManageCheckin={onManageCheckin}
          onManageRegistrations={onManageRegistrations}
          onSelectChapter={selectConsoleChapter}
          onSelectSection={selectConsoleSection}
          onSetEventLogo={onSetEventLogo}
          onSetEventState={onSetEventState ? setEventStateFromWorkspace : undefined}
          onSetTicketAccessOverride={onSetTicketAccessOverride}
          onStatePendingChange={(payload) => {
            const next = payload && typeof payload === 'object' ? payload : {}
            statePendingRef.current = next
            setStateDirty(Object.keys(next).length > 0)
          }}
          onRegisterStateDiscard={(fn) => {
            discardStateRef.current = fn
          }}
          onTogglePin={eventScoped ? undefined : handleTogglePin}
          pinBusy={pinBusyId === selectedEvent.id}
          openChapter={consoleChapter}
          paymentSummary={selectedPaymentSummary}
          paymentsAttention={selectedPaymentTriage?.needsAttention?.length ?? null}
          paymentsSection={
            canValidatePayments || onManagePayments || onOpenFinanceForEvent ? (
              <AdminEventPaymentsTriage
                athletes={paymentsSource.athletes}
                canEdit={canValidatePayments}
                event={selectedEvent}
                onApprovePayment={onApprovePayment}
                onApproveTicketOrder={onApproveTicketOrder}
                onOpenFinance={
                  onOpenFinanceForEvent ? () => onOpenFinanceForEvent(selectedEvent) : undefined
                }
                onRefresh={handleRefreshPayments}
                onRejectPayment={onRejectPayment}
                onRejectTicketOrder={onRejectTicketOrder}
                payments={paymentsSource.payments}
                pendingTicketOrders={paymentsSource.pendingTicketOrders}
              />
            ) : null
          }
          registrationCounts={selectedRegistrationCounts}
          registrationsAttention={selectedRegistrationCounts.pendiente_pago || null}
          registrationsSection={
            showRegistrations ? (
              <AdminEventRegistrationsPanel
                athletes={athletes}
                // El envío masivo es de staff general: la ruta no admite
                // cuentas por evento.
                canSendCredentials={canSetRegistrationStatus && !eventScoped}
                canSetStatus={canSetRegistrationStatus}
                event={selectedEvent}
                gatePendingIds={gatePendingIds}
                onOpenFullList={
                  onManageRegistrations ? () => onManageRegistrations(selectedEvent) : undefined
                }
                onRefreshRegistrations={onRefreshAthleteData}
                onSetRegistrationStatus={onSetRegistrationStatus}
                payments={paymentsSource.payments}
                registrations={registrations}
              />
            ) : null
          }
          previewDraft={
            formOpen && draft.id && draft.id === selectedEvent.id ? draft : null
          }
          securitySection={
            teamAccess || canManageUsers ? (
              <div className="admin-event-workspace__security-stack">
                {canManageUsers && onCreateUser ? (
                  <AdminEventOrganizersSection
                    canManage={canManageUsers}
                    eventId={selectedEvent.id}
                    eventTitle={selectedEvent.title}
                    onCreateOrganizer={onCreateUser}
                    onSetEventAccess={onSetEventAccess}
                    users={users}
                  />
                ) : null}
                {teamAccess ? (
                  <>
                    <AdminEventZonesSection
                      canManageUsers={teamAccess}
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
                      canManageUsers={teamAccess}
                      eventId={selectedEvent.id}
                      eventSlug={selectedEvent.slug}
                      eventEndsAt={selectedEvent.endsAt}
                      onCreateSecurityUser={onCreateSecurityUser}
                      onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
                      onCreateSecurityAccessLink={onCreateSecurityAccessLink}
                      onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
                      onListSecurityUsers={onListSecurityUsers}
                      onAssignMember={onAssignSecurityZone}
                      onListZones={onListSecurityZones}
                      onTeamChange={() => setZonesReloadToken((current) => current + 1)}
                      onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
                      reloadToken={zonesReloadToken}
                    />
                  </>
                ) : null}
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
          tickets={eventScoped ? scopedTickets : selectedEventTickets}
        />
        {deleteDialog}
      </>
    )
  }

  /**
   * El alta reemplaza al listado, como el workspace: es una página con su URL,
   * no un panel que tape lo que está atrás.
   */
  if (quickCreateOpen) {
    return (
      <AdminEventQuickCreate
        key={duplicateSource ? 'duplicate' : 'create'}
        canEdit={canEdit}
        duplicateOf={duplicateSource?.title ?? null}
        initialDraft={duplicateSource?.draft ?? null}
        initialLogo={duplicateSource?.logo ?? null}
        onCancel={closeQuickCreate}
        onOpenFullEditor={openFullEditorFromQuickCreate}
        onSubmit={handleQuickCreate}
        onDone={finishQuickCreate}
        onSetEventState={onSetEventState}
      />
    )
  }

  return (
    <AdminListSection
      eyebrow={null}
      actions={headerActions}
      filteredCount={visibleRows.length}
      filterLayout="popover"
      pinned={false}
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
                defaultValue: 'all',
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

      {hiddenByFilters > 0 ? (
        <p className="admin-events__filter-note" role="status">
          <span>
            {t('admin.sections.events.filterNote', {
              shown: rows.length,
              total: adminEvents.length,
              filters: activeFilterLabels.join(' · '),
            })}
          </span>
          <button type="button" onClick={showAllEvents}>
            {t('admin.sections.events.filterNoteClear')}
          </button>
        </p>
      ) : null}

        {eventScoped ? null : (
          <AdminSiteTeaserControl
            busy={teaserBusy}
            canEdit={canEdit}
            enabled={teaserEnabled}
            loadFailed={teaserLoadFailed}
            onRetry={loadSiteTeaser}
            onToggle={handleToggleTeaser}
          />
        )}

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
                {canEdit && !eventScoped && adminEvents.length === 0 ? (
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
                      setYear('all')
                    }}
                  >
                    {t('admin.sections.events.clearFilters')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul
                className={`admin-event-list${selectMode ? ' admin-event-list--selecting' : ''}`}
                aria-label={t('admin.columns.event')}
              >
                <li className="admin-event-list__head" aria-hidden="true">
                  <span className="admin-event-list__head-cols">
                    <span />
                    <span>{t('admin.sections.events.cols.event')}</span>
                    <span>{t('admin.sections.events.cols.date')}</span>
                    <span>{t('admin.sections.events.cols.venue')}</span>
                    <span>{t('admin.sections.events.cols.sale')}</span>
                    <span className="is-num">{t('admin.sections.events.cols.registered')}</span>
                  </span>
                  <span className="admin-event-list__head-actions">
                    {t('admin.sections.events.cols.visibility')}
                  </span>
                </li>
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

            {/* Sin nada elegido no hay qué aplicar: la barra aparece con la primera
                selección y se cierra con la X. Salir sin elegir es «Listo». */}
            {selectMode && selectedRows.length > 0 ? (
              <div
                className="admin-events-bulkbar"
                role="group"
                aria-label={t('admin.sections.events.bulkBarAria')}
              >
                <button
                  type="button"
                  className="admin-events-bulkbar__close"
                  aria-label={t('admin.sections.events.bulkClose')}
                  title={t('admin.sections.events.bulkClose')}
                  disabled={bulkBusy}
                  onClick={exitSelectMode}
                >
                  <X size={16} aria-hidden />
                </button>
                <p className="admin-events-bulkbar__count" aria-live="polite">
                  {selectedRows.length === 1
                    ? t('admin.sections.events.selectedOne')
                    : t('admin.sections.events.selectedCount', { count: selectedRows.length })}
                  <button
                    type="button"
                    className="admin-events-bulkbar__link"
                    disabled={bulkBusy || unpublishedRows.length === 0}
                    onClick={() => setSelectedIds(new Set(unpublishedRows.map((row) => row.id)))}
                  >
                    {t('admin.sections.events.selectHidden')}
                  </button>
                </p>
                <div className="admin-events-bulkbar__actions">
                  <Button
                    type="button"
                    variant="outline"
                    className="btn--small"
                    disabled={bulkBusy || selectedRows.length === 0}
                    onClick={() => void applyVisibility(false)}
                  >
                    <EyeOff size={15} aria-hidden />
                    {t('admin.sections.events.hideSelected', { count: selectedRows.length })}
                  </Button>
                  <Button
                    type="button"
                    variant="gold"
                    className="btn--small"
                    disabled={bulkBusy || selectedRows.length === 0}
                    onClick={() => void applyVisibility(true)}
                  >
                    <Eye size={15} aria-hidden />
                    {t('admin.sections.events.publishSelected', { count: selectedRows.length })}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

      {/* Alta completa (sin id): sigue en modal propio; no hay consola de evento. */}
      {formOpen && !draft.id ? (
        <AdminEventEditor
          canEdit={canEdit}
          landingSourceEvents={adminEvents}
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
