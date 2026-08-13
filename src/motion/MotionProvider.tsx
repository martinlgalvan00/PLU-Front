/* eslint-disable react-refresh/only-export-components */
import { LazyMotion, domAnimation } from 'motion/react'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getDeviceTier, type MotionTier } from './deviceTier'
import { MOTION_DEFAULT_TRANSITION } from './tokens'
import { useReducedMotion } from './useReducedMotion'

type MotionConfig = {
  reducedMotion: boolean
  tier: MotionTier
  defaultTransition: typeof MOTION_DEFAULT_TRANSITION
}

const MotionConfigContext = createContext<MotionConfig>({
  reducedMotion: false,
  tier: 'high',
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
  const [tier] = useState(getDeviceTier)

  useEffect(() => {
    document.documentElement.setAttribute('data-motion-tier', tier)
  }, [tier])

  const value = useMemo(
    () => ({
      reducedMotion,
      tier,
      defaultTransition: MOTION_DEFAULT_TRANSITION,
    }),
    [reducedMotion, tier],
  )

  return (
    <MotionConfigContext.Provider value={value}>
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfigContext.Provider>
  )
}
