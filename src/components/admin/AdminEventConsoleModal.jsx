import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  Layers,
  ScanLine,
  ShieldCheck,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import AdminCopyLinkMenu from './AdminCopyLinkMenu.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import { AdminEventLivePreview } from './AdminEventEditor.jsx'
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

function joinSummaryParts(parts) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' · ')
}

function surfaceModuleTitleKey(key) {
  return `admin.eventEditor.publicSurface${key.charAt(0).toUpperCase()}${key.slice(1)}Title`
}

const EDIT_SECTIONS = new Set(['basics', 'sales', 'visibility'])
const FOLD_SECTIONS = new Set(['basics', 'sales', 'visibility', 'structure'])

/**
 * Consola del evento como modal. Ficha / Sitio / Operación / Actividad.
 * Datos, Publicación, Ventas y Estructura se expanden in-place. El draft
 * vive en el padre; las tandas guardan por su cuenta. La preview queda sticky.
 */
export default function AdminEventConsoleModal({
  canDelete = false,
  canEdit,
  canManageUsers,
  editor = null,
  event,
  onClose,
  onDelete,
  onExitSection,
  onManageCheckin,
  onManagePayments,
  onManageRegistrations,
  onOpenZones,
  onSetEventState,
  onToggleSection,
  onSelectChapter,
  onTogglePublicModule,
  onToggleOccupancy,
  open,
  openSection = null,
  openChapter = null,
  paymentSummary = '',
  previewDraft = null,
  structureEditor = null,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const panelRef = useRef(null)
  const foldRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onExitSectionRef = useRef(onExitSection)
  onExitSectionRef.current = onExitSection
  const stateDirtyRef = useRef(false)
  const [previewOpen, setPreviewOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 720px)').matches : true,
  )

  const eventSectionOpen = EDIT_SECTIONS.has(openSection)
  const sectionOpen = FOLD_SECTIONS.has(openSection)
  const summarySource = previewDraft ?? event
  const previewIsLive = Boolean(previewDraft && eventSectionOpen)

  const confirmCloseIfDirty = () => {
    if (!stateDirtyRef.current) return true
    return window.confirm(t('admin.eventState.discardUnsavedConfirm'))
  }

  useEffect(() => {
    if (!open) stateDirtyRef.current = false
  }, [open])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 720px)')
    function syncDesktopPreview() {
      if (media.matches) setPreviewOpen(true)
    }
    syncDesktopPreview()
    media.addEventListener('change', syncDesktopPreview)
    return () => media.removeEventListener('change', syncDesktopPreview)
  }, [])

  useEffect(() => {
    if (!sectionOpen || !foldRef.current) return undefined
    const fold = foldRef.current
    const frame = requestAnimationFrame(() => {
      fold.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [openSection, sectionOpen])

  useEffect(() => {
    if (!open || !event) return undefined

    function handleKeyDown(keyboardEvent) {
      if (keyboardEvent.key === 'Escape') {
        // Editor de evento: dirty-check propio. Estructura: cerrar el fold.
        if (eventSectionOpen) return
        if (openSection === 'structure') {
          keyboardEvent.preventDefault()
          onExitSectionRef.current?.()
          return
        }
        keyboardEvent.preventDefault()
        if (stateDirtyRef.current && !window.confirm(t('admin.eventState.discardUnsavedConfirm'))) {
          return
        }
        onCloseRef.current?.()
        return
      }

      if (keyboardEvent.key !== 'Tab' || !panelRef.current) return
      const focusable = [
        ...panelRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable.at(-1)
      if (keyboardEvent.shiftKey && document.activeElement === first) {
        keyboardEvent.preventDefault()
        last.focus()
      } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
        keyboardEvent.preventDefault()
        first.focus()
      }
    }

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const focusFrame = requestAnimationFrame(() => {
      if (!sectionOpen) panelRef.current?.focus?.()
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [eventSectionOpen, openSection, sectionOpen, open, event, t])

  const activeTicketTypeCount = useMemo(() => {
    const types = summarySource?.ticketTypes ?? event?.ticketTypes
    return types?.filter((ticketType) => ticketType.active !== false).length ?? 0
  }, [event?.ticketTypes, summarySource?.ticketTypes])

  if (!open || !event) return null

  const venueLine = formatEventVenueLine(event.venue, event.location)
  const dateLabel = event.dateISO ? formatDayMonth(event.dateISO, locale) : (event.date ?? '')
  const requestExit = () => {
    if (sectionOpen) {
      onExitSection?.()
      return
    }
    if (!confirmCloseIfDirty()) return
    onClose?.()
  }

  const basicsSummary = (() => {
    const title = String(summarySource?.title ?? event.title ?? '').trim()
    const date =
      summarySource?.dateISO || event.dateISO
        ? formatDayMonth(summarySource?.dateISO || event.dateISO, locale)
        : (summarySource?.date ?? event.date ?? '')
    const venue = formatEventVenueLine(
      summarySource?.venue ?? event.venue,
      summarySource?.location ?? event.location,
    )
    const line = joinSummaryParts([title, date, venue])
    return line || t('admin.eventConsole.editBasicsValue')
  })()

  const salesSummary =
    activeTicketTypeCount > 0
      ? t('admin.eventConsole.salesSummary', {
          count: activeTicketTypeCount,
          registered: summarySource?.registered ?? event.registered ?? 0,
          slots: summarySource?.slots ?? event.slots ?? 0,
        })
      : t('admin.eventConsole.editSalesValue')

  const surface = eventPublicSurfaceFromEvent(summarySource ?? event)
  const surfaceModules = publicSurfaceModulesForEvent(event)
  const visibilitySummary = joinSummaryParts([
    summarySource?.featured
      ? t('admin.eventConsole.visibilityFeatured')
      : t('admin.eventConsole.visibilityStandard'),
    t('admin.eventConsole.surfaceSummary', {
      visible: surfaceModules.filter((module) => surface[module.key]).length,
      total: surfaceModules.length,
    }),
  ])

  const salesChapters = [
    {
      id: 'cupo',
      label: t('admin.eventEditor.salesChapterCapacity'),
      value: t('admin.eventConsole.registrationsValue', {
        count: summarySource?.registered ?? event.registered ?? 0,
        slots: summarySource?.slots ?? event.slots ?? 0,
      }),
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

  const structureChapters = [
    {
      id: 'days',
      label: t('admin.eventConsole.structureChapterDays'),
      value: t('admin.eventConsole.structureChapterDaysValue', {
        count: event.eventDays?.length ?? 0,
      }),
    },
    {
      id: 'weighIns',
      label: t('admin.eventConsole.structureChapterWeighIns'),
      value: t('admin.eventConsole.structureChapterWeighInsValue', {
        count: event.weighInWindows?.length ?? 0,
      }),
    },
    {
      id: 'sessions',
      label: t('admin.eventConsole.structureChapterSessions'),
      value: t('admin.eventConsole.structureChapterSessionsValue'),
    },
  ]

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

  const editRows = canEdit
    ? [
        {
          section: 'basics',
          icon: FileText,
          label: t('admin.eventConsole.editBasics'),
          value: basicsSummary,
        },
        {
          section: 'sales',
          icon: Ticket,
          label: t('admin.eventConsole.editSales'),
          value: salesSummary,
        },
        {
          section: 'visibility',
          icon: Eye,
          label: t('admin.eventConsole.editVisibility'),
          value: visibilitySummary,
        },
      ]
    : []

  const basicsRow = editRows.find((row) => row.section === 'basics') ?? null
  const salesRow = editRows.find((row) => row.section === 'sales') ?? null
  const visibilityRow = editRows.find((row) => row.section === 'visibility') ?? null

  function renderEditRow({ section, icon: Icon, label, value }) {
    const expanded = openSection === section
    const Chevron = expanded ? ChevronDown : ChevronRight
    return (
      <button
        type="button"
        className={`admin-event-console__row${expanded ? ' admin-event-console__row--expanded' : ''}`}
        aria-expanded={expanded}
        aria-controls={expanded ? `admin-event-console-fold-${section}` : undefined}
        onClick={() => onToggleSection?.(event, section)}
      >
        <Icon size={17} aria-hidden />
        <strong>{label}</strong>
        <em>{value}</em>
        <Chevron size={14} aria-hidden className="admin-event-console__row-chevron" />
      </button>
    )
  }

  function renderActionRow({ icon: Icon, label, value, onClick }) {
    return (
      <button type="button" className="admin-event-console__row admin-event-console__row--drill" onClick={onClick}>
        <Icon size={17} aria-hidden />
        <strong>{label}</strong>
        {value ? <em>{value}</em> : <span className="admin-event-console__row-spacer" />}
        <ChevronRight size={14} aria-hidden className="admin-event-console__row-chevron" />
      </button>
    )
  }

  function renderTabSubmenu(chapters, section, fallback, ariaLabel, variant) {
    return (
      <div
        className={`admin-event-console__submenu${variant === 'chapters' ? ' admin-event-console__submenu--chapters' : ''}`}
        role="tablist"
        aria-label={ariaLabel}
      >
        {chapters.map((chapter) => {
          const selected = (openChapter ?? fallback) === chapter.id
          return (
            <button
              key={chapter.id}
              type="button"
              role="tab"
              id={`event-${section}-chapter-${chapter.id}`}
              className={`admin-event-console__subrow${selected ? ' is-active' : ''}`}
              aria-selected={selected}
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

  function renderFoldItem(row) {
    const expanded = openSection === row.section
    const foldBody = row.section === 'structure' ? structureEditor : editor
    const foldClass =
      row.section === 'structure'
        ? 'admin-event-console__fold admin-event-console__fold--structure'
        : 'admin-event-console__fold'
    return (
      <div
        key={row.section}
        className={`admin-event-console__item${expanded ? ' admin-event-console__item--expanded' : ''}`}
      >
        {renderEditRow(row)}
        {expanded && row.section === 'sales'
          ? renderTabSubmenu(
              salesChapters,
              'sales',
              'cupo',
              t('admin.eventEditor.salesChapterNavAria'),
              'chapters',
            )
          : null}
        {expanded && row.section === 'structure'
          ? renderTabSubmenu(
              structureChapters,
              'structure',
              'days',
              t('admin.eventConsole.structureChapterNavAria'),
              'chapters',
            )
          : null}
        {expanded && row.section === 'visibility' ? (
          <div
            className="admin-event-console__submenu"
            role="group"
            aria-label={t('admin.eventEditor.publicSurfaceLegend')}
          >
            {siteChapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                role="switch"
                className={`admin-event-console__subrow admin-event-console__subrow--switch${chapter.on ? ' is-on' : ''}`}
                aria-checked={chapter.on}
                onClick={() => {
                  if (chapter.kind === 'occupancy') onToggleOccupancy?.(event)
                  else onTogglePublicModule?.(event, chapter.id)
                }}
              >
                <strong>{chapter.label}</strong>
                <em>{chapter.on ? t('admin.eventConsole.surfaceOn') : t('admin.eventConsole.surfaceOff')}</em>
                <span className="admin-event-console__switch" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}
        {expanded && foldBody ? (
          <div
            ref={foldRef}
            id={`admin-event-console-fold-${row.section}`}
            className={foldClass}
            data-section={row.section}
          >
            {foldBody}
          </div>
        ) : null}
      </div>
    )
  }

  const previewBlock = (
    <div className="admin-event-console-modal__detail">
      <p className="admin-event-console-modal__detail-label">
        {previewIsLive
          ? t('admin.eventEditor.livePreview')
          : t('admin.sections.events.publicPreviewLabel')}
      </p>
      <AdminEventLivePreview
        embedded
        live={previewIsLive}
        draft={previewDraft ?? event}
        showReadiness
        sourceEvent={event}
      />
      <details className="admin-event-console-modal__sales-fold">
        <summary className="admin-event-console-modal__sales-summary">
          {t('admin.eventConsole.salesDetail')}
        </summary>
        <div className="admin-event-console-modal__sales-body">
          <AdminEventTicketInsights event={event} tickets={tickets} />
          <AdminEventTicketAddonReport event={event} tickets={tickets} />
        </div>
      </details>
    </div>
  )

  return (
    <div
      className={`admin-event-console-modal${sectionOpen ? ' admin-event-console-modal--section-open' : ''}`}
    >
      <button
        type="button"
        className="admin-event-console-modal__backdrop"
        aria-label={sectionOpen ? t('admin.eventConsole.closeSection') : t('admin.eventConsole.close')}
        onClick={requestExit}
      />
      <div
        ref={panelRef}
        className="admin-event-console-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('admin.sections.events.panelLabel')}
        tabIndex={-1}
      >
        <div className="admin-event-console-modal__head">
          <div className="admin-event-console-modal__head-copy">
            <div className="admin-event-console-modal__title-row">
              <p className="admin-event-console-modal__title">{event.title}</p>
              <StatusPill value={event.status} />
            </div>
            {(dateLabel || venueLine) && (
              <p className="admin-event-console-modal__meta-line">
                {dateLabel ? <span>{dateLabel}</span> : null}
                {dateLabel && venueLine ? (
                  <span className="admin-event-console-modal__meta-sep" aria-hidden>
                    ·
                  </span>
                ) : null}
                {venueLine ? <span>{venueLine}</span> : null}
              </p>
            )}
          </div>
          <div className="admin-event-console-modal__head-actions">
            <AdminCopyLinkMenu links={buildEventLinks(event, t)} />
            {canDelete && onDelete ? (
              <AdminIconButton
                icon={Trash2}
                label={t('admin.sections.events.delete.action')}
                onClick={() => onDelete?.(event)}
                variant="danger"
              />
            ) : null}
            <button
              type="button"
              className="admin-event-console-modal__close"
              onClick={requestExit}
              aria-label={t('admin.eventConsole.close')}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="admin-event-console-modal__body">
          <div className="admin-event-console-modal__main">
            {onSetEventState ? (
              <AdminEventStateControl
                canEdit={canEdit}
                event={event}
                onDirtyChange={(dirty) => {
                  stateDirtyRef.current = dirty
                }}
                onSetState={onSetEventState}
              />
            ) : null}

            <div className="admin-event-console__sections">
              {basicsRow ? (
                <>
                  <span className="admin-event-console__group-label">
                    {t('admin.eventConsole.fichaLabel')}
                  </span>
                  {renderFoldItem(basicsRow)}
                </>
              ) : null}

              {visibilityRow ? (
                <>
                  <span className="admin-event-console__group-label">
                    {t('admin.eventConsole.siteLabel')}
                  </span>
                  {renderFoldItem(visibilityRow)}
                </>
              ) : null}

              <span className="admin-event-console__group-label">
                {t('admin.eventConsole.operationLabel')}
              </span>

              {salesRow ? renderFoldItem(salesRow) : null}

              {renderFoldItem({
                section: 'structure',
                icon: Layers,
                label: t('admin.eventConsole.structure'),
                value: t('admin.eventConsole.structureValue', {
                  count: event.eventDays?.length ?? 0,
                }),
              })}

              {canManageUsers ? (
                renderActionRow({
                  icon: ShieldCheck,
                  label: t('admin.eventConsole.zones'),
                  value: t('admin.eventConsole.zonesValue'),
                  onClick: () => onOpenZones?.(event),
                })
              ) : null}

              {onManageRegistrations || onManagePayments || onManageCheckin ? (
                <span className="admin-event-console__group-label">
                  {t('admin.eventConsole.activityLabel')}
                </span>
              ) : null}

              {onManageRegistrations ? (
                renderActionRow({
                  icon: ClipboardList,
                  label: t('admin.eventConsole.registrations'),
                  value: t('admin.eventConsole.registrationsValue', {
                    count: event.registered ?? 0,
                    slots: event.slots ?? 0,
                  }),
                  onClick: () => onManageRegistrations?.(event),
                })
              ) : null}

              {onManagePayments ? (
                renderActionRow({
                  icon: CreditCard,
                  label: t('admin.eventConsole.payments'),
                  value: paymentSummary || t('admin.eventConsole.paymentsClear'),
                  onClick: () => onManagePayments?.(event),
                })
              ) : null}

              {onManageCheckin ? (
                renderActionRow({
                  icon: ScanLine,
                  label: t('admin.eventConsole.checkin'),
                  value: t('admin.eventConsole.checkinValue'),
                  onClick: () => onManageCheckin?.(event),
                })
              ) : null}
            </div>
          </div>

          <aside className="admin-event-console-modal__aside" aria-label={t('admin.sections.events.publicPreviewLabel')}>
            <details
              className="admin-event-console-modal__detail-fold"
              open={previewOpen}
              onToggle={(toggleEvent) => {
                if (window.matchMedia('(min-width: 720px)').matches) {
                  toggleEvent.currentTarget.open = true
                  setPreviewOpen(true)
                  return
                }
                setPreviewOpen(toggleEvent.currentTarget.open)
              }}
            >
              <summary className="admin-event-console-modal__detail-summary">
                <Eye size={14} aria-hidden />
                {previewIsLive
                  ? t('admin.eventEditor.livePreview')
                  : t('admin.sections.events.publicPreviewLabel')}
              </summary>
              {previewBlock}
            </details>
          </aside>
        </div>
      </div>
    </div>
  )
}
