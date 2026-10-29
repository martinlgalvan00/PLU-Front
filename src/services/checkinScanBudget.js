import { CHECKIN_SYNC } from '../lib/checkinSyncConfig.js'

/**
 * Resuelve un escaneo de puerta sin hacer esperar la fila a un request colgado.
 *
 * Con señal, el servidor gana si contesta dentro de `scanBudgetMs`. Si no,
 * se devuelve la foto local y `onNetwork` recibe el veredicto real cuando
 * llega: el servidor sigue siendo quien decide si el ingreso vale.
 * Sin señal no se abre el request.
 */
export async function resolveDoorScan({
  online,
  budgetMs = CHECKIN_SYNC.scanBudgetMs,
  readLocal,
  readNetwork,
  onNetwork,
}) {
  if (!online) {
    const local = await Promise.resolve()
      .then(() => readLocal())
      .catch(() => null)
    return { source: 'local', local }
  }

  let timeoutId
  const budget = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ source: 'budget' }), budgetMs)
  })
  const networkTask = Promise.resolve()
    .then(() => readNetwork())
    .then(
      (value) => ({ source: 'network', value }),
      (error) => ({ source: 'network-error', error }),
    )

  const first = await Promise.race([networkTask, budget])
  clearTimeout(timeoutId)

  if (first.source === 'network' || first.source === 'network-error') {
    return first
  }

  // Recién ahora se toca la foto: un escaneo que la red resolvió al toque
  // no abre IndexedDB.
  const local = await Promise.resolve()
    .then(() => readLocal())
    .catch(() => null)
  if (!local) return networkTask

  networkTask.then((result) => {
    onNetwork?.(result)
  })
  return { source: 'local', local }
}
