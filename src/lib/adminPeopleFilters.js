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

/** Divisiones en las que compite una inscripción: la que paga el 100% y, si hay, la segunda. */
export function registrationDivisions(registration) {
  return [registration?.division, registration?.secondaryDivision]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

/** Filtro por división: quien compite en dos aparece en las dos listas. */
export function registrationMatchesDivision(registration, filterValue) {
  if (!filterValue || filterValue === 'all') return true
  return registrationDivisions(registration).some(
    (division) => normalizeAdminFacetValue(division) === filterValue,
  )
}

/** Opciones del filtro de división; cuenta a cada atleta en cada división que compite. */
export function buildAdminDivisionOptions(registrations, allLabel) {
  const values = new Map()
  for (const registration of registrations) {
    for (const label of registrationDivisions(registration)) {
      const value = normalizeAdminFacetValue(label)
      const current = values.get(value)
      values.set(value, { count: (current?.count ?? 0) + 1, label: current?.label ?? label })
    }
  }
  return [
    ['all', allLabel, registrations.length],
    ...[...values.entries()]
      .sort(([, left], [, right]) => left.label.localeCompare(right.label, 'es'))
      .map(([value, entry]) => [value, entry.label, entry.count]),
  ]
}
