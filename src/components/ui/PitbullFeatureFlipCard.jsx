import { useId, useState } from 'react'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

export default function PitbullFeatureFlipCard({
  flipBackLabel,
  flipHintLabel,
  icon: Icon,
  label,
  value,
}) {
  const [flipped, setFlipped] = useState(false)
  const { reducedMotion } = useMotionConfig()
  const backId = useId()

  function toggle() {
    setFlipped((current) => !current)
  }

  const rootClass = [
    'pitbull-feature-flip',
    flipped ? 'is-flipped' : '',
    reducedMotion ? 'pitbull-feature-flip--static' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={rootClass}>
      <button
        type="button"
        className="pitbull-feature-flip__trigger"
        onClick={toggle}
        aria-expanded={flipped}
        aria-controls={backId}
      >
        <span className="pitbull-feature-flip__inner">
          <span className="pitbull-feature-flip__face pitbull-feature-flip__face--front">
            <span className="pitbull-feature-flip__icon" aria-hidden>
              <Icon size={22} strokeWidth={1.6} />
            </span>
            <span className="pitbull-feature-flip__label">{label}</span>
            <span className="pitbull-feature-flip__hint">{flipHintLabel}</span>
          </span>
          <span className="pitbull-feature-flip__face pitbull-feature-flip__face--back" id={backId}>
            <span className="pitbull-feature-flip__back-label">{label}</span>
            <p className="pitbull-feature-flip__detail">{value}</p>
            <span className="pitbull-feature-flip__hint">{flipBackLabel}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
