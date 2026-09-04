import { BarChart3, Users, Banknote, ScanLine, ExternalLink, CalendarDays } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { money } from '../../lib/format'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import { TICKETS_PATH } from '../../lib/ticketsRoute.js'
import { buildSecurityGatePath } from '../../lib/securityGateRoute.js'

export default function AdminEventDashboard({ event, tickets = [], onManageCheckin, onSelectSection }) {
  const { t, locale } = useI18n()

  const registered = Number(event.registered) || 0
  const slots = Number(event.slots) || 0
  const fillPercent = slots > 0 ? Math.round((registered / slots) * 100) : 0
  const remaining = Math.max(0, slots - registered)

  // Example KPI calculations (these would normally come from the backend or be derived accurately)
  const revenue = tickets.reduce((sum, ticket) => sum + (Number(ticket.amountPaid) || 0), 0)
  const checkins = tickets.filter(t => t.checkedInAt).length

  return (
    <div className="admin-event-dashboard">
      <div className="admin-event-dashboard__kpis">
        <div className="admin-event-dashboard__kpi-card">
          <div className="admin-event-dashboard__kpi-icon">
            <Users size={20} />
          </div>
          <div className="admin-event-dashboard__kpi-data">
            <span className="admin-event-dashboard__kpi-label">{t('admin.eventDashboard.registrations', 'Inscripciones')}</span>
            <span className="admin-event-dashboard__kpi-value">{registered}</span>
            <span className="admin-event-dashboard__kpi-subtext">
              {slots > 0 ? `${remaining} cupos restantes (${fillPercent}%)` : 'Sin límite de cupo'}
            </span>
          </div>
        </div>

        <div className="admin-event-dashboard__kpi-card">
          <div className="admin-event-dashboard__kpi-icon">
            <Banknote size={20} />
          </div>
          <div className="admin-event-dashboard__kpi-data">
            <span className="admin-event-dashboard__kpi-label">{t('admin.eventDashboard.revenue', 'Recaudación')}</span>
            <span className="admin-event-dashboard__kpi-value">{money(revenue, locale)}</span>
            <span className="admin-event-dashboard__kpi-subtext">
              En base a {tickets.length} entradas emitidas
            </span>
          </div>
        </div>

        <div className="admin-event-dashboard__kpi-card">
          <div className="admin-event-dashboard__kpi-icon">
            <ScanLine size={20} />
          </div>
          <div className="admin-event-dashboard__kpi-data">
            <span className="admin-event-dashboard__kpi-label">{t('admin.eventDashboard.checkins', 'Check-ins')}</span>
            <span className="admin-event-dashboard__kpi-value">{checkins}</span>
            <span className="admin-event-dashboard__kpi-subtext">
              {tickets.length > 0 ? `${Math.round((checkins / tickets.length) * 100)}% de asistencia` : 'Sin datos'}
            </span>
          </div>
        </div>
      </div>

      <div className="admin-event-dashboard__actions">
        <h3>{t('admin.eventDashboard.quickActions', 'Acciones Rápidas')}</h3>
        <div className="admin-event-dashboard__action-grid">
          <a
            href={buildEventPagePath(event.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="admin-event-dashboard__action-card"
          >
            <ExternalLink size={24} />
            <span>Ver página pública</span>
          </a>
          
          <button 
            className="admin-event-dashboard__action-card"
            onClick={() => onSelectSection?.('basics')}
          >
            <BarChart3 size={24} />
            <span>Editar Datos Básicos</span>
          </button>
          
          <button 
            className="admin-event-dashboard__action-card"
            onClick={() => onSelectSection?.('structure')}
          >
            <CalendarDays size={24} />
            <span>Configurar Cronograma</span>
          </button>
        </div>
      </div>
    </div>
  )
}
