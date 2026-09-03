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
  ArrowLeft,
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
export default function AdminEventWorkspace({
  canDelete = false,
  canEdit,
  canManageUsers,
  editor = null,
  event,
  onClose,
  onDelete,
  onExitSection,
  onManagePayments,
  onManageRegistrations,
  onOpenZones,
  onSetEventState,
  onToggleSection,
  onSelectChapter,
  onTogglePublicModule,
  onToggleOccupancy,
  open = false,
  openSection,
  openChapter,
  paymentSummary,
  previewDraft,
  structureEditor,
  securitySection,
  paymentsSection,
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
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [eventSectionOpen, openSection, open, event, t])

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

  const previewBlock = (
    <div className="admin-event-workspace__detail">
      <p className="admin-event-workspace__detail-label">
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
      <details className="admin-event-workspace__sales-fold">
        <summary className="admin-event-workspace__sales-summary">
          {t('admin.eventConsole.salesDetail')}
        </summary>
        <div className="admin-event-workspace__sales-body">
          <AdminEventTicketInsights event={event} tickets={tickets} />
          <AdminEventTicketAddonReport event={event} tickets={tickets} />
        </div>
      </details>
    </div>
  )

  const activeTab = openSection || 'basics'

  const tabs = [
    { id: 'basics', label: t('admin.eventConsole.fichaLabel') },
    { id: 'sales', label: t('admin.eventConsole.salesLabel', 'Entradas') },
    { id: 'structure', label: t('admin.eventConsole.structure') },
    { id: 'security', label: t('admin.eventConsole.zones') },
    { id: 'payments', label: t('admin.eventConsole.payments', 'Pagos') },
    { id: 'visibility', label: t('admin.eventConsole.siteLabel') }
  ]

  const handleTabClick = (tabId) => {
    if (tabId === activeTab) return
    if (tabId === 'security') {
      onOpenZones?.(event)
    } else if (tabId === 'payments') {
      onManagePayments?.(event)
    } else {
      onToggleSection?.(event, tabId)
    }
  }

  return (
    <div
      className={`admin-event-workspace${sectionOpen ? ' admin-event-workspace--section-open' : ''}`}
    >
      <div
        ref={panelRef}
        className="admin-event-workspace__panel"
        aria-label={t('admin.sections.events.panelLabel')}
        tabIndex={-1}
      >
        <div className="admin-event-workspace__head">
          <div className="admin-event-workspace__head-copy">
            <div className="admin-event-workspace__title-row">
              <p className="admin-event-workspace__title">{event.title}</p>
              <StatusPill value={event.status} />
            </div>
            {(dateLabel || venueLine) && (
              <p className="admin-event-workspace__meta-line">
                {dateLabel ? <span>{dateLabel}</span> : null}
                {dateLabel && venueLine ? (
                  <span className="admin-event-workspace__meta-sep" aria-hidden>
                    ·
                  </span>
                ) : null}
                {venueLine ? <span>{venueLine}</span> : null}
              </p>
            )}
          </div>
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
            <button
              type="button"
              className="admin-event-workspace__close btn btn--small btn--outline"
              onClick={requestExit}
            >
              <ArrowLeft size={16} aria-hidden />
              {t('admin.eventConsole.backToList', 'Volver')}
            </button>
          </div>
        </div>

        <div className="admin-event-workspace__tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`admin-event-workspace__tab ${activeTab === tab.id ? 'admin-event-workspace__tab--active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="admin-event-workspace__body">
          <div className="admin-event-workspace__main">
            {onSetEventState && activeTab === 'basics' ? (
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

            <div className="admin-event-console__sections">
              {activeTab === 'basics' || activeTab === 'sales' || activeTab === 'visibility' ? (
                editor
              ) : null}
              {activeTab === 'structure' ? (
                structureEditor
              ) : null}
              {activeTab === 'security' ? (
                securitySection
              ) : null}
              {activeTab === 'payments' ? (
                paymentsSection
              ) : null}
            </div>
          </div>
          
          <aside className="admin-event-workspace__aside" aria-label={t('admin.sections.events.publicPreviewLabel')}>
            <details
              className="admin-event-workspace__detail-fold"
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
              <summary className="admin-event-workspace__detail-summary">
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
