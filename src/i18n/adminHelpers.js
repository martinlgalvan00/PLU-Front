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

/**
 * Etiquetas de la auditoría.
 *
 * `translate()` parte la clave por puntos, así que una hoja con punto adentro
 * (`membership.activated`, `payment.applied`) nunca se resuelve con `t()`. Las
 * acciones y los campos de metadata vienen así desde `domain_audit_logs`, de
 * modo que se buscan directamente en el diccionario y se cae al valor crudo
 * cuando una RPC nueva todavía no tiene copy.
 */
export function auditLabels(messages) {
  const audit = messages?.admin?.audit ?? {}

  return {
    action: (value) => audit.actions?.[value] ?? value,
    actor: (value) => audit.actors?.[value] ?? value,
    field: (value) => audit.fields?.[value] ?? value,
  }
}
