export default function AuditTimeline({ items = [] }) {
  if (!items.length) {
    return <p className="audit-timeline__empty">Sin registros de auditoría.</p>
  }

  return (
    <ol className="audit-timeline">
      {items.map((item) => (
        <li key={item.id} className="audit-timeline__item">
          <span className="audit-timeline__dot" aria-hidden />
          <div className="audit-timeline__body">
            <div className="audit-timeline__meta">
              <time dateTime={item.createdAt}>{item.createdAtLabel ?? item.createdAt}</time>
              {item.actor && <span>{item.actor}</span>}
            </div>
            <strong>{item.action}</strong>
            {item.detail && <p>{item.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}
