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
      tone: 'celeste',
    },
    {
      icon: Wallet,
      label: t('admin.eventEditor.ticketRevenue'),
      value: money(stats.revenue, locale),
      tone: 'gold',
    },
    {
      icon: ScanLine,
      label: t('admin.eventEditor.ticketCheckedIn'),
      value: String(stats.checkedIn),
      tone: 'success',
    },
  ]

  const breakdown = stats.byTicketType.map((row) => ({ label: row.name, value: row.count }))

  return (
    <div className="admin-event-ticket-insights">
      <div className="admin-event-ticket-insights__head">
        <span className="admin-event-ticket-insights__stripe" aria-hidden />
        <BarChart3 size={14} aria-hidden />
        <strong>{t('admin.eventEditor.ticketInsightsTitle')}</strong>
      </div>

      <dl className="admin-event-ticket-insights__metrics">
        {metrics.map(({ icon: Icon, label, sub, tone, value }) => (
          <div
            key={label}
            className={`admin-event-ticket-insights__metric admin-event-ticket-insights__metric--${tone}`}
          >
            <dt>
              <span className="admin-event-ticket-insights__icon" aria-hidden>
                <Icon size={12} />
              </span>
              {label}
            </dt>
            <dd>
              <span className="admin-event-ticket-insights__value">{value}</span>
              {sub ? <span className="admin-event-ticket-insights__sub">{sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="admin-event-ticket-insights__breakdown" aria-label={t('admin.eventEditor.ticketBreakdownAria')}>
        {breakdown.map(({ label, value }) => (
          <li key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
