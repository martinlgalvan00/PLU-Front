import { Pencil, Users, Banknote, ScanLine, ExternalLink, CalendarDays } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { money } from '../../lib/format'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'

export default function AdminEventDashboard({ event, tickets = [], onManageCheckin, onSelectSection }) {
  const { t, locale } = useI18n()

  const registered = Number(event.registered) || 0
  const slots = Number(event.slots) || 0

  const revenue = tickets.reduce((sum, ticket) => sum + (Number(ticket.amountPaid) || 0), 0)
  const checkins = tickets.filter((ticket) => ticket.checkedInAt).length
  const attendanceRate = tickets.length > 0 ? Math.round((checkins / tickets.length) * 100) : 0

  return (
    <div className="admin-event-dashboard">
      <div className="admin-event-dashboard__kpis">
        {/* Con cupo definido, la ocupación ya se ve —con barra de progreso—
            en el rail de la pestaña (`occupancyCard`), al lado de esta grilla.
            Repetirla acá sería el mismo dato dos veces en la misma pantalla;
            se muestra solo cuando el rail no tiene nada que mostrar. */}
        {slots === 0 ? (
          <div className="admin-event-dashboard__kpi-card">
            <div className="admin-event-dashboard__kpi-icon">
              <Users size={20} aria-hidden />
            </div>
            <div className="admin-event-dashboard__kpi-data">
              <span className="admin-event-dashboard__kpi-label">{t('admin.eventConsole.registrations')}</span>
              <span className="admin-event-dashboard__kpi-value">{registered}</span>
              <span className="admin-event-dashboard__kpi-subtext">{t('admin.eventDashboard.noSlotLimit')}</span>
            </div>
          </div>
        ) : null}

        <div className="admin-event-dashboard__kpi-card">
          <div className="admin-event-dashboard__kpi-icon">
            <Banknote size={20} aria-hidden />
          </div>
          <div className="admin-event-dashboard__kpi-data">
            <span className="admin-event-dashboard__kpi-label">{t('admin.eventDashboard.revenue')}</span>
            <span className="admin-event-dashboard__kpi-value">{money(revenue, locale)}</span>
            <span className="admin-event-dashboard__kpi-subtext">
              {t('admin.eventDashboard.ticketsIssued', { count: tickets.length })}
            </span>
          </div>
        </div>

        <div className="admin-event-dashboard__kpi-card">
          <div className="admin-event-dashboard__kpi-icon">
            <ScanLine size={20} aria-hidden />
          </div>
          <div className="admin-event-dashboard__kpi-data">
            <span className="admin-event-dashboard__kpi-label">{t('admin.eventDashboard.checkinsLabel')}</span>
            <span className="admin-event-dashboard__kpi-value">{checkins}</span>
            <span className="admin-event-dashboard__kpi-subtext">
              {tickets.length > 0
                ? t('admin.eventDashboard.attendanceRate', { percent: attendanceRate })
                : t('admin.eventDashboard.noAttendanceData')}
            </span>
          </div>
        </div>
      </div>

      <div className="admin-event-dashboard__actions">
        <h3>{t('admin.eventDashboard.quickActions')}</h3>
        <div className="admin-event-dashboard__action-grid">
          <a
            href={buildEventPagePath(event.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-event-dashboard__action-card"
          >
            <ExternalLink size={24} aria-hidden />
            <span>{t('admin.eventDashboard.viewPublicPage')}</span>
          </a>

          <button
            type="button"
            className="admin-event-dashboard__action-card"
            onClick={() => onSelectSection?.('basics')}
          >
            <Pencil size={24} aria-hidden />
            <span>{t('admin.eventConsole.editBasics')}</span>
          </button>

          <button
            type="button"
            className="admin-event-dashboard__action-card"
            onClick={() => onSelectSection?.('structure')}
          >
            <CalendarDays size={24} aria-hidden />
            <span>{t('admin.eventConsole.structure')}</span>
          </button>

          {onManageCheckin ? (
            <button
              type="button"
              className="admin-event-dashboard__action-card"
              onClick={() => onManageCheckin(event)}
            >
              <ScanLine size={24} aria-hidden />
              <span>{t('admin.eventConsole.checkin')}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
