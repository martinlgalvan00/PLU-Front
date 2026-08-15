/**
 * Doble de lectura de interruptores para las suites que ejercitan el canal
 * manual (transferencia y efectivo).
 *
 * Desde que el canal manual de afiliación e inscripción es opt-in explícito
 * (`assertManualChannelEnabled`: sólo abre con `=== true`), la fila real de la
 * organización lo tiene apagado a propósito — el lanzamiento admite únicamente
 * Mercado Pago. Un test que necesita crear una orden manual para probar otra
 * cosa (idempotencia, cupo, aprobación, credencial) tiene que declarar esa
 * precondición en vez de heredarla de la base compartida, que además cambia
 * mientras `platformFeatureToggles.integration.test.js` corre en paralelo.
 *
 * Sólo se fijan los dos canales manuales: el resto queda `undefined`, que es
 * abierto por default para altas y validación.
 */
export function manualChannelsOpen(overrides = {}) {
  return {
    get: async () => ({
      membershipManualEnabled: true,
      registrationManualEnabled: true,
      ...overrides,
    }),
  }
}
