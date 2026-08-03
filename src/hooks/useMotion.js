import { useEffect, useState } from 'react'

export function useInView(ref) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return undefined
    }

    const bottomInset = Math.max(24, Math.round(window.innerHeight * 0.06))

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      {
        threshold: 0.06,
        rootMargin: `0px 0px -${bottomInset}px 0px`,
      },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  return visible
}

export function useScrolled(threshold = 20) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let rafId = null
    let lastScrolled = null

    function tick() {
      rafId = null
      const next = window.scrollY > threshold
      if (next !== lastScrolled) {
        lastScrolled = next
        setScrolled(next)
      }
    }

    function onScroll() {
      if (rafId == null) rafId = requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [threshold])

  return scrolled
}

/**
 * Parallax muy leve para una imagen de fondo (ej. hero): desplaza
 * `--hero-parallax-shift` en px mientras el elemento está en pantalla, vía
 * rAF (sin re-render). No hace nada si `prefers-reduced-motion: reduce`.
 */
export function useParallaxShift(ref, { strength = 22 } = {}) {
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }

    let rafId = null

    function tick() {
      rafId = null
      const rect = node.getBoundingClientRect()
      const viewportH = window.innerHeight
      if (rect.bottom < 0 || rect.top > viewportH) return
      const progress = 1 - Math.min(1, Math.max(0, rect.top / viewportH))
      const shift = (progress - 0.5) * strength
      node.style.setProperty('--hero-parallax-shift', `${shift.toFixed(1)}px`)
    }

    function onScroll() {
      if (rafId == null) rafId = requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
      node.style.removeProperty('--hero-parallax-shift')
    }
  }, [ref, strength])
}

/**
 * Parallax por cursor para un panel: mientras el puntero se mueve sobre el
 * nodo, escribe su posición normalizada en CSS vars (sin re-render, vía rAF)
 * para que el CSS mueva capas (spotlight, pieza 3D, copy) en profundidad:
 *   --reel-mx / --reel-my : [-1..1] (centro = 0)
 *   --reel-mpx / --reel-mpy : 0%..100% (posición cruda, útil para gradientes)
 * Al salir vuelve a 0 (la suavidad la da la transición CSS). No hace nada si
 * `prefers-reduced-motion: reduce` o el puntero es coarse (touch), para no
 * molestar en mobile.
 */
export function usePointerParallax(ref) {
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(pointer: coarse)').matches
    ) {
      return undefined
    }

    let rafId = null
    let pending = null

    function tick() {
      rafId = null
      if (!pending) return
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const px = Math.min(1, Math.max(0, (pending.x - rect.left) / rect.width))
      const py = Math.min(1, Math.max(0, (pending.y - rect.top) / rect.height))
      node.style.setProperty('--reel-mx', (px * 2 - 1).toFixed(3))
      node.style.setProperty('--reel-my', (py * 2 - 1).toFixed(3))
      node.style.setProperty('--reel-mpx', `${(px * 100).toFixed(2)}%`)
      node.style.setProperty('--reel-mpy', `${(py * 100).toFixed(2)}%`)
    }

    function onMove(event) {
      pending = { x: event.clientX, y: event.clientY }
      if (rafId == null) rafId = requestAnimationFrame(tick)
    }

    function reset() {
      pending = null
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      node.style.setProperty('--reel-mx', '0')
      node.style.setProperty('--reel-my', '0')
      node.style.setProperty('--reel-mpx', '50%')
      node.style.setProperty('--reel-mpy', '50%')
    }

    reset()
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', reset)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', reset)
      if (rafId != null) cancelAnimationFrame(rafId)
      node.style.removeProperty('--reel-mx')
      node.style.removeProperty('--reel-my')
      node.style.removeProperty('--reel-mpx')
      node.style.removeProperty('--reel-mpy')
    }
  }, [ref])
}

/**
 * Indicador compartido que se desliza entre elementos activos (nav, tabs) en
 * vez de aparecer/desaparecer en cada uno. Mide el hijo `.is-active` dentro
 * de containerRef y escribe --indicator-x/--indicator-scale/--indicator-opacity
 * sin re-render; el CSS solo anima `transform` (nunca width/left) leyendo esas
 * vars. Se re-mide cuando cambian `deps` (ej. la vista activa) o al resize.
 */
export function useSlidingIndicator(containerRef, deps = [], selector = '.is-active') {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    function measure() {
      const active = container.querySelector(selector)
      if (!active) {
        container.style.setProperty('--indicator-opacity', '0')
        return
      }
      const containerRect = container.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      container.style.setProperty('--indicator-x', `${(activeRect.left - containerRect.left).toFixed(1)}px`)
      container.style.setProperty('--indicator-scale', activeRect.width.toFixed(1))
      container.style.setProperty('--indicator-opacity', '1')
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * Scroll del header: actualiza CSS vars en cada frame (sin re-render) y solo
 * re-renderiza React al cruzar el umbral (para isOverHero / clases).
 *
 * @param {React.RefObject<HTMLElement|null>} shellRef
 * @param {{ range?: number, threshold?: number, autoHide?: boolean }} [options]
 *   `autoHide` (default true): esconde el header al scrollear hacia abajo.
 *   El nav institucional flotante lo apaga para quedar siempre usable.
 */
export function useHeaderScroll(shellRef, { range = 80, threshold = 80, autoHide = true } = {}) {
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return undefined

    let rafId = null
    let lastScrolled = null
    let lastHidden = null
    let lastY = window.scrollY

    function tick() {
      rafId = null
      const y = window.scrollY
      const progress = Math.min(1, Math.max(0, y / range))

      shell.style.setProperty('--header-scroll-progress', progress.toFixed(4))
      shell.style.setProperty('--header-scroll-y', `${Math.round(y)}px`)

      const nextScrolled = progress >= 0.99 || y > threshold
      if (nextScrolled !== lastScrolled) {
        lastScrolled = nextScrolled
        setScrolled(nextScrolled)
      }

      if (!autoHide) {
        if (lastHidden) {
          lastHidden = false
          setHidden(false)
        }
        lastY = Math.max(0, y)
        return
      }

      const isScrollingDown = y > lastY && y > threshold + 20
      const isScrollingUp = y < lastY || y < threshold

      let nextHidden = lastHidden ?? false
      if (isScrollingDown) nextHidden = true
      else if (isScrollingUp) nextHidden = false

      if (nextHidden !== lastHidden) {
        lastHidden = nextHidden
        setHidden(nextHidden)
      }

      lastY = Math.max(0, y)
    }

    function onScroll() {
      if (rafId == null) rafId = requestAnimationFrame(tick)
    }

    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId != null) cancelAnimationFrame(rafId)
      shell.style.removeProperty('--header-scroll-progress')
      shell.style.removeProperty('--header-scroll-y')
    }
  }, [shellRef, range, threshold, autoHide])

  return { scrolled, hidden }
}
