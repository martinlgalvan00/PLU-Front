/**
 * Registro de cachés en memoria de los servicios, para vaciarlos todos juntos
 * (tests y Storybook, entre caso y caso). No importa nada a propósito: quien lo
 * use no carga de rebote ningún servicio ni `api.js`.
 *
 * El conjunto vive en `globalThis` para sobrevivir a `vi.resetModules()`: una
 * copia nueva del servicio se anota en el mismo lugar que la anterior.
 */
const resets = (globalThis.__pluMemoryCacheResets ??= new Set())

export function registerMemoryCache(reset) {
  resets.add(reset)
}

export function resetMemoryCaches() {
  resets.forEach((reset) => reset())
}
