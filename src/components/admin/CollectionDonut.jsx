const RADIUS = 52
const STROKE = 11
const SIZE = (RADIUS + STROKE) * 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP = 3

export default function CollectionDonut({ collected = 0, pending = 0, rate = 0, label }) {
  const total = collected + pending
  const collectedRatio = total > 0 ? collected / total : 0
  const pendingRatio = total > 0 ? pending / total : 0

  const collectedArc = Math.max(CIRCUMFERENCE * collectedRatio - (pendingRatio > 0 ? GAP : 0), 0)
  const pendingArc = Math.max(CIRCUMFERENCE * pendingRatio - (collectedRatio > 0 ? GAP : 0), 0)

  return (
    <div className="admin-donut">
      <svg
        aria-hidden
        className="admin-donut__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
      >
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            className="admin-donut__track"
            cx={SIZE / 2}
            cy={SIZE / 2}
            fill="none"
            r={RADIUS}
            strokeWidth={STROKE}
          />
          {pendingArc > 0 && (
            <circle
              className="admin-donut__arc admin-donut__arc--pending"
              cx={SIZE / 2}
              cy={SIZE / 2}
              fill="none"
              r={RADIUS}
              strokeDasharray={`${pendingArc} ${CIRCUMFERENCE - pendingArc}`}
              strokeDashoffset={-(CIRCUMFERENCE * collectedRatio)}
              strokeLinecap="round"
              strokeWidth={STROKE}
            />
          )}
          {collectedArc > 0 && (
            <circle
              className="admin-donut__arc admin-donut__arc--collected"
              cx={SIZE / 2}
              cy={SIZE / 2}
              fill="none"
              r={RADIUS}
              strokeDasharray={`${collectedArc} ${CIRCUMFERENCE - collectedArc}`}
              strokeLinecap="round"
              strokeWidth={STROKE}
            />
          )}
        </g>
      </svg>
      <div className="admin-donut__center">
        <strong className="admin-donut__value">{rate}%</strong>
        {label ? <span className="admin-donut__label">{label}</span> : null}
      </div>
    </div>
  )
}
