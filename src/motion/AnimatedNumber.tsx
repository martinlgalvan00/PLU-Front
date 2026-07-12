import { useEffect, useRef, useState } from 'react'
import { animate, m, useInView } from 'motion/react'
import { MOTION_DURATION } from './tokens'
import { useMotionConfig } from './MotionProvider'

type AnimatedNumberProps = {
  value: number
  className?: string
  decimals?: number
  prefix?: string
  suffix?: string
  duration?: number
}

function formatValue(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {
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
}: AnimatedNumberProps) {
  const { reducedMotion } = useMotionConfig()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const [display, setDisplay] = useState(() => formatValue(reducedMotion ? value : 0, decimals))
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!inView || hasAnimated.current) return undefined
    hasAnimated.current = true

    if (reducedMotion) {
      setDisplay(formatValue(value, decimals))
      return undefined
    }

    const controls = animate(0, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(formatValue(latest, decimals)),
    })

    return () => controls.stop()
  }, [inView, value, decimals, duration, reducedMotion])

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
