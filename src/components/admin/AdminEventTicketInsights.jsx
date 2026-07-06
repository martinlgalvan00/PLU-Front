import { useMemo } from 'react'
import { BarChart3, ScanLine, Ticket, Wallet } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { buildEventTicketStats } from '../../services/eventAdminService.js'

export default function AdminEventTicketInsights({ event, tickets }) {
  const { locale, t } = useI18n()
  const stats = useMemo(() => buildEventTicketStats(tickets, event.slug), [event.slug, tickets])

  if (event.pricing?.ticketsEnabled === false) {
    return (
      <div className="admin-event-ticket-insights admin-event-ticket-insights--disabled">
        <p>{t('admin.eventEditor.ticketsDisabledNote')}</p>
      </div>
    )
  }

  const metrics = [
    {
      icon: Ticket,
      label: t('admin.eventEditor.ticketSold'),
      value: String(stats.sold),
      sub: t('admin.eventEditor.ticketPending', { count: stats.pending }),
    },
    {
      icon: Wallet,
      label: t('admin.eventEditor.ticketRevenue'),
      value: money(stats.revenue, locale),
    },
    {
      icon: ScanLine,
      label: t('admin.eventEditor.ticketCheckedIn'),
      value: String(stats.checkedIn),
    },
  ]

  return (
    <div className="admin-event-ticket-insights">
      <div className="admin-event-ticket-insights__head">
        <BarChart3 size={14} aria-hidden />
        <strong>{t('admin.eventEditor.ticketInsightsTitle')}</strong>
      </div>

      <dl className="admin-event-ticket-insights__metrics">
        {metrics.map(({ icon: Icon, label, sub, value }) => (
          <div key={label} className="admin-event-ticket-insights__metric">
            <dt>
              <Icon size={12} aria-hidden />
              {label}
            </dt>
            <dd>{value}</dd>
            {sub ? <span className="admin-event-ticket-insights__sub">{sub}</span> : null}
          </div>
        ))}
      </dl>

      <ul className="admin-event-ticket-insights__breakdown" aria-label={t('admin.eventEditor.ticketBreakdownAria')}>
        <li>
          <span>{t('pages.tickets.day1')}</span>
          <strong>{stats.byPass.day1}</strong>
        </li>
        <li>
          <span>{t('pages.tickets.day2')}</span>
          <strong>{stats.byPass.day2}</strong>
        </li>
        <li>
          <span>{t('pages.tickets.bothDays')}</span>
          <strong>{stats.byPass.both}</strong>
        </li>
      </ul>
    </div>
  )
}
