import { useEffect, useRef, useState } from 'react'
import { animate, m } from 'motion/react'
import { MOTION_DURATION } from './tokens'
import { useMotionConfig } from './MotionProvider'

type AnimatedNumberProps = {
  value: number
  className?: string
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
  /** Locale de Intl (`es-AR`). Sin él se usa el del navegador, como siempre. */
  locale?: string
}

function formatValue(value: number, decimals: number, locale?: string): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export default function AnimatedNumber({
  value,
  className = '',
  decimals = 0,
  prefix = '',
  suffix = '',
  duration = MOTION_DURATION.slow,
  locale,
}: AnimatedNumberProps) {
  const { reducedMotion } = useMotionConfig()
  const ref = useRef<HTMLSpanElement>(null)
  // Sin IntersectionObserver (jsdom, SSR, browser viejo) nunca hay "entrada al
  // viewport": el estado inicial ya es el valor final, decidido en render para
  // no depender del timing de effects.
  const [observerAvailable] = useState(() => typeof IntersectionObserver !== 'undefined')
  const [inView, setInView] = useState(!observerAvailable)
  const [display, setDisplay] = useState(() =>
    formatValue(reducedMotion || !observerAvailable ? value : 0, decimals, locale),
  )
  const hasAnimated = useRef(!observerAvailable)

  useEffect(() => {
    const node = ref.current
    if (!node || !observerAvailable) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [observerAvailable])

  useEffect(() => {
    if (!inView) return undefined

    // Después de la entrada el número tiene que seguir al dato: sin esta rama
    // un total que cambia (grilla, KPIs) quedaría congelado en el valor inicial.
    if (hasAnimated.current || reducedMotion) {
      hasAnimated.current = true
      setDisplay(formatValue(value, decimals, locale))
      return undefined
    }
    hasAnimated.current = true

    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(formatValue(latest, decimals, locale)),
    })

    return () => controls.stop()
  }, [inView, value, decimals, duration, reducedMotion, locale])

  return (
    <m.span
      ref={ref}
      className={className.trim() || undefined}
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={inView && !reducedMotion ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: MOTION_DURATION.base }}
    >
      {prefix}
      {display}
      {suffix}
    </m.span>
  )
}
