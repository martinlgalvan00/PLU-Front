import { useEffect, useRef } from 'react'
import {
  ClipboardList,
  CreditCard,
  Layers,
  Pencil,
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
import Button from '../ui/Button.jsx'
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

/**
 * Consola del evento como modal: el listado es la única superficie de la
 * sección y la consola se abre al tocar un evento. Editar reemplaza esta
 * capa (el editor no se apila encima).
 */
export default function AdminEventConsoleModal({
  canDelete = false,
  canEdit,
  canManageUsers,
  event,
  onClose,
  onDelete,
  onEdit,
  onManageCheckin,
  onManagePayments,
  onManageRegistrations,
  onOpenStructure,
  onOpenZones,
  onSetEventState,
  open,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || !event) return undefined

    function handleKeyDown(keyboardEvent) {
      if (keyboardEvent.key === 'Escape') {
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
      panelRef.current?.focus?.()
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [open, event])

  if (!open || !event) return null

  const activeTicketTypeCount =
    event.ticketTypes?.filter((ticketType) => ticketType.active !== false).length ?? 0
  const venueLine = formatEventVenueLine(event.venue, event.location)
  const dateLabel = event.dateISO ? formatDayMonth(event.dateISO, locale) : (event.date ?? '')

  return (
    <div className="admin-event-console-modal">
      <button
        type="button"
        className="admin-event-console-modal__backdrop"
        aria-label={t('admin.eventConsole.close')}
        onClick={onClose}
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
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                className="btn--small"
                onClick={() => onEdit?.(event)}
              >
                <Pencil size={14} aria-hidden />
                {t('admin.sections.events.editEvent')}
              </Button>
            ) : null}
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
              onClick={onClose}
              aria-label={t('admin.eventConsole.close')}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="admin-event-console-modal__body">
          {/* Abrir, cerrar y publicar son la operación diaria del evento: van
              antes que los accesos, y sin pasar por el editor. */}
          {onSetEventState ? (
            <AdminEventStateControl canEdit={canEdit} event={event} onSetState={onSetEventState} />
          ) : null}

          {/* Configuración y actividad como filas: la que se guarda sola
              (grilla, zonas) abre su drill a ancho completo, y la que vive en
              otra parte del panel en su sección. */}
          <div className="admin-event-console__sections">
            <span className="admin-event-console__group-label">
              {t('admin.eventConsole.configLabel')}
            </span>

            {canEdit ? (
              <button
                type="button"
                className="admin-event-console__row"
                onClick={() => onEdit?.(event, 'tickets')}
              >
                <Ticket size={17} aria-hidden />
                <strong>{t('admin.eventConsole.tickets')}</strong>
                <em>{t('admin.eventConsole.ticketsValue', { count: activeTicketTypeCount })}</em>
              </button>
            ) : null}

            <button
              type="button"
              className="admin-event-console__row"
              onClick={() => onOpenStructure?.(event)}
            >
              <Layers size={17} aria-hidden />
              <strong>{t('admin.eventConsole.structure')}</strong>
              <em>
                {t('admin.eventConsole.structureValue', { count: event.eventDays?.length ?? 0 })}
              </em>
            </button>

            {canManageUsers ? (
              <button
                type="button"
                className="admin-event-console__row"
                onClick={() => onOpenZones?.(event)}
              >
                <ShieldCheck size={17} aria-hidden />
                <strong>{t('admin.eventConsole.zones')}</strong>
                <em>{t('admin.eventConsole.zonesValue')}</em>
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
              </button>
            ) : null}
          </div>

          <div className="admin-event-console-modal__detail">
            <p className="admin-event-console-modal__detail-label">
              {t('admin.sections.events.publicPreviewLabel')}
            </p>
            <AdminEventLivePreview embedded draft={event} sourceEvent={event} />
            <AdminEventTicketInsights event={event} tickets={tickets} />
            <AdminEventTicketAddonReport event={event} tickets={tickets} />
          </div>
        </div>
      </div>
    </div>
  )
}
