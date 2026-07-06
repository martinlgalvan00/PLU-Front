export default function CapacityBar({ current, total, label = 'Cupos ocupados', compact = false }) {
  const progress = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className={`capacity-widget${compact ? ' capacity-widget--compact' : ''}`}>
      <div className="capacity-widget__header">
        <span>{label}</span>
        <strong>
          {compact ? (
            <>
              {current}/{total} · {progress}%
            </>
          ) : (
            `${progress}%`
          )}
        </strong>
      </div>
      <div className="capacity-bar">
        <div className="capacity-bar__fill" style={{ width: `${progress}%` }} />
      </div>
      {!compact && (
        <small>
          {current} de {total} plazas
        </small>
      )}
    </div>
  )
}
