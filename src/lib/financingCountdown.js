const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * Cuenta regresiva del plazo de financiamiento, contra el reloj real.
 *
 * Compartida entre la declaración del pago manual (`ManualPaymentConfirmation`)
 * y la credencial (`QrCredentialSection`): las dos leen el mismo
 * `financedPaymentDueAt` de la orden y tienen que decir exactamente lo mismo,
 * una recién declarado y la otra en cualquier visita posterior mientras el
 * plazo siga abierto.
 */
export function computeFinancingRemaining(iso) {
  if (!iso) return null
  const due = new Date(iso).getTime()
  if (Number.isNaN(due)) return null
  const diffMs = due - Date.now()
  if (diffMs <= 0) return { expired: true, days: 0, hours: 0 }
  return {
    expired: false,
    days: Math.floor(diffMs / DAY_MS),
    hours: Math.floor((diffMs % DAY_MS) / HOUR_MS),
  }
}

// El `t` de este proyecto no pluraliza solo (ver `i18n/translate.js`): cada
// llamado elige entre la clave `_one` y `_other` a mano, como ya hace
// `attendeesFix` en tickets.
function pluralize(t, base, count) {
  return t(`${base}_${count === 1 ? 'one' : 'other'}`, { count })
}

export function formatFinancingCountdown(remaining, t) {
  if (!remaining) return ''
  const base = 'payments.manualConfirmation.'
  if (remaining.expired) return t(`${base}financedCountdownExpiring`)
  const days = pluralize(t, `${base}financedDaysUnit`, remaining.days)
  const hours = pluralize(t, `${base}financedHoursUnit`, remaining.hours)
  if (remaining.days > 0 && remaining.hours > 0) {
    return t(`${base}financedCountdownDaysHours`, { days, hours })
  }
  if (remaining.days > 0) return t(`${base}financedCountdownDaysOnly`, { days })
  if (remaining.hours > 0) return t(`${base}financedCountdownHoursOnly`, { hours })
  return t(`${base}financedCountdownExpiring`)
}
