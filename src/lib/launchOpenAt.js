/**
 * Countdown de apertura: fuente de verdad = `event.registrationOpensAt` (admin).
 * Reexporta desde registrationSchedule para no romper imports existentes.
 */
export { formatRegistrationOpenMoment, resolveLaunchOpenAt } from './registrationSchedule.js'
