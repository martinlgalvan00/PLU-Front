import { Fragment, useEffect, useMemo, useRef } from 'react'
import {
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Construction,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  LayoutGrid,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Star,
  Ticket,
  Trash2,
} from 'lucide-react'
import AdminCopyLinkMenu from './AdminCopyLinkMenu.jsx'
import AdminEventLogoControl from './AdminEventLogoControl.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import { AdminEventLivePreview } from './AdminEventEditor.jsx'
import AdminEventDashboard from './AdminEventDashboard.jsx'
import AdminEventQuickActions from './AdminEventQuickActions.jsx'
import AdminEventSaleControl from './AdminEventSaleControl.jsx'
import AdminEventStateControl from './AdminEventStateControl.jsx'
import AdminEventTicketAddonReport from './AdminEventTicketAddonReport.jsx'
import AdminEventTicketsSoldSection from './AdminEventTicketsSoldSection.jsx'
import '../../styles/pages/admin-event-workspace.css'
import '../../styles/pages/admin-event-dashboard.css'
import '../../styles/pages/admin-event-modules.css'
// "Abrir control de puerta" usa la pastilla de la sección de seguridad: sin
// importarla acá dependía de que otra pantalla la hubiera cargado antes.
import '../../styles/pages/admin-event-security.css'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatDayMonth, money } from '../../lib/format.js'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import { openEventChannelsFor } from '../../lib/eventPaymentChannels.js'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'
import { eventSiteState } from '../../lib/eventPublicSurface.js'
import useEventRegistrationSale from '../../hooks/useEventRegistrationSale.js'
import { isStoredEventModuleOn, resolveEventModules } from '../../../shared/eventModules.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { useActiveIndicator, usePanelEnter } from '../../motion/useActiveIndicator.ts'

/** Secciones que agrupa la pestaña "Evento" (como capítulos). */
const EVENT_SECTIONS = ['basics', 'structure']
/** Lo que se usa al operar el evento: va aparte, debajo de las pestañas de armado. */
const OPERATION_SECTIONS = ['registrations', 'payments', 'security']

const SITE_STATE_LABEL = {
  live: 'admin.eventConsole.siteVisible',
  construction: 'admin.eventConsole.siteConstruction',
  hidden: 'admin.eventConsole.siteHidden',
}
const SITE_STATE_NOTE = {
  live: 'admin.eventState.publishedNote',
  construction: 'admin.eventConsole.siteConstructionNote',
  hidden: 'admin.eventState.hiddenNote',
}

/** Venue y sede pueden ser el mismo dato escrito distinto (o exactamente
 * igual): mostrarlos como una sola línea evita la redundancia en la ficha. */
export function formatEventVenueLine(venue, location) {
  const parts = [venue, location].map((value) => String(value ?? '').trim()).filter(Boolean)
  if (
    parts.length === 2 &&
    parts[0].localeCompare(parts[1], undefined, { sensitivity: 'accent' }) === 0
  ) {
    return parts[0]
  }
  return parts.join(', ')
}

export function buildEventLinks(row, t) {
  if (!row?.slug) return []
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return [
    {
      id: 'public',
      label: t('admin.copyLinkMenu.public'),
      url: `${origin}${buildEventPagePath(row.slug)}`,
    },
    {
      id: 'tickets',
      label: t('admin.copyLinkMenu.tickets'),
      url: `${origin}${TICKETS_PATH}?evento=${encodeURIComponent(row.slug)}`,
    },
    {
      id: 'security',
      label: t('admin.copyLinkMenu.security'),
      url: `${origin}${buildSecurityGatePath(row.slug)}`,
    },
  ]
}

/**
 * AdminEventWorkspace — PLU ARG
 *
 * El evento como PÁGINA, con URL propia (`/admin/eventos/:slug`) y seis
 * superficies planas: Datos, Estructura, Entradas, Zonas y seguridad, Pagos y
 * Vista pública. Reemplaza la consola-modal, donde todo vivía en acordeones
 * —- nada se veía sin desplegarlo -— y donde zonas y pagos reemplazaban la
 * lista entera con un drill de ida y vuelta.
 *
 * Tres decisiones que sostienen el diseño:
 *
 * 1. El encabezado no cambia entre pestañas. Título, estado, fecha, sede y
 *    link público son la respuesta permanente a "qué evento estoy tocando y en
 *    qué estado real está", que en el modal se perdía al entrar a una sección.
 * 2. Las pestañas SELECCIONAN, no alternan. El modal usaba `onToggleSection`
 *    (volver a tocar cerraba el fold); acá tocar la pestaña activa es un
 *    no-op, y la sección de arranque llega abierta desde el padre. Un intento
 *    anterior de este mismo cambio dejaba `activeTab` en 'basics' con el
 *    handler retornando temprano en la pestaña activa: el editor de Datos no
 *    se podía abrir nunca.
 * 3. Check-in sigue como acceso desde Resumen/Seguridad (otra sección del panel).
 *    Inscripciones sí tienen pestaña propia cuando hay `registrationsSection`.
 *
 * Ya no es un diálogo: sin `role="dialog"`, sin trap de foco, sin bloqueo del
 * scroll del body y sin cerrar con Escape (perder cambios sin guardar por
 * apretar Escape en una página es peor que no tener el atajo). Volver cierra
 * el evento y vuelve al listado; el menú del panel también puede salir.
 */
export default function AdminEventWorkspace({
  activeSection = 'basics',
  canDelete = false,
  canEdit = false,
  canManageUsers = false,
  editor = null,
  event,
  inNav = false,
  onBack,
  onDelete,
  onManageCheckin,
  onManageRegistrations,
  onSelectChapter,
  onSelectSection,
  onSetEventLogo,
  onSetEventState,
  onSetTicketAccessOverride,
  onStatePendingChange,
  onRegisterStateDiscard,
  onTogglePin,
  pinBusy = false,
  openChapter = null,
  paymentSummary = '',
  paymentsAttention = null,
  paymentsSection = null,
  previewDraft = null,
  registrationCounts = null,
  registrationsAttention = null,
  registrationsSection = null,
  securitySection = null,
  structureEditor = null,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const stateDirtyRef = useRef(false)
  const sidebarRef = useRef(null)
  const scrollHostRef = useRef(null)
  const navRef = useRef(null)
  const chaptersRef = useRef(null)
  const bodyRef = useRef(null)
  const { reducedMotion, tier } = useMotionConfig()
  // Movimiento de navegación: el fondo de la pestaña viaja hasta la nueva y el
  // panel entra con 6px. Antes que el `return` temprano (son hooks).
  const panelKey = `${activeSection}:${activeSection === 'sales' ? (openChapter ?? '') : ''}`
  useActiveIndicator(navRef, activeSection)
  useActiveIndicator(chaptersRef, panelKey)
  usePanelEnter(bodyRef, panelKey, { disabled: reducedMotion || tier === 'low' })

  useEffect(() => {
    scrollHostRef.current = sidebarRef.current?.closest('.admin-shell__content') ?? null
    // La lista scrollea el content del shell: la ficha arranca siempre arriba.
    scrollHostRef.current?.scrollTo?.({ top: 0 })
  }, [])

  // En mobile las pestañas del evento son sticky: el alto medido evita que el
  // panel se meta debajo. En desktop la columna lateral ya llena el content.
  useEffect(() => {
    const sidebarEl = sidebarRef.current
    if (!sidebarEl || typeof ResizeObserver === 'undefined') return undefined
    const workspaceEl = sidebarEl.closest('.admin-event-workspace')
    function applyHeight() {
      workspaceEl?.style.setProperty(
        '--admin-event-sidebar-h',
        `${sidebarEl.offsetHeight}px`,
      )
    }
    const observer = new ResizeObserver(applyHeight)
    observer.observe(sidebarEl)
    applyHeight()
    return () => observer.disconnect()
  }, [])

  const summarySource = previewDraft ?? event
  // Antes del `return` temprano: un hook no puede quedar condicionado.
  const sale = useEventRegistrationSale(event)
  const ticketsEnabled = event?.pricing?.ticketsEnabled === true
  // Módulo «Puerta» apagado: el evento no usa check-in ni zonas, y el panel no
  // los muestra. Lee lo guardado, no el borrador.
  const doorOn = isStoredEventModuleOn(event, 'door')

  const activeTicketTypeCount = useMemo(() => {
    const types = summarySource?.ticketTypes ?? event?.ticketTypes
    return types?.filter((ticketType) => ticketType.active !== false).length ?? 0
  }, [event?.ticketTypes, summarySource?.ticketTypes])

  const tabs = useMemo(() => {
    const list = []
    list.push({ id: 'dashboard', label: t('admin.eventConsole.dashboard'), icon: LayoutGrid })
    if (canEdit) {
      list.push({ id: 'basics', label: t('admin.eventConsole.editBasics'), icon: FileText })
    }
    list.push({
      id: 'structure',
      label: t('admin.eventConsole.structure'),
      icon: CalendarRange,
      count: event?.eventDays?.length ?? 0,
    })
    if (canEdit) {
      list.push({
        id: 'sales',
        // Esta pestaña agrupa los cuatro capítulos (Cupo, Precios, Entradas,
        // Cobro) en un submenú del rail: llamarla "Entradas" -- como el
        // capítulo de tickets ahí adentro -- hacía que el mismo nombre
        // significara dos cosas distintas según el nivel, y era la confusión
        // real que reportaban los operadores entre "entrada" (ticket) e
        // "inscripción" (cupo).
        label: t('admin.eventConsole.editSales'),
        icon: Ticket,
        // Sin ningún tipo de entrada activo no se venden entradas; pero solo
        // es un error si el evento vende entradas. Antes se marcaba en rojo
        // también en meets sin público, donde no tiene nada que ver con la
        // venta de inscripciones.
        hasError: ticketsEnabled && activeTicketTypeCount === 0,
        hasSubnav: true,
      })
    }
    if (registrationsSection) {
      list.push({
        id: 'registrations',
        label: t('admin.eventConsole.registrations'),
        icon: ClipboardList,
        ...(typeof registrationsAttention === 'number' && registrationsAttention > 0
          ? { count: registrationsAttention }
          : {}),
      })
    }
    if (canManageUsers && securitySection && doorOn) {
      list.push({ id: 'security', label: t('admin.eventConsole.zones'), icon: ShieldCheck })
    }
    if (paymentsSection) {
      list.push({
        id: 'payments',
        label: t('admin.eventConsole.payments'),
        icon: CreditCard,
        ...(typeof paymentsAttention === 'number' && paymentsAttention > 0
          ? { count: paymentsAttention }
          : {}),
      })
    }
    if (canEdit) {
      list.push({ id: 'visibility', label: t('admin.eventConsole.visibilityLabel'), icon: Globe })
    }
    return list
  }, [
    activeTicketTypeCount,
    canEdit,
    canManageUsers,
    doorOn,
    event?.eventDays?.length,
    paymentsAttention,
    paymentsSection,
    registrationsAttention,
    registrationsSection,
    securitySection,
    t,
    ticketsEnabled,
  ])

  if (!event) return null

  const activeTab = tabs.some((tab) => tab.id === activeSection)
    ? activeSection
    : (tabs[0]?.id ?? null)

  /**
   * Navegación: cuatro pestañas para armar el evento (Resumen, Evento, Venta,
   * Página) y, aparte, lo que se usa al operarlo (Inscripciones, Pagos,
   * Zonas). Las secciones siguen siendo las mismas: "Evento" agrupa Datos y
   * Estructura como capítulos, igual que Venta agrupa los suyos. Antes eran
   * ocho pestañas en una sola lista, mezclando armar con operar.
   */
  const sectionTab = Object.fromEntries(tabs.map((tab) => [tab.id, tab]))
  const eventSections = EVENT_SECTIONS.filter((id) => sectionTab[id])
  const buildNav = [
    sectionTab.dashboard,
    eventSections.length
      ? {
          id: 'event',
          label: t('admin.eventConsole.navEvent'),
          icon: FileText,
          sections: eventSections,
        }
      : null,
    sectionTab.sales ? { ...sectionTab.sales, label: t('admin.eventConsole.navSales') } : null,
    sectionTab.visibility
      ? { ...sectionTab.visibility, label: t('admin.eventConsole.navPage') }
      : null,
  ].filter(Boolean)
  const operationNav = OPERATION_SECTIONS.map((id) => sectionTab[id]).filter(Boolean)
  const navSections = (item) => item.sections ?? [item.id]
  const activeNavId =
    [...buildNav, ...operationNav].find((item) => navSections(item).includes(activeTab))?.id ??
    activeTab
  const showEventChapters = eventSections.length > 1 && eventSections.includes(activeTab)
  const eventChapters = eventSections.map((id) => ({ id, label: sectionTab[id].label, count: sectionTab[id].count }))

  const venueLine = formatEventVenueLine(event.venue, event.location)
  const dateLabel = event.dateISO ? formatDayMonth(event.dateISO, locale) : (event.date ?? '')
  const sidebarMeta = [dateLabel, venueLine].filter(Boolean).join(' · ')

  const siteState = eventSiteState(event)
  // "Arreglar" del control de venta: lleva al capítulo de Ventas que corresponde.
  const fixSale = onSelectChapter ? (chapter) => onSelectChapter(event, 'sales', chapter) : undefined
  // Capítulo de Venta abierto; sin elegir, el acordeón arranca en Módulos.
  const saleChapter = openChapter ?? 'modules'
  const registered = Number(event.registered) || 0
  const slots = Number(event.slots) || 0

  function handleBack() {
    // Con el editor montado, el cambio de estado pendiente es parte de sus
    // cambios (`extraDirty`) y la confirmación la muestra él: no preguntar dos veces.
    if (
      !editor &&
      stateDirtyRef.current &&
      !window.confirm(t('admin.eventState.discardUnsavedConfirm'))
    ) {
      return
    }
    onBack?.()
  }

  /**
   * "Cambiar fecha": abre Datos y enfoca el campo de inicio. La edición real
   * (con sus validaciones de ventana y cupo) sigue viviendo en el formulario.
   */
  function handleEditDate() {
    if (activeTab !== 'basics') onSelectSection?.(event, 'basics')
    const focusStart = (attempts = 0) => {
      const field = document.querySelector('[data-field="startsAt"]')
      if (field) {
        field.scrollIntoView({ block: 'center' })
        field.focus()
        return
      }
      if (attempts < 12) window.setTimeout(() => focusStart(attempts + 1), 80)
    }
    focusStart()
  }

  function handleSelectTab(item) {
    const sections = navSections(item)
    if (sections.includes(activeTab)) return
    onSelectSection?.(event, sections[0])
    // Cada pestaña arranca arriba: sin esto, cambiar de sección mantenía el
    // scroll donde había quedado la anterior, que casi nunca tiene sentido
    // para contenido no relacionado.
    scrollHostRef.current?.scrollTo?.({ top: 0 })
  }

  /**
   * Capítulos de Ventas: tira compacta en el chrome del panel. El submenú
   * del rail queda en el DOM (tests y aria) pero no se dibuja. El editor
   * en acordeón no renderiza su propia navegación.
   */
  const savedModules = resolveEventModules(summarySource)
  const salesChapters = [
    {
      id: 'modules',
      label: t('admin.eventEditor.salesChapterModules'),
      value: t('admin.eventEditor.salesChapterModulesValue', {
        count: savedModules.filter((module) => module.on).length,
        total: savedModules.length,
      }),
    },
    {
      id: 'cupo',
      label: t('admin.eventEditor.salesChapterCapacity'),
      value:
        slots > 0
          ? t('admin.eventEditor.salesChapterCapacityValue', { count: registered, slots })
          : null,
    },
    {
      id: 'prices',
      label: t('admin.eventEditor.salesChapterPrices'),
      value: money(summarySource?.pricing?.registration ?? event.pricing?.registration, locale),
    },
    {
      id: 'tickets',
      label: t('admin.eventEditor.salesChapterTickets'),
      value: t('admin.eventEditor.salesChapterTicketsCount', { count: activeTicketTypeCount }),
      hasError: ticketsEnabled && activeTicketTypeCount === 0,
    },
    {
      id: 'payment',
      label: t('admin.eventEditor.salesChapterPayment'),
      value: t('admin.eventEditor.salesChapterPaymentMeta', {
        count: openEventChannelsFor(
          summarySource?.paymentChannelOverrides ?? event.paymentChannelOverrides ?? null,
          'ticket',
        ).length,
      }),
    },
    {
      id: 'sold',
      label: t('admin.eventEditor.salesChapterSold'),
    },
  ]

  function renderChapters(chapters, { selectedId, onSelect, ariaLabel }) {
    return (
      <div
        ref={chaptersRef}
        className="admin-event-workspace__chapters"
        role="tablist"
        aria-label={ariaLabel}
      >
        <span className="admin-event-workspace__chapters-indicator" aria-hidden />
        {chapters.map((chapter) => {
          const selected = selectedId === chapter.id
          return (
            <button
              key={chapter.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`admin-event-workspace__chapter${selected ? ' is-active' : ''}${
                chapter.hasError ? ' has-error' : ''
              }`}
              onClick={() => onSelect(chapter.id)}
            >
              <strong>{chapter.label}</strong>
              {chapter.value ? <em>{chapter.value}</em> : null}
              {!chapter.value && typeof chapter.count === 'number' && chapter.count > 0 ? (
                <em>{chapter.count}</em>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  function renderGoto({ icon: Icon, label, value, onClick }) {
    return (
      <button type="button" className="admin-event-workspace__goto" onClick={onClick}>
        <Icon size={17} aria-hidden />
        <span className="admin-event-workspace__goto-copy">
          <span className="admin-event-workspace__goto-title">{label}</span>
          <span className="admin-event-workspace__goto-value">{value}</span>
        </span>
        <ChevronRight size={15} aria-hidden className="admin-event-workspace__goto-chevron" />
      </button>
    )
  }

  function renderNavItem(tab) {
    const selected = activeNavId === tab.id
    const expanded = Boolean(tab.hasSubnav) && selected
    const tabButton = (
      <button
        type="button"
        role="tab"
        id={`admin-event-tab-${tab.id}`}
        aria-selected={selected}
        aria-expanded={tab.hasSubnav ? expanded : undefined}
        aria-controls={
          tab.hasSubnav ? 'admin-event-tabpanel admin-event-sales-subnav' : 'admin-event-tabpanel'
        }
        tabIndex={selected ? 0 : -1}
        className={`admin-event-workspace__nav-item${selected ? ' is-active' : ''}${
          tab.hasError ? ' has-error' : ''
        }${expanded ? ' is-expanded' : ''}`}
        onClick={() => handleSelectTab(tab)}
      >
        {tab.icon ? (
          <tab.icon size={15} aria-hidden className="admin-event-workspace__nav-icon" />
        ) : null}
        <span className="admin-event-workspace__nav-item-label">{tab.label}</span>
        {typeof tab.count === 'number' && tab.count > 0 ? (
          <span className="admin-event-workspace__nav-count">{tab.count}</span>
        ) : null}
        {tab.hasSubnav ? (
          <ChevronDown size={14} aria-hidden className="admin-event-workspace__nav-chevron" />
        ) : null}
      </button>
    )

    if (!tab.hasSubnav) return <Fragment key={tab.id}>{tabButton}</Fragment>

    const selectedChapter = openChapter ?? 'modules'
    return (
      <div
        key={tab.id}
        className={`admin-event-workspace__nav-group${expanded ? ' is-open' : ''}`}
      >
        {tabButton}
        <div
          id="admin-event-sales-subnav"
          className="admin-event-workspace__nav-sub"
          role="group"
          aria-label={t('admin.eventEditor.salesChapterNavAria')}
          hidden={!expanded}
        >
          {salesChapters.map((chapter) => {
            const chapterSelected = selectedChapter === chapter.id
            return (
              <button
                key={chapter.id}
                type="button"
                className={`admin-event-workspace__nav-subitem${
                  chapterSelected ? ' is-active' : ''
                }${chapter.hasError ? ' has-error' : ''}`}
                aria-current={chapterSelected ? 'true' : undefined}
                onClick={() => onSelectChapter?.(event, 'sales', chapter.id)}
              >
                {chapter.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const gotoCard =
    registrationsSection ||
    onManageRegistrations ||
    paymentsSection ||
    (onManageCheckin && doorOn) ? (
      <section className="admin-event-workspace__card">
        <header className="admin-event-workspace__card-head">
          <h2 className="admin-event-workspace__card-title">
            {t('admin.eventConsole.operationLabel')}
          </h2>
        </header>
        <div className="admin-event-workspace__gotos">
          {registrationsSection
            ? renderGoto({
                icon: ClipboardList,
                label: t('admin.eventConsole.registrations'),
                value: t('admin.eventConsole.registrationsValue', { count: registered, slots }),
                onClick: () => onSelectSection?.(event, 'registrations'),
              })
            : onManageRegistrations
              ? renderGoto({
                  icon: ClipboardList,
                  label: t('admin.eventConsole.registrations'),
                  value: t('admin.eventConsole.registrationsValue', { count: registered, slots }),
                  onClick: () => onManageRegistrations?.(event),
                })
              : null}
          {paymentsSection
            ? renderGoto({
                icon: CreditCard,
                label: t('admin.eventConsole.payments'),
                value: paymentSummary || t('admin.eventConsole.paymentsClear'),
                onClick: () => onSelectSection?.(event, 'payments'),
              })
            : null}
          {onManageCheckin && doorOn
            ? renderGoto({
                icon: ScanLine,
                label: t('admin.eventConsole.checkin'),
                value: t('admin.eventConsole.checkinValue'),
                onClick: () => onManageCheckin?.(event),
              })
            : null}
        </div>
      </section>
    ) : null

  // Qué partes del evento están prendidas, de un vistazo. Refleja el borrador
  // mientras se edita (igual que la vista previa) y lleva al tablero de Venta.
  const modulesCard = canEdit ? (
    <section className="admin-event-workspace__card admin-event-workspace__modules">
      <header className="admin-event-workspace__card-head">
        <h2 className="admin-event-workspace__card-title">
          {t('admin.eventEditor.eventModules.title')}
        </h2>
        <span className="admin-event-workspace__modules-count">
          {t('admin.eventEditor.salesChapterModulesValue', {
            count: savedModules.filter((module) => module.on).length,
            total: savedModules.length,
          })}
        </span>
      </header>
      <ul className="admin-event-workspace__modules-list">
        {savedModules.map((module) => {
          const state = module.active ? 'on' : module.on ? 'idle' : 'off'
          return (
            <li key={module.key} className="admin-event-workspace__module" data-state={state}>
              <span className="admin-event-workspace__module-dot" aria-hidden />
              <span className="admin-event-workspace__module-name">
                {t(`admin.eventEditor.eventModules.name.${module.key}`)}
              </span>
              <span className="admin-event-workspace__module-state">
                {t(
                  `admin.eventEditor.eventModules.${
                    state === 'on' ? 'stateOnLabel' : state === 'idle' ? 'stateIdleLabel' : 'stateOffLabel'
                  }`,
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {onSelectChapter ? (
        <button
          type="button"
          className="admin-event-workspace__modules-link"
          onClick={() => onSelectChapter(event, 'sales', 'modules')}
        >
          {t('admin.eventEditor.eventModules.configure')}
          <ChevronRight size={14} aria-hidden />
        </button>
      ) : null}
    </section>
  ) : null

  function renderTabPanel() {
    if (activeTab === 'structure') {
      return (
        <div className="admin-event-workspace__wide admin-event-workspace__structure">
          {structureEditor}
        </div>
      )
    }
    if (activeTab === 'security') {
      const gatePath = event.slug ? buildSecurityGatePath(event.slug) : ''
      const gateUrl =
        gatePath && typeof window !== 'undefined' ? `${window.location.origin}${gatePath}` : gatePath
      return (
        <div className="admin-event-workspace__main-col admin-event-workspace__security">
          {/* Una sola franja arriba: la regla del puesto (qué filtra y qué no) y
              las dos puertas al día del evento. Antes eran un aviso con
              borde, una "Consola de ingreso" a mitad de página y una tarjeta
              "Check-in" en un rail aparte que decían lo mismo tres veces. */}
          <div className="admin-event-workspace__security-bar">
            <div className="admin-event-workspace__notice" role="note">
              <ShieldAlert size={16} aria-hidden />
              <div className="admin-event-workspace__notice-copy">
                <h3>{t('admin.eventConsole.zoneScopeNoticeTitle')}</h3>
                <p>{t('admin.eventConsole.zoneScopeNotice')}</p>
              </div>
            </div>
            <div className="admin-event-workspace__security-actions">
              {gateUrl ? (
                <a
                  className="admin-event-security__launch"
                  href={gateUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} aria-hidden />
                  {t('admin.eventEditor.security.previewControl')}
                </a>
              ) : null}
              {onManageCheckin && doorOn ? (
                <button
                  type="button"
                  className="admin-event-workspace__security-link"
                  onClick={() => onManageCheckin?.(event)}
                >
                  <ScanLine size={14} aria-hidden />
                  {t('admin.eventConsole.checkin')}
                </button>
              ) : null}
            </div>
          </div>
          {securitySection}
        </div>
      )
    }
    if (activeTab === 'registrations') {
      return <div className="admin-event-workspace__wide">{registrationsSection}</div>
    }
    if (activeTab === 'payments') {
      return <div className="admin-event-workspace__wide">{paymentsSection}</div>
    }
    if (activeTab === 'sales') {
      // "Entradas vendidas" vive fuera del acordeón (`editor`): ese acordeón
      // sólo conoce cupo/precios/entradas/cobro -- no tiene un capítulo
      // definido para "sold", así que se reemplaza el nodo entero en vez de
      // pedirle al acordeón algo que no sabe mostrar.
      return (
        <div className="admin-event-workspace__main-col">
          {/* Abrir, programar y cerrar viven acá, arriba de las fechas que
              gobiernan: antes las fechas se veían sin decir que la venta
              estaba cerrada a mano, y el mismo botón estaba en la cabecera. */}
          {saleChapter === 'cupo' ? (
            <AdminEventSaleControl
              canEdit={canEdit}
              event={event}
              hasUnsavedState={() => stateDirtyRef.current}
              onFix={fixSale}
              onSetEventState={onSetEventState}
            />
          ) : null}
          {openChapter === 'sold' ? (
            <AdminEventTicketsSoldSection
              canOverride={canEdit}
              event={event}
              onSetTicketAccessOverride={onSetTicketAccessOverride}
            />
          ) : (
            editor
          )}
          <AdminEventTicketAddonReport event={event} tickets={tickets} />
        </div>
      )
    }
    if (activeTab === 'visibility') {
      return (
        <div className="admin-event-workspace__split">
          <div className="admin-event-workspace__main-col">
            {editor}
          </div>
          <aside
            className="admin-event-workspace__rail"
            aria-label={t('admin.sections.events.publicPreviewLabel')}
          >
            <AdminEventLivePreview
              embedded
              draft={previewDraft ?? event}
              live={Boolean(previewDraft)}
              showReadiness
              sourceEvent={event}
            />
          </aside>
        </div>
      )
    }
    if (activeTab === 'dashboard') {
      return (
        <div className="admin-event-workspace__split">
          <div className="admin-event-workspace__main-col">
            {/* Lo primero del evento: si se puede vender, y qué hacer si no. */}
            <AdminEventSaleControl
              canEdit={canEdit}
              event={event}
              hasUnsavedState={() => stateDirtyRef.current}
              onFix={fixSale}
              onSetEventState={onSetEventState}
            />
            <AdminEventDashboard
              event={event}
              registrationCounts={registrationCounts}
              tickets={tickets}
            />
          </div>
          <aside
            className="admin-event-workspace__rail"
            aria-label={t('admin.sections.events.publicPreviewLabel')}
          >
            {gotoCard}
            {modulesCard}
            <AdminEventLivePreview
              compact
              embedded
              draft={previewDraft ?? event}
              live={Boolean(previewDraft)}
              sourceEvent={event}
            />
          </aside>
        </div>
      )
    }
    // Datos: el formulario a ancho completo. Ocupación, operación y la ficha
    // pública viven en el Resumen; acá solo se edita título, sede y estado.
    return (
      <div className="admin-event-workspace__main-col">
        <AdminEventLogoControl
          event={event}
          canEdit={canEdit}
          onSetEventLogo={onSetEventLogo}
        />
        {onSetEventState ? (
          <AdminEventStateControl
            canEdit={canEdit}
            deferSave
            event={event}
            onDirtyChange={(dirty) => {
              stateDirtyRef.current = dirty
            }}
            onPendingChange={onStatePendingChange}
            onRegisterDiscard={onRegisterStateDiscard}
            onEditWindow={
              onSelectChapter ? () => onSelectChapter(event, 'sales', 'cupo') : undefined
            }
            onSetState={onSetEventState}
            // El estado de la inscripción se maneja desde el control de venta (Resumen).
            showStatus={false}
          />
        ) : null}
        {editor}
      </div>
    )
  }

  return (
    <section
      className="admin-event-workspace admin-event-workspace--sidebar"
      aria-label={t('admin.sections.events.panelLabel')}
    >
      <aside ref={sidebarRef} className="admin-event-workspace__sidebar">
        {/* Columna de chrome: el sticky vive en el aside (CSS). Este inner
            agrupa volver, identidad y nav sin un segundo ancla. */}
        <div className="admin-event-workspace__sidebar-inner">
        <button
          type="button"
          className="admin-event-workspace__back"
          onClick={handleBack}
          aria-label={t('admin.eventConsole.backAria')}
        >
          <ChevronLeft size={14} aria-hidden />
          <span>{t('admin.eventConsole.back')}</span>
        </button>

        <div className="admin-event-workspace__sidebar-head">
          <AdminEventLogoControl
            variant="mark"
            event={event}
            canEdit={canEdit}
            onSetEventLogo={onSetEventLogo}
          />
          <h1 className="admin-event-workspace__title">{event.title}</h1>
          {/* Estado de la venta, no el estado guardado: "Inscripción abierta"
              con el evento oculto o sin medios de cobro no decía la verdad. */}
          <button
            type="button"
            className={`admin-event-workspace__sale is-${sale.state}`}
            onClick={() => onSelectSection?.(event, 'dashboard')}
          >
            <span className="admin-event-workspace__sale-dot" aria-hidden />
            {t('admin.eventSale.sidebarLabel', { state: t(`admin.eventSale.state_${sale.state}`) })}
          </button>
          {/* Qué se ve en el sitio es el dato que más se pregunta después de
              crear un meet: nace oculto. Va junto al estado, con icono y texto
              (no solo color), y refleja lo guardado, no lo que está por guardar. */}
          {/* Tres estados, no dos: publicado con la página completa, publicado
              con el cartel de "en construcción", u oculto. Lleva a Vista
              pública, que es donde se cambia la página. */}
          <button
            type="button"
            className={`admin-event-workspace__site is-${siteState}`}
            title={t(SITE_STATE_NOTE[siteState])}
            onClick={() => onSelectSection?.(event, 'visibility')}
          >
            {siteState === 'live' ? (
              <Eye size={13} aria-hidden />
            ) : siteState === 'construction' ? (
              <Construction size={13} aria-hidden />
            ) : (
              <EyeOff size={13} aria-hidden />
            )}
            {t(SITE_STATE_LABEL[siteState])}
          </button>
          {event.featured ? (
            <span className="admin-event-workspace__featured">
              <Star size={11} aria-hidden />
              {t('admin.sections.events.leadFeatured')}
            </span>
          ) : null}
          {inNav ? (
            <span
              className="admin-event-workspace__featured"
              title={t('admin.sections.events.inNavHint')}
            >
              {t('admin.sections.events.inNav')}
            </span>
          ) : null}
          {sidebarMeta ? (
            <p className="admin-event-workspace__meta">
              <span className="admin-event-workspace__meta-item" title={venueLine || sidebarMeta}>
                {sidebarMeta}
              </span>
            </p>
          ) : null}
        </div>

        {/* Es un tablist, no una lista de botones: el panel de la derecha cambia
            en el lugar. Sin estos roles la pestaña activa se distinguía sólo por
            color -- un lector de pantalla no tenía forma de saber cuál estaba
            abierta, y ninguna forma de recorrerlas como grupo. */}
        <div
          ref={navRef}
          className="admin-event-workspace__nav"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('admin.eventConsole.tabsLabel')}
        >
          <span className="admin-event-workspace__nav-indicator" aria-hidden />
          {buildNav.map((tab) => renderNavItem(tab))}
          {operationNav.length ? (
            // Separador visual: no es una pestaña, el lector de pantalla lo saltea.
            <span className="admin-event-workspace__nav-label" aria-hidden="true">
              {t('admin.eventConsole.operationLabel')}
            </span>
          ) : null}
          {operationNav.map((tab) => renderNavItem(tab))}
        </div>
        </div>
        <div id="admin-event-workspace-save" className="admin-event-workspace__save" />
      </aside>

      <div className="admin-event-workspace__panel">
        <div
          className={`admin-event-workspace__toolbar${
            activeTab === 'sales' || showEventChapters
              ? ' admin-event-workspace__toolbar--chapters'
              : ''
          }`}
        >
          {activeTab === 'sales'
            ? renderChapters(salesChapters, {
                selectedId: openChapter ?? 'modules',
                onSelect: (chapter) => onSelectChapter?.(event, 'sales', chapter),
                ariaLabel: t('admin.eventEditor.salesChapterNavAria'),
              })
            : null}
          {showEventChapters
            ? renderChapters(eventChapters, {
                selectedId: activeTab,
                onSelect: (section) => {
                  if (section === activeTab) return
                  onSelectSection?.(event, section)
                  // Otro capítulo es otro contenido: arranca arriba, como una pestaña.
                  scrollHostRef.current?.scrollTo?.({ top: 0 })
                },
                ariaLabel: t('admin.eventConsole.navEventChapters'),
              })
            : null}
          <AdminEventQuickActions
            event={event}
            canEdit={canEdit}
            onSetEventState={onSetEventState}
            hasUnsavedState={() => stateDirtyRef.current}
            onEditDate={handleEditDate}
            showRegistrationToggle={
              activeTab !== 'dashboard' && !(activeTab === 'sales' && saleChapter === 'cupo')
            }
          />
          <div className="admin-event-workspace__head-actions">
            {canEdit && onTogglePin && event.status !== 'finalizado' ? (
              <AdminIconButton
                icon={Star}
                label={
                  event.featured
                    ? t('admin.sections.events.unpin')
                    : t('admin.sections.events.pin')
                }
                className={`admin-event-workspace__pin${event.featured ? ' is-pinned' : ''}`}
                disabled={pinBusy}
                pressed={Boolean(event.featured)}
                onClick={() => onTogglePin?.(event)}
                variant="ghost"
              />
            ) : null}
            <AdminCopyLinkMenu links={buildEventLinks(event, t)} />
            {canDelete && onDelete ? (
              <AdminIconButton
                icon={Trash2}
                label={t('admin.sections.events.delete.action')}
                onClick={() => onDelete?.(event)}
                variant="danger"
              />
            ) : null}
          </div>
        </div>

        <div
          ref={bodyRef}
          className="admin-event-workspace__body"
          id="admin-event-tabpanel"
          role="tabpanel"
          aria-labelledby={`admin-event-tab-${activeNavId}`}
          tabIndex={-1}
        >
          {renderTabPanel()}
        </div>
      </div>
    </section>
  )
}
