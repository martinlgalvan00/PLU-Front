import { useId } from 'react'
import { m } from 'framer-motion'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'

function resolveBadge(badge) {
  if (badge == null || badge === false) return null
  if (typeof badge === 'object' && !Array.isArray(badge)) {
    const value = badge.value
    if (value == null || value === false || value === '') return null
    return { value, tone: badge.tone || null }
  }
  return { value: badge, tone: null }
}

export default function SegmentedSwitch({ active, ariaLabel, className = '', onChange, options }) {
  const layoutId = useId()
  const { reducedMotion } = useMotionConfig()

  return (
    <div
      className={`segmented-switch ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        '--switch-count': options.length,
      }}
    >
      {options.map(([key, label, shortLabel, badge]) => {
        const displayShort = shortLabel ?? label
        const isActive = active === key
        const resolved = resolveBadge(badge)

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`segmented-switch__option ${isActive ? 'is-active' : ''}${
              resolved?.tone ? ` segmented-switch__option--${resolved.tone}` : ''
            }`}
            onClick={() => onChange(key)}
            style={{ position: 'relative' }}
          >
            {isActive && (
              <m.div
                layoutId={reducedMotion ? undefined : layoutId}
                className="segmented-switch__thumb"
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 480, damping: 34, mass: 0.7 }
                }
                aria-hidden="true"
              />
            )}
            <span
              className="segmented-switch__label segmented-switch__label--full"
              style={{ position: 'relative', zIndex: 1 }}
            >
              {label}
            </span>
            <span
              className="segmented-switch__label segmented-switch__label--short"
              style={{ position: 'relative', zIndex: 1 }}
            >
              {displayShort}
            </span>
            {resolved ? (
              <span
                className={`segmented-switch__badge${
                  resolved.tone ? ` segmented-switch__badge--${resolved.tone}` : ''
                }`}
                style={{ position: 'relative', zIndex: 1 }}
              >
                {resolved.value}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
