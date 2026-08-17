import { useEffect, useRef } from 'react'

/**
 * Hook to translate vertical mouse wheel scrolling into horizontal scrolling
 * for scrollable containers that hide their scrollbars on desktop.
 * 
 * @returns {React.RefObject} A ref to attach to the scroll container or a wrapper.
 */
export function useHorizontalScroll() {
  const elRef = useRef(null)

  useEffect(() => {
    const el = elRef.current
    if (!el) return

    const handleWheel = (e) => {
      // Find the actual scrollable container if the ref is on a wrapper
      // Specifically useful for Ant Design Tables where the wrapper is passed the ref
      // but the scrollable container is nested inside.
      const scrollContainer = 
        el.querySelector('.ant-table-body') || 
        el.querySelector('.ant-table-content') || 
        el

      const hasHorizontalScroll = scrollContainer.scrollWidth > scrollContainer.clientWidth
      const hasVerticalScroll = scrollContainer.scrollHeight > scrollContainer.clientHeight + 2

      // Let native trackpad scrolling flow naturally
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return

      // Translate vertical mouse wheel to horizontal scroll if there's horizontal overflow
      // but no vertical overflow (or we are at the edge).
      if (hasHorizontalScroll && !hasVerticalScroll && e.deltaY !== 0) {
        e.preventDefault()
        scrollContainer.scrollLeft += e.deltaY
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  return elRef
}
