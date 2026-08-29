import { useEffect, useRef, useState } from 'react'
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
import { formatDayMonth } from '../../lib/format.js'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'

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

const EDIT_SECTIONS = new Set(['basics', 'sales', 'visibility'])
const FOLD_SECTIONS = new Set(['basics', 'sales', 'visibility', 'structure'])

/**
 * Consola del evento como modal. Datos / Ventas / Publicación / Estructura se
 * expanden in-place (acordeón). El draft del evento vive en el padre; las
 * tandas (Estructura) guardan por su cuenta.
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
  open,
  openSection = null,
  structureEditor = null,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onExitSectionRef = useRef(onExitSection)
  onExitSectionRef.current = onExitSection
  const [previewOpen, setPreviewOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 720px)').matches : true,
  )

  const eventSectionOpen = EDIT_SECTIONS.has(openSection)
  const sectionOpen = FOLD_SECTIONS.has(openSection)

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
  }, [eventSectionOpen, openSection, sectionOpen, open, event])

  if (!open || !event) return null

  const activeTicketTypeCount =
    event.ticketTypes?.filter((ticketType) => ticketType.active !== false).length ?? 0
  const venueLine = formatEventVenueLine(event.venue, event.location)
  const dateLabel = event.dateISO ? formatDayMonth(event.dateISO, locale) : (event.date ?? '')
  const requestExit = () => {
    if (sectionOpen) onExitSection?.()
    else onClose?.()
  }

  function renderEditRow({ section, icon: Icon, label, value }) {
    const expanded = openSection === section
    const Chevron = expanded ? ChevronDown : ChevronRight
    return (
      <button
        type="button"
        className={`admin-event-console__row${expanded ? ' admin-event-console__row--expanded' : ''}`}
        aria-expanded={expanded}
        onClick={() => onToggleSection?.(event, section)}
      >
        <Icon size={17} aria-hidden />
        <strong>{label}</strong>
        <em>{value}</em>
        <Chevron size={14} aria-hidden className="admin-event-console__row-chevron" />
      </button>
    )
  }

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
          {onSetEventState ? (
            <AdminEventStateControl canEdit={canEdit} event={event} onSetState={onSetEventState} />
          ) : null}

          <div className="admin-event-console__sections">
            <span className="admin-event-console__group-label">
              {t('admin.eventConsole.configLabel')}
            </span>

            {canEdit ? (
              <>
                {renderEditRow({
                  section: 'basics',
                  icon: FileText,
                  label: t('admin.eventConsole.editBasics'),
                  value: t('admin.eventConsole.editBasicsValue'),
                })}
                {renderEditRow({
                  section: 'sales',
                  icon: Ticket,
                  label: t('admin.eventConsole.editSales'),
                  value:
                    activeTicketTypeCount > 0
                      ? t('admin.eventConsole.ticketsValue', { count: activeTicketTypeCount })
                      : t('admin.eventConsole.editSalesValue'),
                })}
                {renderEditRow({
                  section: 'visibility',
                  icon: Eye,
                  label: t('admin.eventConsole.editVisibility'),
                  value: t('admin.eventConsole.editVisibilityValue'),
                })}

                {eventSectionOpen && editor ? (
                  <div className="admin-event-console__fold" data-section={openSection}>
                    {editor}
                  </div>
                ) : null}
              </>
            ) : null}

            {renderEditRow({
              section: 'structure',
              icon: Layers,
              label: t('admin.eventConsole.structure'),
              value: t('admin.eventConsole.structureValue', {
                count: event.eventDays?.length ?? 0,
              }),
            })}

            {openSection === 'structure' && structureEditor ? (
              <div
                className="admin-event-console__fold admin-event-console__fold--structure"
                data-section="structure"
              >
                {structureEditor}
              </div>
            ) : null}

            {canManageUsers ? (
              <button
                type="button"
                className="admin-event-console__row"
                onClick={() => onOpenZones?.(event)}
              >
                <ShieldCheck size={17} aria-hidden />
                <strong>{t('admin.eventConsole.zones')}</strong>
                <em>{t('admin.eventConsole.zonesValue')}</em>
                <ChevronRight size={14} aria-hidden className="admin-event-console__row-chevron" />
              </button>
            ) : null}

            {onManageRegistrations || onManagePayments || onManageCheckin ? (
              <span className="admin-event-console__group-label">
                {t('admin.eventConsole.activityLabel')}
              </span>
            ) : null}

            {onManageRegistrations ? (
              <button
                type="button"
                className="admin-event-console__row"
                onClick={() => onManageRegistrations?.(event)}
              >
                <ClipboardList size={17} aria-hidden />
                <strong>{t('admin.eventConsole.registrations')}</strong>
                <em>
                  {t('admin.eventConsole.registrationsValue', {
                    count: event.registered ?? 0,
                    slots: event.slots ?? 0,
                  })}
                </em>
                <ChevronRight size={14} aria-hidden className="admin-event-console__row-chevron" />
              </button>
            ) : null}

            {onManagePayments ? (
              <button
                type="button"
                className="admin-event-console__row"
                onClick={() => onManagePayments?.(event)}
              >
                <CreditCard size={17} aria-hidden />
                <strong>{t('admin.eventConsole.payments')}</strong>
                <ChevronRight size={14} aria-hidden className="admin-event-console__row-chevron" />
              </button>
            ) : null}

            {onManageCheckin ? (
              <button
                type="button"
                className="admin-event-console__row"
                onClick={() => onManageCheckin?.(event)}
              >
                <ScanLine size={17} aria-hidden />
                <strong>{t('admin.eventConsole.checkin')}</strong>
                <ChevronRight size={14} aria-hidden className="admin-event-console__row-chevron" />
              </button>
            ) : null}
          </div>

          {!sectionOpen ? (
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
                {t('admin.sections.events.publicPreviewLabel')}
              </summary>
              <div className="admin-event-console-modal__detail">
                <p className="admin-event-console-modal__detail-label">
                  {t('admin.sections.events.publicPreviewLabel')}
                </p>
                <AdminEventLivePreview embedded draft={event} sourceEvent={event} />
                <AdminEventTicketInsights event={event} tickets={tickets} />
                <AdminEventTicketAddonReport event={event} tickets={tickets} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  )
}
