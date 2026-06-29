export default function CapacityBar({ current, total, label = 'Cupos ocupados' }) {
  const progress = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="capacity-widget">
      <div className="capacity-widget__header">
        <span>{label}</span>
        <strong>{progress}%</strong>
      </div>
      <div className="capacity-bar">
        <div className="capacity-bar__fill" style={{ width: `${progress}%` }} />
      </div>
      <small>
        {current} de {total} plazas
      </small>
    </div>
  )
}
