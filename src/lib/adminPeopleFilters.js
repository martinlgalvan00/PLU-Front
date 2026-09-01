export function normalizeAdminFacetValue(value) {
  if (!value) return ''
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

export function buildAdminFacetOptions(items, getValue, allLabel) {
  const values = new Map()

  for (const item of items) {
    const label = String(getValue(item) ?? '').trim()
    if (!label) continue
    const value = normalizeAdminFacetValue(label)
    const current = values.get(value)
    values.set(value, {
      count: (current?.count ?? 0) + 1,
      label: current?.label ?? label,
    })
  }

  return [
    ['all', allLabel, items.length],
    ...[...values.entries()]
      .sort(([, left], [, right]) => left.label.localeCompare(right.label, 'es'))
      .map(([value, entry]) => [value, entry.label, entry.count]),
  ]
}
