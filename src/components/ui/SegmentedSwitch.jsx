import { useCallback, useRef } from 'react'

export default function SegmentedSwitch({
  active,
  ariaLabel,
  className = '',
  onChange,
  options,
}) {
  const trackRef = useRef(null)
  const draggingRef = useRef(false)
  const activeIndex = Math.max(0, options.findIndex(([key]) => key === active))

  const indexFromClientX = useCallback(
    (clientX) => {
      const track = trackRef.current
      if (!track) return activeIndex

      const rect = track.getBoundingClientRect()
      const pad = 3
      const innerWidth = rect.width - pad * 2
      const x = Math.min(Math.max(clientX - rect.left - pad, 0), innerWidth)
      const segment = innerWidth / options.length
      return Math.min(options.length - 1, Math.max(0, Math.floor(x / segment)))
    },
    [activeIndex, options.length],
  )

  function selectIndex(index) {
    const next = options[index]?.[0]
    if (next && next !== active) onChange(next)
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return

    draggingRef.current = true
    trackRef.current?.setPointerCapture(event.pointerId)
    trackRef.current?.classList.add('is-dragging')
    selectIndex(indexFromClientX(event.clientX))
  }

  function handlePointerMove(event) {
    if (!draggingRef.current) return
    selectIndex(indexFromClientX(event.clientX))
  }

  function endDrag(event) {
    if (!draggingRef.current) return

    draggingRef.current = false
    trackRef.current?.classList.remove('is-dragging')

    if (trackRef.current?.hasPointerCapture(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={trackRef}
      className={`segmented-switch ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        '--switch-active-index': activeIndex,
        '--switch-count': options.length,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="segmented-switch__thumb" aria-hidden />

      {options.map(([key, label, shortLabel]) => {
        const displayShort = shortLabel ?? label

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            className={`segmented-switch__option ${active === key ? 'is-active' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="segmented-switch__label segmented-switch__label--full">{label}</span>
            <span className="segmented-switch__label segmented-switch__label--short">{displayShort}</span>
          </button>
        )
      })}
    </div>
  )
}
