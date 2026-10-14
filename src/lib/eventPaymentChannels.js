/**
 * Medios de cobro de un evento, por concepto — PLU ARG
 *
 * `events.payment_channel_overrides` nació como un solo juego de interruptores
 * para todo el evento, y alcanzaba mientras inscripción y entradas se cobraran
 * igual. No es el caso: el efectivo en el lugar tiene sentido para un atleta que
 * paga en la sede y ninguno para un espectador que compra una entrada
 * desde el celular. Cerrarlo para uno cerraba el del otro.
 *
 * Ahora el override es `{concepto: {canal: bool}}`. La forma vieja —plana— se
 * sigue leyendo y significa "lo mismo para los dos conceptos", que es
 * exactamente lo que hacía: las filas que ya existen no necesitan migración y
 * siguen comportándose igual.
 *
 * La matriz de plataforma es el valor por defecto, no el techo: cada celda del
 * evento puede cerrar un canal (`false`) o abrirlo aunque Finanzas lo tenga
 * cerrado (`'open'`). Sin clave, el evento hereda la plataforma.
 *
 * `true` es la forma heredada de "sin opinión" y se sigue leyendo así: el panel
 * anterior arrancaba la matriz con los cuatro canales en `true` y guardaba eso,
 * así que tomarlo como "abrir" reabriría de golpe canales que Finanzas cerró en
 * eventos ya guardados. Abrir es una decisión nueva y tiene su propio valor.
 *
 * Lo que sí sigue mandando sobre el evento: el maestro de cobros, el alta del
 * concepto (inscripción / entradas) y la pausa de validación.
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

/** Valor que abre un canal que la plataforma tiene cerrado. */
export const EVENT_CHANNEL_OPEN = 'open'

/** Banderas de un concepto. No inventa: sin ningún valor conocido, `null`. */
function normalizeChannelFlags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const flags = {}
  let any = false
  for (const channel of EVENT_PAYMENT_CHANNELS) {
    if (typeof raw[channel] === 'boolean' || raw[channel] === EVENT_CHANNEL_OPEN) {
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

/** ¿El evento abre este canal aunque la plataforma lo tenga cerrado? */
export function isEventChannelForcedOpen(overrides, concept, channel) {
  return eventChannelOverridesFor(overrides, concept)?.[channel] === EVENT_CHANNEL_OPEN
}

/**
 * Estado efectivo de una celda: lo que dice el evento y, si no dice nada, la
 * plataforma. `platformOpen` es la celda cruda de Finanzas (`paymentChannels`).
 */
export function resolveEventChannelState(overrides, concept, channel, platformOpen) {
  const flag = eventChannelOverridesFor(overrides, concept)?.[channel]
  if (flag === false) return false
  if (flag === EVENT_CHANNEL_OPEN) return true
  return platformOpen === true
}

/**
 * Valor a guardar cuando el panel deja la celda en `want` sobre una plataforma
 * en `platformOpen`: sólo se guarda lo que *difiere* de la plataforma. `null`
 * significa "sin clave" (hereda), así el evento sigue lo que Finanzas cambie
 * mañana en las celdas donde no decidió nada.
 */
export function eventChannelFlagFor(want, platformOpen) {
  if (want === (platformOpen === true)) return null
  return want ? EVENT_CHANNEL_OPEN : false
}

/**
 * Pone una celda del override. Devuelve el override nuevo, o `null` si no quedó
 * ninguna decisión del evento (todo hereda).
 */
export function setEventChannelFlag(overrides, concept, channel, flag) {
  const current = normalizeEventPaymentChannelOverrides(overrides) ?? {}
  const nextConcept = { ...(current[concept] ?? {}) }
  if (flag === null) delete nextConcept[channel]
  else nextConcept[channel] = flag
  const next = { ...current }
  if (Object.keys(nextConcept).length) next[concept] = nextConcept
  else delete next[concept]
  return Object.keys(next).length ? next : null
}

/**
 * Los toggles de plataforma con las aperturas del evento ya aplicadas.
 *
 * Es sólo la mitad "abrir": el cierre del evento se aplica después, sobre el
 * resultado (`applyEventPaymentChannelOverrides` y el assert), para conservar
 * sus mensajes propios. Hacerlo sobre los toggles —y no sobre la disponibilidad
 * ya resuelta— deja que el maestro y el alta del concepto sigan mandando: una
 * celda abierta por el evento no reabre una venta que Finanzas pausó entera.
 */
export function applyEventChannelOpens(toggles, overrides) {
  const normalized = normalizeEventPaymentChannelOverrides(overrides)
  if (!normalized || !toggles) return toggles

  let paymentChannels = toggles.paymentChannels
  for (const concept of EVENT_PAYMENT_CONCEPTS) {
    for (const channel of EVENT_PAYMENT_CHANNELS) {
      if (normalized[concept]?.[channel] !== EVENT_CHANNEL_OPEN) continue
      paymentChannels = {
        ...paymentChannels,
        [concept]: { ...paymentChannels?.[concept], [channel]: true },
      }
    }
  }
  return paymentChannels === toggles.paymentChannels ? toggles : { ...toggles, paymentChannels }
}

/** ¿El evento deja abierto este canal para este concepto? (no lo cierra) */
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

/**
 * Canales efectivamente abiertos en un concepto, con la plataforma por
 * defecto: `platformCells` es `{canal: bool}` de Finanzas para ese concepto.
 * A diferencia de `openEventChannelsFor`, cuenta también los que sólo el
 * evento abre y descarta los que la plataforma cierra y el evento no tocó.
 */
export function effectiveEventChannelsFor(overrides, concept, platformCells) {
  return EVENT_PAYMENT_CHANNELS.filter((channel) =>
    resolveEventChannelState(overrides, concept, channel, platformCells?.[channel]),
  )
}

/** Canales que el evento deja abiertos para un concepto, en orden canónico. */
export function openEventChannelsFor(overrides, concept) {
  return EVENT_PAYMENT_CHANNELS.filter((channel) =>
    isEventChannelOpenForConcept(overrides, concept, channel),
  )
}

/**
 * Un pago manual necesita tiempo para llegar a ser una entrada: 24 horas para
 * que el comprador suba el comprobante y hasta 48 para que Administración lo
 * apruebe. Vendido dentro de esa ventana, el QR no alcanza a emitirse antes de
 * que abra la puerta, y lo que queda es una devolución.
 *
 * Por eso los canales que esperan comprobante cierran antes que la venta:
 * Mercado Pago y el efectivo en el lugar siguen hasta `ticketSalesClosesAt`,
 * la transferencia y Wise no.
 *
 * Es una constante y no un campo por evento a propósito: sale de los dos
 * plazos que ya están escritos en el circuito. Hacerla configurable pide una
 * columna nueva, y recién tiene sentido si una organización demuestra que
 * aprueba más rápido.
 */
export const MANUAL_TICKET_LEAD_HOURS = 72

/**
 * Los canales a los que aplica ese corte: los que esperan un comprobante y una
 * aprobación. El efectivo queda afuera porque se paga en la sede y se acredita
 * en el momento, sin demora que cubrir — cerrarlo tres días antes dejaba sin
 * medio a quien justamente quería pagar en el lugar.
 */
export const MANUAL_TICKET_DEADLINE_CHANNELS = Object.freeze(['bank_transfer', 'wise_transfer'])

/** Momento en que dejan de ofrecerse los canales manuales. */
export function manualTicketChannelsCloseAt(startsAt) {
  const start = startsAt ? new Date(startsAt) : null
  if (!start || Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() - MANUAL_TICKET_LEAD_HOURS * 60 * 60 * 1000)
}

/**
 * Sin fecha de inicio no se cierra nada: un evento sin fecha cargada no puede
 * perder la venta por una regla de calendario.
 */
export function manualTicketChannelsOpen(startsAt, now = new Date()) {
  const deadline = manualTicketChannelsCloseAt(startsAt)
  if (!deadline) return true
  return now.getTime() < deadline.getTime()
}

/**
 * Punto de partida del override anterior: los cuatro canales en `true` ("sin
 * opinión") en los dos conceptos. Con el modelo abrir/cerrar ya no hace falta
 * —una celda sin tocar no se guarda—, se conserva para los datos viejos.
 */
export function allOpenEventPaymentChannelOverrides() {
  return Object.fromEntries(
    EVENT_PAYMENT_CONCEPTS.map((concept) => [
      concept,
      Object.fromEntries(EVENT_PAYMENT_CHANNELS.map((channel) => [channel, true])),
    ]),
  )
}
