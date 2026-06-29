import { normalizeStatus } from './status.js'

function normalizeEntity(entity, statusFields) {
  if (!entity) return entity
  const next = { ...entity }
  for (const field of statusFields) {
    if (field in next) next[field] = normalizeStatus(next[field])
  }
  return next
}

export function normalizeStoredData(data) {
  if (!data) return null

  return {
    ...data,
    athletes: (data.athletes ?? []).map((item) => normalizeEntity(item, ['status'])),
    memberships: (data.memberships ?? []).map((item) =>
      normalizeEntity(item, ['status', 'paymentStatus']),
    ),
    registrations: (data.registrations ?? []).map((item) =>
      normalizeEntity(item, ['status', 'paymentStatus']),
    ),
    payments: (data.payments ?? []).map((item) => normalizeEntity(item, ['status'])),
    createdOrder: data.createdOrder
      ? normalizeEntity(data.createdOrder, ['status'])
      : data.createdOrder,
    auditLogs: data.auditLogs ?? [],
  }
}
