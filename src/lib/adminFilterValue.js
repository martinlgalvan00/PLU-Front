/**
 * adminFilterValue.js — PLU ARG
 *
 * Lo que un filtro de `AdminFilterBar` significa, sin importar qué layout lo
 * dibuja (panel apilado, pills+popover o panel único). Vivía duplicado en
 * `AdminFilterBar.jsx` y `AdminFilterPillRow.jsx` -- un tercer layout
 * (`AdminFilterPanel`) es la señal de que el criterio de "¿está activo?" y
 * "¿qué texto muestro?" tiene que salir de un solo lugar antes de que los
 * tres layouts terminen desalineados entre sí.
 */

export function neutralValue(filter) {
  return filter.defaultValue ?? filter.options?.[0]?.[0]
}

export function isFilterActive(filter) {
  if (filter.variant === 'dateRange') {
    return Boolean(filter.value?.from) || Boolean(filter.value?.to)
  }
  return filter.value !== neutralValue(filter)
}

function formatShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/** Texto corto del valor activo de un filtro, para pills y chips. */
export function filterValueText(filter, t) {
  if (filter.variant === 'dateRange') {
    const from = filter.value?.from
    const to = filter.value?.to
    if (from && to) return `${formatShortDate(from)} – ${formatShortDate(to)}`
    if (from) return `${t('admin.filters.registeredFrom')} ${formatShortDate(from)}`
    if (to) return `${t('admin.filters.registeredTo')} ${formatShortDate(to)}`
    return null
  }
  const active = filter.options?.find(([optionValue]) => optionValue === filter.value)
  return active ? active[1] : null
}

/** Tono semántico (`success`/`danger`/`info`) del valor activo, si sus
 * `options` lo declaran en la 4ta posición -- mismo criterio que ya usa
 * `AdminFilterChipGroup` para pintar el chip activo con el color del estado. */
export function filterValueTone(filter) {
  const active = filter.options?.find(([optionValue]) => optionValue === filter.value)
  return active?.[3] ?? null
}
