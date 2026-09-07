/** Evita que la cámara lea dos veces el mismo QR mientras sigue en el recuadro. */
export const SCAN_COOLDOWN_MS = 2200

/**
 * El operador en la puerta no puede perder el QR siguiente porque el anterior
 * todavía está en cooldown. La cámara sí tiene que ignorar el mismo código
 * un par de segundos; un Verificar a mano es intención explícita y pasa.
 */
export function shouldAcceptScan({
  value,
  disabled = false,
  busy = false,
  source = 'camera',
  lastValue = '',
  lastAt = 0,
  now = Date.now(),
  cooldownMs = SCAN_COOLDOWN_MS,
}) {
  if (!value || disabled || busy) return false
  if (source === 'manual') return true
  return lastValue !== value || now - lastAt >= cooldownMs
}
