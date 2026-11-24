import { ChevronRight, ExternalLink } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider'
import { money } from '../../lib/format'
import { buildEventPagePath } from '../../lib/eventPageRoute.js'
import '../../styles/pages/admin-event-dashboard.css'

/**
 * Resumen del evento: las cifras que se miran todos los días y el acceso a la
 * página pública. La venta de inscripciones (si se puede vender y qué falta)
 * va arriba, en el control de venta; acá van los números.
 *
 * - Inscriptos: una sola cifra contra el cupo. Antes "Ocupación" e
 *   "Inscripciones" eran dos cifras de lo mismo que, sin la lista de
 *   inscripciones cargada, se contradecían (46/180 y "0 confirmadas").
 * - Entradas y Check-ins: solo si el evento vende entradas o ya emitió
 *   alguna. "Recaudación" sumaba solo entradas de público y se leía como la
 *   plata del evento.
 */
export default function AdminEventDashboard({
  event,
  registrationCounts = null,
  tickets = [],
}) {
  const { t, locale } = useI18n()

  const registered = Number(event.registered) || registrationCounts?.total || 0
  const slots = Number(event.slots) || 0
  const remaining = Math.max(0, slots - registered)
  const fillPercent = slots > 0 ? Math.round((registered / slots) * 100) : 0

  const pendingRegs = registrationCounts?.pendiente_pago ?? 0
  const confirmedRegs = registrationCounts?.confirmada ?? 0
  // El desglose solo cuando la lista de inscripciones está cargada y cuadra.
  const hasBreakdown = confirmedRegs + pendingRegs > 0

  const revenue = tickets.reduce((sum, ticket) => sum + (Number(ticket.amountPaid) || 0), 0)
  const pendingTickets = tickets.filter((ticket) =>
    ['creado', 'pendiente'].includes(String(ticket.status ?? '').toLowerCase()),
  ).length
  const checkins = tickets.filter((ticket) => ticket.checkedInAt).length
  const attendanceRate = tickets.length > 0 ? Math.round((checkins / tickets.length) * 100) : 0
  const showTickets = event.pricing?.ticketsEnabled === true || tickets.length > 0

  return (
    <div className="admin-event-dashboard">
      <dl
        className={`admin-event-dashboard__figures admin-event-dashboard__figures--ops${
          showTickets ? '' : ' admin-event-dashboard__figures--single'
        }`}
      >
        <div className="admin-event-dashboard__figure admin-event-dashboard__figure--lead">
          <dt>{t('admin.eventDashboard.registeredLabel')}</dt>
          <dd>
            <strong>{registered}</strong>
            {slots > 0 ? <span>/{slots}</span> : null}
          </dd>
          <small>
            {slots > 0
              ? t('admin.eventDashboard.occupancyNote', { percent: fillPercent, remaining })
              : t('admin.eventDashboard.noSlotLimit')}
            {hasBreakdown ? (
              <>
                <br />
                {t('admin.eventDashboard.registrationsNote', {
                  confirmed: confirmedRegs,
                  pending: pendingRegs,
                })}
              </>
            ) : null}
          </small>
        </div>

        {showTickets ? (
          <div className="admin-event-dashboard__figure">
            <dt>{t('admin.eventDashboard.ticketsLabel')}</dt>
            <dd>
              <strong>{money(revenue, locale)}</strong>
            </dd>
            <small>
              {pendingTickets > 0
                ? t('admin.eventDashboard.ticketsIssuedPending', {
                    count: tickets.length,
                    pending: pendingTickets,
                  })
                : t('admin.eventDashboard.ticketsIssued', { count: tickets.length })}
            </small>
          </div>
        ) : null}

        {showTickets ? (
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
        ) : null}
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
