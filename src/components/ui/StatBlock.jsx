export default function StatBlock({ value, label }) {
  return (
    <div className="stat-block surface-card">
      <strong className="stat-block__value">{value}</strong>
      <span className="stat-block__label">{label}</span>
    </div>
  )
}
