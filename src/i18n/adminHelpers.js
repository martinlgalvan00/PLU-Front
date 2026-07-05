const FILTER_LABEL_KEYS = {
  allStatuses: 'admin.filters.allStatuses',
  allExpiring: 'admin.filters.allExpiring',
  expiringSoon: 'admin.filters.expiringSoon',
  membershipActive: 'admin.filters.membershipActive',
  membershipExpired: 'admin.filters.membershipExpired',
  membershipCancelled: 'admin.filters.membershipCancelled',
  paymentApproved: 'admin.filters.paymentApproved',
}

export function translateFilterOptions(options, t) {
  return options.map(([value, labelKey]) => {
    if (labelKey === 'status') {
      return [value, t(`status.${value}`)]
    }

    const key = FILTER_LABEL_KEYS[labelKey]
    return [value, key ? t(key) : t(`status.${value}`)]
  })
}

export function formatRecordCount(t, filteredCount, totalCount) {
  if (filteredCount === totalCount) {
    const key = totalCount === 1 ? 'admin.records.one' : 'admin.records.many'
    return t(key, { count: totalCount })
  }

  return t('admin.records.filtered', { filtered: filteredCount, total: totalCount })
}

export const METRIC_LABEL_KEYS = {
  athletes: 'admin.metrics.athletes',
  activeMemberships: 'admin.metrics.activeMemberships',
  registrations: 'admin.metrics.registrations',
  pendingPayments: 'admin.metrics.pendingPayments',
  confirmed: 'admin.metrics.confirmed',
  observed: 'admin.metrics.observed',
  activeEvents: 'admin.metrics.activeEvents',
  expiringSoon: 'admin.metrics.expiringSoon',
}
