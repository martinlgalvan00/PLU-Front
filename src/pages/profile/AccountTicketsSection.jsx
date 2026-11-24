import { useI18n } from '../../i18n/I18nProvider.jsx'
import AccountTicketWallets from '../../components/ui/AccountTicketWallets.jsx'
import { useAccountTickets } from '../../hooks/useAccountTickets.js'

export default function AccountTicketsSection({ onNavigate, session = null }) {
  const { t } = useI18n()
  const accountTickets = useAccountTickets(session)

  const hasTickets = accountTickets.status === 'ready' && accountTickets.wallets.length > 0

  return (
    <section id="account-tickets" className="account-section account-section--neutral">
      <div className="account-section__heading account-section__heading--simple">
        <div>
          <span>{t('account.tickets.eyebrow')}</span>
          <h2>{t('account.tickets.title')}</h2>
        </div>
      </div>
      <p className="account-section__lead">{t('account.tickets.lead')}</p>
      {accountTickets.status === 'loading' ? (
        <p className="account-empty__lead" role="status">
          {t('account.tickets.loading')}
        </p>
      ) : null}
      {accountTickets.status === 'error' ? (
        <p className="account-empty__lead" role="alert">
          {t('account.tickets.error')}
        </p>
      ) : null}
      {accountTickets.status === 'idle' ||
      (accountTickets.status === 'ready' && accountTickets.wallets.length === 0) ? (
        <div className="account-empty">
          <p className="account-empty__title">{t('account.tickets.emptyTitle')}</p>
          <p className="account-empty__lead">{t('account.tickets.emptyLead')}</p>
          {onNavigate ? (
            <button
              className="account-empty__action"
              type="button"
              onClick={() => onNavigate('events')}
            >
              {t('account.tickets.emptyAction')}
            </button>
          ) : null}
        </div>
      ) : null}
      <AccountTicketWallets className="account-tickets__list" wallets={accountTickets.wallets} />
    </section>
  )
}
