/**
 * ¿Se ofrece la credencial en 3D? Solo con WebGL, sin "reducir movimiento" y
 * fuera de los equipos que el MotionProvider midió como de gama baja
 * (`data-motion-tier="low"`). En el resto queda la credencial plana, que es
 * la misma información.
 */
export function supportsCredential3D() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  if (document.documentElement.dataset.motionTier === 'low') return false
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}
