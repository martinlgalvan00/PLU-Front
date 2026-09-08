import { useEffect, useMemo, useRef } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  ScanLine,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import AdminCopyLinkMenu from './AdminCopyLinkMenu.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import { AdminEventLivePreview } from './AdminEventEditor.jsx'
import AdminEventDashboard from './AdminEventDashboard.jsx'
import AdminEventStateControl from './AdminEventStateControl.jsx'
import AdminEventTicketAddonReport from './AdminEventTicketAddonReport.jsx'
import AdminEventTicketInsights from './AdminEventTicketInsights.jsx'
import StatusPill from '../ui/StatusPill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { formatDayMonth, money } from '../../lib/format.js'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'
import {
  eventPublicSurfaceFromEvent,
  publicSurfaceModulesForEvent,
} from '../../lib/eventPublicSurface.js'

function surfaceModuleTitleKey(key) {
  return `admin.eventEditor.publicSurface${key.charAt(0).toUpperCase()}${key.slice(1)}Title`
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
 * 3. Inscripciones y Check-in NO son pestañas: son otras secciones del panel.
 *    Viven como accesos en el rail, no como superficies del evento.
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
  onBack,
  onDelete,
  onManageCheckin,
  onManageRegistrations,
  onSelectChapter,
  onSelectSection,
  onSetEventState,
  onToggleOccupancy,
  onTogglePublicModule,
  openChapter = null,
  paymentSummary = '',
  paymentsAttention = null,
  paymentsSection = null,
  previewDraft = null,
  securitySection = null,
  structureEditor = null,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const stateDirtyRef = useRef(false)
  const sidebarRef = useRef(null)
  const scrollHostRef = useRef(null)

  useEffect(() => {
    scrollHostRef.current = sidebarRef.current?.closest('.admin-shell__content') ?? null
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

  const activeTicketTypeCount = useMemo(() => {
    const types = summarySource?.ticketTypes ?? event?.ticketTypes
    return types?.filter((ticketType) => ticketType.active !== false).length ?? 0
  }, [event?.ticketTypes, summarySource?.ticketTypes])

  const tabs = useMemo(() => {
    const list = []
    list.push({ id: 'dashboard', label: t('admin.eventConsole.dashboard') })
    if (canEdit) list.push({ id: 'basics', label: t('admin.eventConsole.editBasics') })
    list.push({
      id: 'structure',
      label: t('admin.eventConsole.structure'),
      count: event?.eventDays?.length ?? 0,
    })
    if (canEdit) {
      list.push({
        id: 'sales',
        // Esta pestaña abre los cuatro capítulos (Cupo, Precios, Entradas,
        // Cobro): llamarla "Entradas" -- como el capítulo de tickets ahí
        // adentro -- hacía que el mismo nombre significara dos cosas
        // distintas según el nivel, y era la confusión real que reportaban
        // los operadores entre "entrada" (ticket) e "inscripción" (cupo).
        label: t('admin.eventConsole.editSales'),
        // Mismo criterio que el checklist de "listo para publicar": sin ningún
        // tipo de entrada activo, el evento no puede vender.
        hasError: activeTicketTypeCount === 0,
      })
    }
    if (canManageUsers && securitySection) {
      list.push({ id: 'security', label: t('admin.eventConsole.zones') })
    }
    if (paymentsSection) {
      list.push({
        id: 'payments',
        label: t('admin.eventConsole.payments'),
        ...(typeof paymentsAttention === 'number' && paymentsAttention > 0
          ? { count: paymentsAttention }
          : {}),
      })
    }
    if (canEdit) list.push({ id: 'visibility', label: t('admin.eventConsole.visibilityLabel') })
    return list
  }, [
    activeTicketTypeCount,
    canEdit,
    canManageUsers,
    event?.eventDays?.length,
    paymentsAttention,
    paymentsSection,
    securitySection,
    t,
  ])

  if (!event) return null

  const activeTab = tabs.some((tab) => tab.id === activeSection)
    ? activeSection
    : (tabs[0]?.id ?? null)

  const venueLine = formatEventVenueLine(event.venue, event.location)
  const dateLabel = event.dateISO ? formatDayMonth(event.dateISO, locale) : (event.date ?? '')

  const registered = Number(event.registered) || 0
  const slots = Number(event.slots) || 0
  const remaining = Math.max(0, slots - registered)
  const fillPercent = slots > 0 ? Math.round((registered / slots) * 100) : 0

  function handleBack() {
    if (stateDirtyRef.current && !window.confirm(t('admin.eventState.discardUnsavedConfirm'))) {
      return
    }
    onBack?.()
  }

  function handleSelectTab(tabId) {
    if (tabId === activeTab) return
    onSelectSection?.(event, tabId)
    // Cada pestaña arranca arriba: sin esto, cambiar de sección mantenía el
    // scroll donde había quedado la anterior, que casi nunca tiene sentido
    // para contenido no relacionado.
    scrollHostRef.current?.scrollTo({ top: 0 })
  }

  /**
   * Capítulos de Ventas. Los dibuja el workspace y no el editor: en modo
   * acordeón el editor no renderiza su propia navegación -- la dictaba la
   * consola, y perderla dejaba los cuatro capítulos inalcanzables.
   */
  const salesChapters = [
    {
      id: 'cupo',
      label: t('admin.eventEditor.salesChapterCapacity'),
      value: t('admin.eventConsole.registrationsValue', { count: registered, slots }),
    },
    {
      id: 'prices',
      label: t('admin.eventEditor.salesChapterPrices'),
      value: money(summarySource?.pricing?.registration ?? event.pricing?.registration, locale),
    },
    {
      id: 'tickets',
      label: t('admin.eventEditor.salesChapterTickets'),
      value: t('admin.eventConsole.ticketsValue', { count: activeTicketTypeCount }),
    },
    {
      id: 'payment',
      label: t('admin.eventEditor.salesChapterPayment'),
      value: t('admin.eventConsole.paymentChapterValue'),
    },
  ]

  /** Bloques de la página pública, con su interruptor de un toque. */
  const surface = eventPublicSurfaceFromEvent(summarySource ?? event)
  const siteChapters = [
    ...publicSurfaceModulesForEvent(event).map((module) => ({
      id: module.key,
      kind: 'surface',
      label: t(surfaceModuleTitleKey(module.key)),
      on: surface[module.key] === true,
    })),
    {
      id: 'occupancy',
      kind: 'occupancy',
      label: t('admin.eventEditor.capacityVisibilityTitle'),
      on: (summarySource ?? event).capacityProgressPublic !== false,
    },
  ]

  function renderChapters(chapters, section, fallback, ariaLabel) {
    return (
      <div className="admin-event-workspace__chapters" role="tablist" aria-label={ariaLabel}>
        {chapters.map((chapter) => {
          const selected = (openChapter ?? fallback) === chapter.id
          return (
            <button
              key={chapter.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`admin-event-workspace__chapter${selected ? ' is-active' : ''}`}
              onClick={() => onSelectChapter?.(event, section, chapter.id)}
            >
              <strong>{chapter.label}</strong>
              <em>{chapter.value}</em>
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

  const occupancyCard = slots > 0 ? (
    <section className="admin-event-workspace__card">
      <header className="admin-event-workspace__card-head">
        <h2 className="admin-event-workspace__card-title">{t('admin.eventConsole.occupancy')}</h2>
        <span className="admin-event-workspace__card-hint">
          {t('admin.eventEditor.occupancyPercent', { percent: fillPercent })}
        </span>
      </header>
      <div className="admin-event-workspace__card-body">
        <div className="admin-event-workspace__meter" aria-hidden>
          <span style={{ width: `${Math.min(100, Math.max(0, fillPercent))}%` }} />
        </div>
        <p className="admin-event-workspace__occupancy-copy">
          <strong>{registered}</strong>
          <span>{t('admin.eventConsole.occupancyDetail', { slots, remaining })}</span>
        </p>
      </div>
    </section>
  ) : null

  const gotoCard =
    onManageRegistrations || paymentsSection || onManageCheckin ? (
      <section className="admin-event-workspace__card">
        <header className="admin-event-workspace__card-head">
          <h2 className="admin-event-workspace__card-title">
            {t('admin.eventConsole.operationLabel')}
          </h2>
        </header>
        <div className="admin-event-workspace__gotos">
          {onManageRegistrations
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
          {onManageCheckin
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

  function renderTabPanel() {
    if (activeTab === 'structure') {
      return (
        <div className="admin-event-workspace__wide admin-event-workspace__structure">
          {structureEditor}
        </div>
      )
    }
    if (activeTab === 'security') {
      return (
        <div className="admin-event-workspace__split">
          <div className="admin-event-workspace__main-col">
            <div className="admin-event-workspace__notice" role="note">
              <ShieldAlert size={16} aria-hidden />
              <div className="admin-event-workspace__notice-copy">
                <h3>{t('admin.eventConsole.zoneScopeNoticeTitle')}</h3>
                <p>{t('admin.eventConsole.zoneScopeNotice')}</p>
              </div>
            </div>
            {securitySection}
          </div>
          {onManageCheckin ? (
            <aside className="admin-event-workspace__rail">
              <section className="admin-event-workspace__card">
                <header className="admin-event-workspace__card-head">
                  <h2 className="admin-event-workspace__card-title">
                    {t('admin.eventConsole.checkin')}
                  </h2>
                </header>
                <div className="admin-event-workspace__gotos">
                  {renderGoto({
                    icon: ScanLine,
                    label: t('admin.eventConsole.checkin'),
                    value: t('admin.eventConsole.checkinValue'),
                    onClick: () => onManageCheckin?.(event),
                  })}
                </div>
              </section>
            </aside>
          ) : null}
        </div>
      )
    }
    if (activeTab === 'payments') {
      return <div className="admin-event-workspace__wide">{paymentsSection}</div>
    }
    if (activeTab === 'sales') {
      return (
        <div className="admin-event-workspace__split">
          <div className="admin-event-workspace__main-col">
            {renderChapters(
              salesChapters,
              'sales',
              'cupo',
              t('admin.eventEditor.salesChapterNavAria'),
            )}
            {editor}
          </div>
          <aside className="admin-event-workspace__rail">
            {/* `summarySource`, no `event`: si el operador acaba de prender el
                toggle de venta y todavía no guardó, el rail no puede seguir
                diciendo "deshabilitada" contra el toggle que tiene enfrente. */}
            <AdminEventTicketInsights event={summarySource} tickets={tickets} />
            <AdminEventTicketAddonReport event={event} tickets={tickets} />
          </aside>
        </div>
      )
    }
    if (activeTab === 'visibility') {
      return (
        <div className="admin-event-workspace__split">
          <div className="admin-event-workspace__main-col">
            {/* Interruptores de un toque: apagan un bloque de la página sin
                tocar su contenido ni pasar por Guardar. */}
            <div
              className="admin-event-workspace__surface"
              role="group"
              aria-label={t('admin.eventEditor.publicSurfaceLegend')}
            >
              {siteChapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  role="switch"
                  aria-checked={chapter.on}
                  className={`admin-event-workspace__switch-row${chapter.on ? ' is-on' : ''}`}
                  disabled={!canEdit}
                  onClick={() => {
                    if (chapter.kind === 'occupancy') onToggleOccupancy?.(event)
                    else onTogglePublicModule?.(event, chapter.id)
                  }}
                >
                  <strong>{chapter.label}</strong>
                  <em className="visually-hidden">
                    {chapter.on
                      ? t('admin.eventConsole.surfaceOn')
                      : t('admin.eventConsole.surfaceOff')}
                  </em>
                  <span className="admin-event-workspace__switch" aria-hidden />
                </button>
              ))}
            </div>
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
            <AdminEventDashboard 
              event={event} 
              tickets={tickets} 
              onManageCheckin={onManageCheckin} 
              onSelectSection={(tabId) => handleSelectTab(tabId)} 
            />
          </div>
          <aside className="admin-event-workspace__rail">
            {occupancyCard}
            {gotoCard}
          </aside>
        </div>
      )
    }
    // basics
    return (
      <div className="admin-event-workspace__split">
        <div className="admin-event-workspace__main-col">
          {onSetEventState ? (
            <AdminEventStateControl
              canEdit={canEdit}
              event={event}
              onDirtyChange={(dirty) => {
                stateDirtyRef.current = dirty
              }}
              onEditWindow={
                onSelectChapter ? () => onSelectChapter(event, 'sales', 'cupo') : undefined
              }
              onSetState={onSetEventState}
            />
          ) : null}
          {editor}
        </div>
        <aside className="admin-event-workspace__rail">
          {occupancyCard}
          {gotoCard}
        </aside>
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
          <h1 className="admin-event-workspace__title">{event.title}</h1>
          <StatusPill value={event.status} />
          {(dateLabel || venueLine) && (
            <p className="admin-event-workspace__meta">
              {dateLabel ? (
                <span className="admin-event-workspace__meta-item" title={dateLabel}>
                  {dateLabel}
                </span>
              ) : null}
              {venueLine ? (
                <span className="admin-event-workspace__meta-item" title={venueLine}>
                  {venueLine}
                </span>
              ) : null}
            </p>
          )}
        </div>

        {/* Es un tablist, no una lista de botones: el panel de la derecha cambia
            en el lugar. Sin estos roles la pestaña activa se distinguía sólo por
            color -- un lector de pantalla no tenía forma de saber cuál estaba
            abierta, y ninguna forma de recorrerlas como grupo. */}
        <div
          className="admin-event-workspace__nav"
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('admin.eventConsole.tabsLabel')}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`admin-event-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls="admin-event-tabpanel"
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`admin-event-workspace__nav-item ${
                activeTab === tab.id ? 'is-active' : ''
              } ${tab.hasError ? 'has-error' : ''}`}
              onClick={() => handleSelectTab(tab.id)}
            >
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 ? (
                <span className="admin-event-workspace__nav-count">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>
        </div>
      </aside>

      <div className="admin-event-workspace__panel">
        <div className="admin-event-workspace__toolbar">
          <div className="admin-event-workspace__head-actions">
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
          className="admin-event-workspace__body"
          id="admin-event-tabpanel"
          role="tabpanel"
          aria-labelledby={`admin-event-tab-${activeTab}`}
          tabIndex={-1}
        >
          {renderTabPanel()}
        </div>
      </div>
    </section>
  )
}
