export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state__icon" aria-hidden>
          <Icon size={28} strokeWidth={1.5} />
        </span>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn btn--small" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
