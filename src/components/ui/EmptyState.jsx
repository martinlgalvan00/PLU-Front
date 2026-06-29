export default function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state">
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
