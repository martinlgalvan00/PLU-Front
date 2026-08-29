import { useEffect, useRef, useState } from 'react'

export default function DetailTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  ariaLabel = 'Secciones del detalle',
}) {
  const listRef = useRef(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = listRef.current
    if (!el) return undefined

    function syncOverflow() {
      setOverflowing(el.scrollWidth > el.clientWidth + 1)
    }

    syncOverflow()
    if (typeof ResizeObserver === 'undefined') return undefined

    const observer = new ResizeObserver(syncOverflow)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tabs])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const active = el.querySelector('[role="tab"][aria-selected="true"]')
    if (!active || typeof active.scrollIntoView !== 'function') return

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    active.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [activeTab])

  return (
    <div
      ref={listRef}
      className={[
        'detail-tabs',
        variant === 'editorial' ? 'detail-tabs--editorial' : '',
        variant === 'glass' ? 'detail-tabs--glass' : '',
        overflowing ? 'is-overflowing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        const showCount = typeof tab.count === 'number'
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={[
              'detail-tabs__tab',
              isActive ? 'is-active' : '',
              showCount && tab.count === 0 ? 'is-empty' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(tab.id)}
          >
            <span className="detail-tabs__label">{tab.label}</span>
            {showCount ? (
              <span
                className="detail-tabs__count"
                data-empty={tab.count === 0 ? 'true' : undefined}
              >
                {tab.count}
              </span>
            ) : null}
            {tab.hasError ? <span className="detail-tabs__error-dot" aria-hidden /> : null}
          </button>
        )
      })}
    </div>
  )
}
