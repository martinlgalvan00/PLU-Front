/* eslint-disable react-refresh/only-export-components */
import { LazyMotion, domAnimation } from 'motion/react'
import type { ReactNode } from 'react'
import { createContext, useContext, useMemo } from 'react'
import { MOTION_DEFAULT_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

type MotionConfig = {
  reducedMotion: boolean
  defaultTransition: typeof MOTION_DEFAULT_TRANSITION
}

const MotionConfigContext = createContext<MotionConfig>({
  reducedMotion: false,
  defaultTransition: MOTION_DEFAULT_TRANSITION,
})

export function useMotionConfig(): MotionConfig {
  return useContext(MotionConfigContext)
}

type MotionProviderProps = {
  children: ReactNode
}

export default function MotionProvider({ children }: MotionProviderProps) {
  const reducedMotion = useReducedMotion()

  const value = useMemo(
    () => ({
      reducedMotion,
      defaultTransition: MOTION_DEFAULT_TRANSITION,
    }),
    [reducedMotion],
  )

  return (
    <MotionConfigContext.Provider value={value}>
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfigContext.Provider>
  )
}
