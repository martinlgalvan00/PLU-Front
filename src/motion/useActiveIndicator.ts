import { useLayoutEffect, useRef, type RefObject } from 'react'
import { MOTION_EASE } from './tokens'

/**
 * Indicador deslizante de la pestaña activa de un tablist.
 *
 * Mide la pestaña activa y deja su caja en variables del contenedor
 * (`--indicator-x`, `--indicator-y`, `--indicator-w` sin unidad para `scaleX`,
 * `--indicator-h`). El CSS dibuja un solo elemento que se mueve con
 * `transform`: la pestaña no cambia de fondo de golpe, el fondo viaja hasta
 * ella y dice de dónde vino.
 *
 * `data-indicator` en el contenedor: `placed` en la primera medición (sin
 * transición, aparece en su lugar) y `ready` desde el cuadro siguiente. Sin
 * medición —jsdom, sin pestaña activa— el atributo no está y las pestañas
 * conservan su estilo activo propio.
 */
export function useActiveIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string | null | undefined,
  selector = '[role="tab"][aria-selected="true"]',
): void {
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    function place() {
      if (!container) return
      const active = container.querySelector<HTMLElement>(selector)
      if (!active || active.offsetWidth === 0) {
        delete container.dataset.indicator
        return
      }
      container.style.setProperty('--indicator-x', `${active.offsetLeft}px`)
      container.style.setProperty('--indicator-y', `${active.offsetTop}px`)
      container.style.setProperty('--indicator-w', String(active.offsetWidth))
      container.style.setProperty('--indicator-h', `${active.offsetHeight}px`)
      if (!container.dataset.indicator) container.dataset.indicator = 'placed'
    }

    place()
    let frame = 0
    if (container.dataset.indicator === 'placed') {
      frame = requestAnimationFrame(() => {
        if (container.dataset.indicator) container.dataset.indicator = 'ready'
      })
    }
    // Cambios de ancho (breakpoint, fuentes cargando, contadores que aparecen)
    // mueven la pestaña sin cambiar `activeKey`.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(container)
    const active = container.querySelector<HTMLElement>(selector)
    if (active) observer?.observe(active)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [activeKey, containerRef, selector])
}

/**
 * Entrada corta del panel al cambiar de pestaña, SIN remontarlo.
 *
 * `MotionTabPanel` anima con `key`, y un `key` nuevo desmonta el árbol: acá
 * adentro vive el editor con cambios sin guardar, y remontarlo los perdía (el
 * mismo bug que tuvo `RouteTransition`). Esto anima el nodo que ya existe con
 * WAAPI: opacidad y 6px, una sola vez por cambio, nunca al montar.
 */
export function usePanelEnter(
  panelRef: RefObject<HTMLElement | null>,
  panelKey: string,
  { disabled = false }: { disabled?: boolean } = {},
): void {
  const previousKey = useRef(panelKey)
  useLayoutEffect(() => {
    if (previousKey.current === panelKey) return
    previousKey.current = panelKey
    const panel = panelRef.current
    if (!panel || disabled || typeof panel.animate !== 'function') return
    panel.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 280, easing: `cubic-bezier(${MOTION_EASE.cinematic.join(',')})` },
    )
  }, [disabled, panelKey, panelRef])
}
