import { apiDelete, apiGet, apiPost } from '../lib/api.js'

function mapDismissal(row) {
  if (!row) return null
  return {
    itemKey: row.itemKey,
    itemType: row.itemType,
    dismissedBy: row.dismissedBy ?? null,
    dismissedAt: row.dismissedAt ?? null,
  }
}

export async function fetchDismissedQueueItems() {
  const result = await apiGet('/api/admin-queue')
  return (result ?? []).map(mapDismissal)
}

export async function dismissQueueItem({ itemKey, itemType }) {
  const result = await apiPost('/api/admin-queue', { itemKey, itemType })
  return mapDismissal(result.dismissed)
}

export async function undismissQueueItem(itemKey) {
  const result = await apiDelete(`/api/admin-queue/${encodeURIComponent(itemKey)}`)
  return result.restored
}
