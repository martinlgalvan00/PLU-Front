/** Estados que un operador busca cuando algo salió mal. */
export const AUDIT_PROBLEM_STATUSES = new Set([
  'failed',
  'rejected',
  'rechazado',
  'bounced',
  'error',
  'partial',
  'cancelled',
  'canceled',
  'suppressed',
])

/**
 * Opciones de filtro de estado sin etiquetas duplicadas (ej. rejected + rechazado).
 * Prioriza valores problemáticos y marca tono para chips.
 */
export function buildAuditStatusFilterOptions(facets, statusLabel, allLabel) {
  const seenLabels = new Set()
  const unique = []

  for (const value of facets.statuses ?? []) {
    const label = statusLabel(value)
    const labelKey = label.trim().toLowerCase()
    if (seenLabels.has(labelKey)) continue
    seenLabels.add(labelKey)
    unique.push([
      value,
      label,
      undefined,
      AUDIT_PROBLEM_STATUSES.has(String(value).toLowerCase()) ? 'danger' : undefined,
    ])
  }

  unique.sort((left, right) => {
    const leftProblem = AUDIT_PROBLEM_STATUSES.has(String(left[0]).toLowerCase())
    const rightProblem = AUDIT_PROBLEM_STATUSES.has(String(right[0]).toLowerCase())
    if (leftProblem !== rightProblem) return leftProblem ? -1 : 1
    return left[1].localeCompare(right[1], 'es')
  })

  return [['all', allLabel], ...unique]
}
