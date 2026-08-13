export type MotionTier = 'high' | 'mid' | 'low'

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
  if (connection?.saveData || (connection?.effectiveType && SLOW_EFFECTIVE_TYPES.has(connection.effectiveType))) {
    score += 1
  }

  if (score >= 3) return 'low'
  if (score >= 1) return 'mid'
  return 'high'
}
