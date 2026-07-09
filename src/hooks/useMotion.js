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
 * Scroll del header: actualiza CSS vars en cada frame (sin re-render) y solo
 * re-renderiza React al cruzar el umbral (para isOverHero / clases).
 */
export function useHeaderScroll(shellRef, { range = 80, threshold = 80 } = {}) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return undefined

    let rafId = null
    let lastScrolled = null

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
  }, [shellRef, range, threshold])

  return scrolled
}
