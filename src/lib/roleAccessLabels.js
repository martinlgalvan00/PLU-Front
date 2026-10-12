/**
 * Etiquetas de la matriz de roles. Salen del copy de i18n y, si una clave
 * todavía no existe (un módulo nuevo del catálogo), del texto del propio
 * catálogo: nunca se muestra la clave cruda.
 */

/** Traducción con salida al texto del catálogo si la clave todavía no existe. */
export function translateOr(t, key, fallback) {
  const value = t(key)
  return value === key ? fallback : value
}

export function moduleName(t, entry) {
  return translateOr(t, `admin.roles.modules.${entry.module}`, entry.label)
}

export function moduleHint(t, entry) {
  return translateOr(t, `admin.roles.moduleHints.${entry.module}`, '')
}

/** "1 usuario" / "N usuarios": el copy no tiene plurales, se elige la clave. */
export function usersLabel(t, count) {
  const total = Number(count ?? 0)
  return total === 1
    ? t('admin.roles.usersCountOne')
    : t('admin.roles.usersCount', { count: total })
}

export function areaName(t, areaId) {
  return translateOr(t, `admin.roles.areas.${areaId}`, areaId)
}
