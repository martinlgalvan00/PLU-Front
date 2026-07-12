/**
 * Parsea totales de podio tipo "582.5 kg" para AnimatedNumber.
 */
export function parseAthleteTotal(total) {
  const raw = String(total ?? '').trim()
  const match = raw.match(/^([\d]+(?:[.,]\d+)?)\s*(.*)$/)

  if (!match) {
    return { value: 0, suffix: raw, valid: false }
  }

  const value = Number.parseFloat(match[1].replace(',', '.'))
  const unit = match[2]?.trim()
  const suffix = unit ? ` ${unit}` : ''

  return {
    value: Number.isFinite(value) ? value : 0,
    suffix,
    valid: Number.isFinite(value),
  }
}
