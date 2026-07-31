/**
 * concurrency.js — PLU ARG
 *
 * Ejecuta tareas con un límite de paralelismo. Existe por un problema concreto:
 * el aviso de evento recorría la audiencia con un `for` secuencial, así que 500
 * socios eran 500 llamadas HTTP en fila (~100 s) y la función de Vercel se
 * corta a los 60 s (`vercel.json`, `maxDuration`). El anuncio se entregaba a
 * medias y sin forma de saber dónde había quedado.
 *
 * No se paraleliza sin límite: Brevo responde 429 y, peor, se pierde el control
 * de cuántos envíos se disparan contra la cuota diaria de la cuenta.
 */

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit Tareas simultáneas.
 * @param {(item: T, index: number) => Promise<R>} worker
 * @returns {Promise<PromiseSettledResult<R>[]>} Resultados en el orden de entrada.
 */
export async function mapWithConcurrency(items, limit, worker) {
  const list = [...items]
  const results = new Array(list.length)
  const size = Math.max(1, Math.min(limit, list.length))
  let cursor = 0

  async function run() {
    while (cursor < list.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(list[index], index) }
      } catch (reason) {
        // Nunca se propaga: un destinatario que falla no puede cortar el lote.
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: size }, run))
  return results
}
