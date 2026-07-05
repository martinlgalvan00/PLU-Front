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
