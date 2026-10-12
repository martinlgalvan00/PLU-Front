import { useLayoutEffect, useRef } from 'react'

/**
 * Pestañas de la tienda: texto con un subrayado dorado que se desliza hasta la
 * pestaña activa (transform + ancho medido, sin layout animations). El conteo
 * de cada sección acompaña al nombre. Navegable con flechas.
 */
export default function ShopTabs({ tabs, active, onChange, ariaLabel }) {
  const railRef = useRef(null)
  const buttonRefs = useRef({})

  useLayoutEffect(() => {
    const rail = railRef.current
    const button = buttonRefs.current[active]
    if (!rail || !button) return undefined

    const place = () => {
      rail.style.setProperty('--tab-x', `${button.offsetLeft}px`)
      rail.style.setProperty('--tab-w', `${button.offsetWidth}px`)
    }
    place()
    window.addEventListener('resize', place)
    // Los rótulos cambian de ancho al cargar la tipografía.
    const fonts = document.fonts?.ready?.then(place)
    return () => {
      window.removeEventListener('resize', place)
      void fonts
    }
  }, [active, tabs])

  function handleKeyDown(event, index) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[next].id)
    buttonRefs.current[tabs[next].id]?.focus()
  }

  return (
    <nav className="shop-tabs" aria-label={ariaLabel}>
      <div className="shop-tabs__rail" ref={railRef} role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              buttonRefs.current[tab.id] = node
            }}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            className="shop-tabs__tab"
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{tab.label}</span>
            {tab.count > 0 ? <small>{String(tab.count).padStart(2, '0')}</small> : null}
          </button>
        ))}
        <span className="shop-tabs__indicator" aria-hidden />
      </div>
    </nav>
  )
}
