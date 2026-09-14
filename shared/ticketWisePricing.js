/**
 * Precio en USD de una compra de entradas — PLU ARG
 *
 * Wise cobra en dólares y el catálogo de entradas está en pesos. Hasta acá el
 * monto salía siempre de convertir el total en ARS por el dólar blue
 * configurado (`shared/wisePricing.js`), redondeando para arriba en saltos de
 * USD 5. Sirve como piso, pero no es un precio: nadie decide cuánto sale una
 * entrada para el exterior mirando una división.
 *
 * Ahora cada tipo de entrada —y cada beneficio— puede declarar su propio
 * `wisePrice` en USD al lado del precio en ARS. Si TODO lo que se está
 * comprando tiene su USD cargado, el total es la suma exacta de esos montos.
 * Si falta alguno, se vuelve a la conversión sobre el total en pesos: mezclar
 * un precio decidido con uno derivado daría un número que no es ninguno de los
 * dos, y el comprador vería un total que el panel no muestra en ningún lado.
 *
 * Un ítem gratis (ARS 0) no necesita USD propio: aporta cero y no arrastra a
 * toda la orden a la conversión.
 *
 * Vive en `shared/` porque lo usan las dos puntas: la pantalla pública arma el
 * total que muestra antes de pagar y la API arma el que efectivamente guarda.
 * Si cada lado lo calculara por su cuenta, el comprador elegiría Wise viendo un
 * precio y recibiría la instrucción de transferir otro.
 */

import { arsToWiseUsd } from './wisePricing.js'

/** USD cargado a mano, o `null` si el ítem no tiene precio propio. */
export function configuredTicketWiseUsd(item) {
  const value = Number(item?.wisePrice)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.trunc(value)
}

function indexById(entries) {
  const map = new Map()
  for (const entry of entries ?? []) {
    if (entry?.id != null) map.set(String(entry.id), entry)
  }
  return map
}

function arsOf(item) {
  const value = Number(item?.price)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * @param {Array<{ticketTypeId: string, addonIds?: string[]}>} attendees
 * @param {{ticketTypes?: Array, addons?: Array}} catalog Filas con `id`,
 *   `price` (ARS) y `wisePrice` (USD, opcional).
 * @param {Record<string, unknown>} [env] Para la conversión de respaldo.
 * @returns {{arsTotal: number, amount: number, currency: 'USD',
 *   source: 'configured'|'converted', missing: Array<{kind: string, id: string, label: string}>}}
 * @throws {Error} Si un asistente pide un tipo de entrada que no está en el catálogo.
 */
export function resolveTicketOrderWisePricing(attendees, catalog = {}, env = {}) {
  const types = indexById(catalog.ticketTypes)
  const addons = indexById(catalog.addons)

  let arsTotal = 0
  let configuredUsd = 0
  const missing = []
  const seen = new Set()

  const noteMissing = (kind, item) => {
    const key = `${kind}:${item.id}`
    if (seen.has(key)) return
    seen.add(key)
    missing.push({ kind, id: String(item.id), label: String(item.name ?? item.label ?? '') })
  }

  for (const attendee of attendees ?? []) {
    const type = types.get(String(attendee?.ticketTypeId))
    if (!type) throw new Error('TICKET_TYPE_NOT_IN_CATALOG')

    const typeArs = arsOf(type)
    arsTotal += typeArs
    const typeUsd = configuredTicketWiseUsd(type)
    if (typeUsd != null) configuredUsd += typeUsd
    else if (typeArs > 0) noteMissing('ticketType', type)

    for (const addonId of attendee?.addonIds ?? []) {
      const addon = addons.get(String(addonId))
      // Un beneficio que ya no está en el catálogo no se cobra: es la misma
      // tolerancia que aplica `ticket_addons_total_and_snapshot` en la base.
      if (!addon) continue
      const addonArs = arsOf(addon)
      arsTotal += addonArs
      const addonUsd = configuredTicketWiseUsd(addon)
      if (addonUsd != null) configuredUsd += addonUsd
      else if (addonArs > 0) noteMissing('addon', addon)
    }
  }

  if (missing.length === 0 && configuredUsd > 0) {
    return { arsTotal, amount: configuredUsd, currency: 'USD', source: 'configured', missing }
  }
  return {
    arsTotal,
    amount: arsToWiseUsd(arsTotal, env),
    currency: 'USD',
    source: 'converted',
    missing,
  }
}
