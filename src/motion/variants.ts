import type { Transition, Variants } from 'motion/react'
import {
  MOTION_DEFAULT_TRANSITION,
  MOTION_DISTANCE,
  MOTION_DURATION,
  MOTION_EASE,
  MOTION_STAGGER,
} from './tokens'

const revealTransition = (duration: number = MOTION_DURATION.reveal, delay: number = 0): Transition => ({
  duration,
  ease: MOTION_EASE.out,
  delay,
})

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: revealTransition() },
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE.md },
  visible: { opacity: 1, y: 0, transition: revealTransition() },
}

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -MOTION_DISTANCE.md },
  visible: { opacity: 1, y: 0, transition: revealTransition() },
}

export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -MOTION_DISTANCE.lg },
  visible: { opacity: 1, x: 0, transition: revealTransition() },
}

export const fadeRight: Variants = {
  hidden: { opacity: 0, x: MOTION_DISTANCE.lg },
  visible: { opacity: 1, x: 0, transition: revealTransition() },
}

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: revealTransition() },
}

/** Entrada editorial de sección — opacity + translateY + scale sutil.
 * Usada por bloques compuestos (varias columnas/tarjetas) que deben
 * aparecer como una sola composición, no como cards sueltas. */
export const editorialRise: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: MOTION_EASE.out },
  },
}

export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE.md },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.reveal, ease: MOTION_EASE.out },
  },
}

export const modalTransition: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard },
  },
}

export const drawerTransition: Variants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
  exit: {
    x: '100%',
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.inOut },
  },
}

export const drawerBackdropTransition: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: MOTION_DURATION.base } },
  exit: { opacity: 0, transition: { duration: MOTION_DURATION.fast } },
}

export const pageSectionTransition: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.page, ease: MOTION_EASE.out },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE.standard },
  },
}

export const accordionPanelTransition: Variants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASE.out },
  },
}

export const sectionHeaderEyebrow: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: revealTransition(MOTION_DURATION.base, 0) },
}

export const sectionHeaderTitle: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: revealTransition(MOTION_DURATION.reveal, 0.06) },
}

export const sectionHeaderLead: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: revealTransition(MOTION_DURATION.reveal, 0.12) },
}

export const sectionHeaderRule: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out, delay: 0.18 },
  },
}

export const heroSequenceItem: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE.lg },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.out },
  },
}

export const heroTitleLine: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE.hero },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.cinematic, ease: MOTION_EASE.out },
  },
}

export const heroStaggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: MOTION_STAGGER.step,
      delayChildren: MOTION_STAGGER.delayChildren,
    },
  },
}

export const heroActionsItem: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE.md },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATION.slow,
      ease: MOTION_EASE.out,
      delay: 0.28,
    },
  },
}

export const heroProofItem: Variants = {
  hidden: { opacity: 0, y: MOTION_DISTANCE.md, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: MOTION_DURATION.cinematic,
      ease: MOTION_EASE.out,
      delay: 0.36,
    },
  },
}

export type RevealDirection =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'fade'
  | 'scale'
  | 'from-left'
  | 'from-right'
  | 'zoom'
  | 'rise'

const REVEAL_VARIANT_MAP: Record<RevealDirection, Variants> = {
  up: fadeUp,
  down: fadeDown,
  left: fadeLeft,
  right: fadeRight,
  fade: fadeIn,
  scale: scaleIn,
  'from-left': fadeLeft,
  'from-right': fadeRight,
  zoom: scaleIn,
  rise: editorialRise,
}

export function getRevealVariant(direction: RevealDirection = 'up'): Variants {
  return REVEAL_VARIANT_MAP[direction] ?? fadeUp
}

export function getStaggerItemVariant(direction: RevealDirection = 'up'): Variants {
  return getRevealVariant(direction)
}

export { MOTION_DEFAULT_TRANSITION }
