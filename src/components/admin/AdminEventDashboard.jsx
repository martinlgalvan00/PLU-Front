import { ChevronRight, ExternalLink } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { money } from '../../lib/format'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import '../../styles/pages/admin-event-dashboard.css'

/**
 * Resumen del evento: tres cifras en una franja (ocupación, recaudación,
 * check-ins) y el acceso a la página pública. Las secciones del evento ya son
 * las pestañas de la barra lateral, así que no se repiten acá como atajos.
 */
export default function AdminEventDashboard({ event, tickets = [] }) {
  const { t, locale } = useI18n()

  const registered = Number(event.registered) || 0
  const slots = Number(event.slots) || 0
  const remaining = Math.max(0, slots - registered)
  const fillPercent = slots > 0 ? Math.round((registered / slots) * 100) : 0

  const revenue = tickets.reduce((sum, ticket) => sum + (Number(ticket.amountPaid) || 0), 0)
  const checkins = tickets.filter((ticket) => ticket.checkedInAt).length
  const attendanceRate = tickets.length > 0 ? Math.round((checkins / tickets.length) * 100) : 0

  return (
    <div className="admin-event-dashboard">
      <dl className="admin-event-dashboard__figures">
        <div className="admin-event-dashboard__figure">
          <dt>{t('admin.eventConsole.occupancy')}</dt>
          <dd>
            <strong>{registered}</strong>
            {slots > 0 ? <span>/{slots}</span> : null}
          </dd>
          <small>
            {slots > 0
              ? t('admin.eventDashboard.occupancyNote', { percent: fillPercent, remaining })
              : t('admin.eventDashboard.noSlotLimit')}
          </small>
        </div>

        <div className="admin-event-dashboard__figure">
          <dt>{t('admin.eventDashboard.revenue')}</dt>
          <dd>
            <strong>{money(revenue, locale)}</strong>
          </dd>
          <small>{t('admin.eventDashboard.ticketsIssued', { count: tickets.length })}</small>
        </div>

        <div className="admin-event-dashboard__figure">
          <dt>{t('admin.eventDashboard.checkinsLabel')}</dt>
          <dd>
            <strong>{checkins}</strong>
          </dd>
          <small>
            {tickets.length > 0
              ? t('admin.eventDashboard.attendanceRate', { percent: attendanceRate })
              : t('admin.eventDashboard.noAttendanceData')}
          </small>
        </div>
      </dl>

      {event.slug ? (
        <a
          href={buildEventPagePath(event.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="admin-event-dashboard__public"
        >
          <ExternalLink size={16} aria-hidden />
          <span>{t('admin.eventDashboard.viewPublicPage')}</span>
          <ChevronRight size={16} aria-hidden className="admin-event-dashboard__public-chevron" />
        </a>
      ) : null}
    </div>
  )
}
