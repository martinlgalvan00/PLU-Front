/**
 * Medios de cobro de un evento, por concepto — PLU ARG
 *
 * `events.payment_channel_overrides` nació como un solo juego de interruptores
 * para todo el evento, y alcanzaba mientras inscripción y entradas se cobraran
 * igual. No es el caso: el efectivo en Pitbull tiene sentido para un atleta que
 * pasa por el gimnasio y ninguno para un espectador que compra una entrada
 * desde el celular. Cerrarlo para uno cerraba el del otro.
 *
 * Ahora el override es `{concepto: {canal: bool}}`. La forma vieja —plana— se
 * sigue leyendo y significa "lo mismo para los dos conceptos", que es
 * exactamente lo que hacía: las filas que ya existen no necesitan migración y
 * siguen comportándose igual.
 *
 * La matriz de plataforma sigue siendo el techo: acá sólo se puede cerrar. Un
 * canal que Finanzas cerró no se reabre desde el evento.
 *
 * Vive en `lib/` y no en el servidor porque lo comparten el panel y las rutas:
 * que cada lado normalizara distinto sería la forma silenciosa de ofrecer un
 * medio de pago que después rebota con 409 al confirmar.
 */

export const EVENT_PAYMENT_CHANNELS = [
  'mercado_pago',
  'bank_transfer',
  'cash_pitbull',
  'wise_transfer',
]

/** Membership no entra: se cobra sólo con la matriz de plataforma. */
export const EVENT_PAYMENT_CONCEPTS = ['registration', 'ticket']

/** Banderas de un concepto. No inventa: sin ningún booleano conocido, `null`. */
function normalizeChannelFlags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const flags = {}
  let any = false
  for (const channel of EVENT_PAYMENT_CHANNELS) {
    if (typeof raw[channel] === 'boolean') {
      flags[channel] = raw[channel]
      any = true
    }
  }
  return any ? flags : null
}

/**
 * Acepta las dos formas y devuelve siempre `{concepto: {canal: bool}}` o
 * `null` (heredar plataforma en todo).
 *
 * Si vienen claves de concepto, mandan ellas y una bandera suelta al lado se
 * ignora: mezclar las dos formas en el mismo objeto no significa nada y
 * adivinar sería peor que descartarlo.
 */
export function normalizeEventPaymentChannelOverrides(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null

  const byConcept = {}
  let anyConcept = false
  for (const concept of EVENT_PAYMENT_CONCEPTS) {
    const flags = normalizeChannelFlags(raw[concept])
    if (flags) {
      byConcept[concept] = flags
      anyConcept = true
    }
  }
  if (anyConcept) return byConcept

  const flat = normalizeChannelFlags(raw)
  if (!flat) return null
  return Object.fromEntries(EVENT_PAYMENT_CONCEPTS.map((concept) => [concept, { ...flat }]))
}

/** Banderas de un concepto, o `null` si ese concepto hereda la plataforma. */
export function eventChannelOverridesFor(overrides, concept) {
  const normalized = normalizeEventPaymentChannelOverrides(overrides)
  if (!normalized) return null
  return normalized[concept] ?? null
}

/** ¿El evento deja abierto este canal para este concepto? */
export function isEventChannelOpenForConcept(overrides, concept, channel) {
  const flags = eventChannelOverridesFor(overrides, concept)
  if (!flags) return true
  return flags[channel] !== false
}

/**
 * ¿Queda abierto en alguno de los dos conceptos?
 *
 * Es la pregunta de los bloques que configuran el canal en sí —el alias de
 * transferencia, el perfil de Mercado Pago—: se siguen necesitando mientras
 * el canal se use en algún lado, aunque esté cerrado para el otro concepto.
 */
export function isEventChannelOpenAnywhere(overrides, channel) {
  const normalized = normalizeEventPaymentChannelOverrides(overrides)
  if (!normalized) return true
  return EVENT_PAYMENT_CONCEPTS.some((concept) => normalized[concept]?.[channel] !== false)
}

/** Canales que el evento deja abiertos para un concepto, en orden canónico. */
export function openEventChannelsFor(overrides, concept) {
  return EVENT_PAYMENT_CHANNELS.filter((channel) =>
    isEventChannelOpenForConcept(overrides, concept, channel),
  )
}

/**
 * Punto de partida al prender "personalizar": todo abierto en los dos
 * conceptos. Arrancar con algo cerrado sería cerrar una venta por el solo
 * hecho de haber tocado un interruptor.
 */
export function allOpenEventPaymentChannelOverrides() {
  return Object.fromEntries(
    EVENT_PAYMENT_CONCEPTS.map((concept) => [
      concept,
      Object.fromEntries(EVENT_PAYMENT_CHANNELS.map((channel) => [channel, true])),
    ]),
  )
}
