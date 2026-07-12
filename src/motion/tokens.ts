/** Duraciones en segundos — espejo de variables CSS en motion.css */
export const MOTION_DURATION = {
  instant: 0.1,
  fast: 0.16,
  base: 0.24,
  slow: 0.48,
  cinematic: 0.7,
  reveal: 0.4,
  page: 0.28,
} as const

export const MOTION_DISTANCE = {
  sm: 8,
  md: 16,
  lg: 28,
  hero: 40,
} as const

/** Curvas cubic-bezier para Motion */
export const MOTION_EASE = {
  standard: [0.2, 0, 0, 1] as const,
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.76, 0, 0.24, 1] as const,
  emphasized: [0.2, 0.8, 0.2, 1] as const,
} as const

export const MOTION_DEFAULT_TRANSITION = {
  duration: MOTION_DURATION.base,
  ease: MOTION_EASE.out,
} as const

export const MOTION_STAGGER = {
  step: 0.07,
  stepFast: 0.05,
  delayChildren: 0.08,
} as const

export const MOTION_VIEWPORT = {
  once: true,
  amount: 0.12,
  margin: '0px 0px -8% 0px',
} as const

export const TILT_MAX_DEG = 6
