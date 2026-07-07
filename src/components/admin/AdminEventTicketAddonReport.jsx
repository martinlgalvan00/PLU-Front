import { useMemo } from 'react'
import { CheckCircle2, Clock3, Gift, Wallet } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { buildEventTicketAddonReport } from '../../lib/ticketAddons.js'

export default function AdminEventTicketAddonReport({ event, tickets }) {
  const { locale, t } = useI18n()
  const report = useMemo(
    () => buildEventTicketAddonReport(tickets, event.slug, event.pricing?.ticketAddons ?? []),
    [event.pricing?.ticketAddons, event.slug, tickets],
  )

  if (event.pricing?.ticketsEnabled === false) return null
  if (!report.hasCatalog && !report.hasActivity) return null

  const metrics = [
    {
      icon: Gift,
      label: t('admin.eventEditor.ticketAddonReport.sold'),
      value: String(report.sold),
    },
    {
      icon: CheckCircle2,
      label: t('admin.eventEditor.ticketAddonReport.redeemed'),
      value: String(report.redeemed),
    },
    {
      icon: Clock3,
      label: t('admin.eventEditor.ticketAddonReport.pending'),
      value: String(report.pending),
      highlight: report.pending > 0,
    },
    {
      icon: Wallet,
      label: t('admin.eventEditor.ticketAddonReport.revenue'),
      value: money(report.revenue, locale),
    },
  ]

  return (
    <div className="admin-event-addon-report">
      <div className="admin-event-addon-report__head">
        <Gift size={14} aria-hidden />
        <strong>{t('admin.eventEditor.ticketAddonReport.title')}</strong>
      </div>

      {!report.hasActivity ? (
        <p className="admin-event-addon-report__empty">{t('admin.eventEditor.ticketAddonReport.empty')}</p>
      ) : (
        <>
          <dl className="admin-event-addon-report__metrics">
            {metrics.map(({ highlight, icon: Icon, label, value }) => (
              <div
                key={label}
                className={`admin-event-addon-report__metric${highlight ? ' admin-event-addon-report__metric--alert' : ''}`}
              >
                <dt>
                  <Icon size={12} aria-hidden />
                  {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {report.rows.length > 0 ? (
            <div className="admin-event-addon-report__table-wrap">
              <table className="admin-event-addon-report__table">
                <thead>
                  <tr>
                    <th scope="col">{t('admin.eventEditor.ticketAddonReport.colBenefit')}</th>
                    <th scope="col">{t('admin.eventEditor.ticketAddonReport.colSold')}</th>
                    <th scope="col">{t('admin.eventEditor.ticketAddonReport.colRedeemed')}</th>
                    <th scope="col">{t('admin.eventEditor.ticketAddonReport.colPending')}</th>
                    <th scope="col">{t('admin.eventEditor.ticketAddonReport.colRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.id} className={row.pending > 0 ? 'has-pending' : ''}>
                      <th scope="row">
                        <span>{row.label}</span>
                        <small>{money(row.price, locale)}</small>
                      </th>
                      <td>{row.sold}</td>
                      <td>{row.redeemed}</td>
                      <td>{row.pending}</td>
                      <td>{money(row.revenue, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {report.pendingTickets.length > 0 ? (
            <details className="admin-event-addon-report__pending">
              <summary>
                {t('admin.eventEditor.ticketAddonReport.pendingList', {
                  count: report.pendingTickets.length,
                })}
              </summary>
              <ul>
                {report.pendingTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <strong>{ticket.attendeeName}</strong>
                    <span>
                      {ticket.ticketCode} · {ticket.attendeeDni}
                    </span>
                    <em>{ticket.addons.map((addon) => addon.label).join(' · ')}</em>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  )
}
