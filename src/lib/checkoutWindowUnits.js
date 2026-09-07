/** Unidades en las que el panel deja cargar un plazo de cobro. */
export const CHECKOUT_WINDOW_UNITS = ['minutes', 'hours', 'days']

const MINUTES_PER_UNIT = Object.freeze({
  minutes: 1,
  hours: 60,
  days: 1440,
})

/**
 * El número que se guarda sigue siendo minutos: es lo que valida la RPC y lo
 * que lee el barrido. Acá sólo se traduce para que quien opera no tenga que
 * pensar 7200 cuando quiere 5 días.
 */
export function toCheckoutWindowMinutes(amount, unit) {
  const value = Number(amount)
  const factor = MINUTES_PER_UNIT[unit]
  if (!Number.isInteger(value) || value <= 0 || !factor) return NaN
  return value * factor
}

/**
 * Elige la unidad más grande que representa el plazo sin residuo. 7200 min
 * se lee como 5 días; 120 min como 2 horas; el resto queda en minutos.
 */
export function splitCheckoutWindowMinutes(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) {
    return { amount: 1, unit: 'minutes' }
  }
  if (value % 1440 === 0) return { amount: value / 1440, unit: 'days' }
  if (value % 60 === 0) return { amount: value / 60, unit: 'hours' }
  return { amount: value, unit: 'minutes' }
}

/** Piso y techo del input, ya en la unidad que está viendo quien edita. */
export function checkoutWindowLimitsInUnit({ min, max }, unit) {
  const factor = MINUTES_PER_UNIT[unit]
  if (!factor) return { min: 1, max: 1 }
  return {
    min: Math.max(1, Math.ceil(min / factor)),
    max: Math.max(1, Math.floor(max / factor)),
  }
}

export function isCheckoutWindowDraftValid(amount, unit, limits) {
  const minutes = toCheckoutWindowMinutes(amount, unit)
  if (!Number.isInteger(minutes)) return false
  return minutes >= limits.min && minutes <= limits.max
}
