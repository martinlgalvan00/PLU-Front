import '../../styles/components/buyer-tickets-wallet.css'
import BuyerTicketsWallet from './BuyerTicketsWallet.jsx'

export default function AccountTicketWallets({ wallets = [], className = '' }) {
  if (!wallets.length) return null
  return (
    <div className={['account-ticket-list', className].filter(Boolean).join(' ')}>
      {wallets.map((wallet) => (
        <BuyerTicketsWallet
          key={wallet.key}
          event={wallet.event}
          orderStatus={wallet.order?.status}
          tickets={wallet.tickets}
        />
      ))}
    </div>
  )
}
