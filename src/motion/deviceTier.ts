export type MotionTier = 'high' | 'mid' | 'low'

const TIER_RANK: Record<MotionTier, number> = { high: 0, mid: 1, low: 2 }

type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g'
}

type NavigatorWithCapabilityHints = Navigator & {
  deviceMemory?: number
  connection?: NetworkInformationLike
}

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g', '3g'])

/**
 * Capacidad estimada del dispositivo para sostener motion continuo (loops,
 * blur, drag). No reactivo a propósito: hardwareConcurrency/deviceMemory no
 * cambian durante la sesión. Cuando una señal no está disponible (Safari no
 * expone deviceMemory/connection) no suma al score — nunca degradar por
 * falta de dato, solo por señal explícita de equipo limitado.
 */
export function getDeviceTier(): MotionTier {
  if (typeof navigator === 'undefined') return 'high'

  const nav = navigator as NavigatorWithCapabilityHints
  let score = 0

  const cores = nav.hardwareConcurrency
  if (typeof cores === 'number') {
    if (cores <= 4) score += 2
    else if (cores <= 6) score += 1
  }

  const memory = nav.deviceMemory
  if (typeof memory === 'number') {
    if (memory <= 4) score += 2
    else if (memory <= 6) score += 1
  }

  const connection = nav.connection
  if (
    connection?.saveData ||
    (connection?.effectiveType && SLOW_EFFECTIVE_TYPES.has(connection.effectiveType))
  ) {
    score += 1
  }

  if (score >= 3) return 'low'
  if (score >= 1) return 'mid'
  return 'high'
}

/** Conserva siempre el tier más restrictivo: una medición runtime puede
 * degradar la experiencia, pero nunca volver a encender efectos costosos en
 * medio de una sesión. */
export function getLowerMotionTier(current: MotionTier, candidate: MotionTier): MotionTier {
  return TIER_RANK[candidate] > TIER_RANK[current] ? candidate : current
}

/** Clasifica una muestra real de frames. Esto cubre PCs con GPU/driver lento
 * que igualmente reportan muchos cores y memoria, el caso que los hints de
 * `navigator` no pueden detectar. */
export function classifyFrameDurations(durations: number[]): MotionTier {
  const usable = durations.filter(
    (duration) => Number.isFinite(duration) && duration >= 4 && duration <= 250,
  )
  if (usable.length < 12) return 'high'

  const sorted = [...usable].sort((a, b) => a - b)
  const mean = usable.reduce((total, duration) => total + duration, 0) / usable.length
  const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]
  const droppedRatio = usable.filter((duration) => duration >= 28).length / usable.length

  if (p75 >= 26 || mean >= 24 || droppedRatio >= 0.25) return 'low'
  if (p75 >= 19 || mean >= 19) return 'mid'
  return 'high'
}

type RuntimeTierOptions = {
  delayMs?: number
  frameCount?: number
  longTaskWindowMs?: number
}

/**
 * Observa brevemente la fluidez real de arranque. No deja un monitor
 * permanente: toma una muestra de rAF y long tasks, informa sólo degradaciones
 * y libera todos sus recursos después de la ventana inicial.
 */
export function observeRuntimeMotionTier(
  onTier: (tier: MotionTier) => void,
  { delayMs = 600, frameCount = 36, longTaskWindowMs = 8000 }: RuntimeTierOptions = {},
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  let cancelled = false
  let frameId: number | null = null
  let startTimer: number | null = null
  let stopTimer: number | null = null
  let previousFrame: number | null = null
  const frameDurations: number[] = []
  const longTasks: number[] = []
  let observer: PerformanceObserver | null = null

  const finishFrames = () => {
    if (cancelled) return
    const tier = classifyFrameDurations(frameDurations)
    if (tier !== 'high') onTier(tier)
  }

  const sampleFrame = (now: number) => {
    if (cancelled) return
    if (document.visibilityState !== 'visible') {
      previousFrame = null
      frameId = window.requestAnimationFrame(sampleFrame)
      return
    }
    if (previousFrame != null) frameDurations.push(now - previousFrame)
    previousFrame = now
    if (frameDurations.length >= frameCount) finishFrames()
    else frameId = window.requestAnimationFrame(sampleFrame)
  }

  const begin = () => {
    if (!cancelled) frameId = window.requestAnimationFrame(sampleFrame)
  }
  startTimer = window.setTimeout(begin, delayMs)

  if ('PerformanceObserver' in window) {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration)
      })
      observer.observe({ type: 'longtask', buffered: true })
      stopTimer = window.setTimeout(() => {
        observer?.disconnect()
        observer = null
        const total = longTasks.reduce((sum, duration) => sum + duration, 0)
        if (longTasks.length >= 4 || total >= 320) onTier('low')
        else if (longTasks.length >= 2 || total >= 140) onTier('mid')
      }, longTaskWindowMs)
    } catch {
      observer = null
    }
  }

  return () => {
    cancelled = true
    if (frameId != null) window.cancelAnimationFrame(frameId)
    if (startTimer != null) window.clearTimeout(startTimer)
    if (stopTimer != null) window.clearTimeout(stopTimer)
    observer?.disconnect()
  }
}
