import { StatusBadge } from '../ui/DataTable.jsx'

export function AdminIdentityCell({ accent = 'celeste', name, sub }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="data-table__identity">
      <span
        className={`data-table__avatar ${accent === 'gold' ? 'data-table__avatar--gold' : ''}`.trim()}
        aria-hidden
      >
        {initial}
      </span>
      <div className="data-table__identity-copy">
        <strong>{name ?? '—'}</strong>
        {sub && <span className="data-table__sub">{sub}</span>}
      </div>
    </div>
  )
}

export function AdminPaymentCell({ amount, status }) {
  if (!status && (!amount || amount === '—')) {
    return <span className="admin-payment-cell__empty">—</span>
  }

  return (
    <div className="admin-payment-cell">
      {status ? <StatusBadge value={status} /> : null}
      {amount && amount !== '—' ? <span className="admin-payment-cell__amount">{amount}</span> : null}
    </div>
  )
}

export function AdminTableActions({ children }) {
  return <div className="admin-table-actions">{children}</div>
}
