import { useEffect, useRef, useState } from 'react'

function getSectionId(href) {
  return href.replace(/^#/, '')
}

/**
 * SubNav — navegación de sección o barra de tabs.
 *
 * Props:
 *  - items: array de { href, label, shortLabel? }
 *  - mode: 'scroll' (default) | 'tabs'
 *      - 'scroll': observa secciones en página y desplaza suavemente
 *      - 'tabs': botones que llaman a onTabChange(id) — no hace scroll
 *  - activeTabId: id activo controlado (solo en mode='tabs')
 *  - onTabChange: (id: string) => void (solo en mode='tabs')
 */
export default function SubNav({
  className = '',
  items,
  label = 'Navegación de sección',
  mode = 'scroll',
  activeTabId,
  onTabChange,
}) {
  const isTabMode = mode === 'tabs'

  const [scrollActiveId, setScrollActiveId] = useState(() => getSectionId(items[0]?.href ?? ''))
  const innerRef = useRef(null)
  const linkRefs = useRef(new Map())

  const activeId = isTabMode ? (activeTabId ?? getSectionId(items[0]?.href ?? '')) : scrollActiveId

  useEffect(() => {
    if (isTabMode) return undefined

    const sectionIds = items.map((item) => getSectionId(item.href)).filter(Boolean)
    if (!sectionIds.length) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visible[0]?.target.id) {
          setScrollActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-40% 0px -45% 0px',
        threshold: [0, 0.15, 0.35, 0.6],
      },
    )

    sectionIds.forEach((id) => {
      const section = document.getElementById(id)
      if (section) observer.observe(section)
    })

    return () => observer.disconnect()
  }, [items, isTabMode])

  useEffect(() => {
    const link = linkRefs.current.get(activeId)
    const container = innerRef.current
    if (!link || !container) return

    const linkLeft = link.offsetLeft
    const linkRight = linkLeft + link.offsetWidth
    const { scrollLeft, clientWidth } = container

    if (linkLeft < scrollLeft) {
      container.scrollTo({ left: linkLeft - 12, behavior: 'smooth' })
    } else if (linkRight > scrollLeft + clientWidth) {
      container.scrollTo({ left: linkRight - clientWidth + 12, behavior: 'smooth' })
    }
  }, [activeId])

  function handleScrollClick(event, href) {
    event.preventDefault()
    const id = getSectionId(href)
    const section = document.getElementById(id)
    if (!section) return

    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', href)
    setScrollActiveId(id)
  }

  if (isTabMode) {
    return (
      <nav className={`sub-nav ${className}`.trim()} aria-label={label} role="tablist">
        <div className="sub-nav__inner" ref={innerRef}>
          {items.map((item) => {
            const id = getSectionId(item.href)
            const isActive = activeId === id
            const displayShort = item.shortLabel ?? item.label

            return (
              <button
                key={item.href}
                type="button"
                role="tab"
                ref={(node) => {
                  if (node) linkRefs.current.set(id, node)
                  else linkRefs.current.delete(id)
                }}
                className={`sub-nav__link${isActive ? ' is-active' : ''}`}
                aria-selected={isActive}
                onClick={() => onTabChange?.(id)}
              >
                <span className="sub-nav__label sub-nav__label--full">{item.label}</span>
                <span className="sub-nav__label sub-nav__label--short">{displayShort}</span>
              </button>
            )
          })}
        </div>
      </nav>
    )
  }

  return (
    <nav className={`sub-nav ${className}`.trim()} aria-label={label}>
      <div className="sub-nav__inner" ref={innerRef}>
        {items.map((item) => {
          const id = getSectionId(item.href)
          const isActive = activeId === id
          const displayShort = item.shortLabel ?? item.label

          return (
            <a
              key={item.href}
              ref={(node) => {
                if (node) linkRefs.current.set(id, node)
                else linkRefs.current.delete(id)
              }}
              href={item.href}
              className={`sub-nav__link${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'location' : undefined}
              onClick={(event) => handleScrollClick(event, item.href)}
            >
              <span className="sub-nav__label sub-nav__label--full">{item.label}</span>
              <span className="sub-nav__label sub-nav__label--short">{displayShort}</span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
