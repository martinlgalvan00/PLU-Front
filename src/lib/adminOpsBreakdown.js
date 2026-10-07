/**
 * Ranking de leyenda del bloque Distribución (admin-ops__mix).
 * Atención operativa: warning / alert / gold (p. ej. afiliaciones por vencer).
 * El `+N` solo comprime estados que no piden intervención.
 */

const ATTENTION_TONES = new Set(['warning', 'alert', 'gold'])

export function isBreakdownAttentionTone(tone) {
  return ATTENTION_TONES.has(tone)
}

/**
 * @param {Array<{ status: string, value: number, tone?: string, amount?: number }>} items
 * @returns {{
 *   activeItems: typeof items,
 *   visibleItems: typeof items,
 *   hiddenItems: typeof items,
 * }}
 */
export function selectBreakdownLegendItems(items = []) {
  const activeItems = items.filter((item) => item.value > 0)
  const rankedItems = [...activeItems].sort((a, b) => b.value - a.value)
  const primaryItem =
    rankedItems.find((item) => !isBreakdownAttentionTone(item.tone)) ?? rankedItems[0]
  const attentionItems = rankedItems.filter(
    (item) => isBreakdownAttentionTone(item.tone) && item.status !== primaryItem?.status,
  )
  const visibleItems = [primaryItem, ...attentionItems]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((entry) => entry.status === item.status) === index)
  const visibleStatuses = new Set(visibleItems.map((item) => item.status))
  const hiddenItems = rankedItems.filter((item) => !visibleStatuses.has(item.status))

  return { activeItems, visibleItems, hiddenItems }
}
