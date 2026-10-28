import { HttpError } from '../../lib/errors.js'
import {
  assertPaymentChannelEnabled,
  MANUAL_PAYMENT_CHANNELS,
  PAYMENT_CHANNELS,
} from '../../services/platformFeatureToggleService.js'
import {
  applyEventChannelOpens,
  EVENT_PAYMENT_CONCEPTS,
  eventChannelOverridesFor,
  isEventChannelForcedOpen,
  isEventChannelOpenAnywhere,
  isEventChannelOpenForConcept,
  MANUAL_TICKET_DEADLINE_CHANNELS,
  MANUAL_TICKET_LEAD_HOURS,
  manualTicketChannelsCloseAt,
  manualTicketChannelsOpen,
  normalizeEventPaymentChannelOverrides,
} from '../../../src/lib/eventPaymentChannels.js'
import { mercadoPagoConnectionStatus } from './mercadoPagoOAuth.js'

const CHANNEL_LABEL = {
  mercado_pago: 'Mercado Pago',
  bank_transfer: 'transferencia',
  cash_pitbull: 'efectivo en el lugar',
  wise_transfer: 'Wise',
}

const CHANNEL_CODE = {
  mercado_pago: 'MERCADO_PAGO',
  bank_transfer: 'BANK_TRANSFER',
  cash_pitbull: 'CASH_PITBULL',
  wise_transfer: 'WISE_TRANSFER',
}

const CONCEPT_LABEL = {
  membership: 'afiliaciones',
  registration: 'inscripciones',
  ticket: 'entradas',
}

/**
 * Normaliza el override guardado en `events.payment_channel_overrides` o
 * mandado por el editor. `null` = heredar plataforma.
 *
 * Devuelve la forma por concepto (`{registration, ticket}`); la forma plana
 * vieja se sigue aceptando y vale para los dos. La lógica está en
 * `src/lib/eventPaymentChannels.js` porque la comparte el panel.
 */
export function normalizePaymentChannelOverrides(raw) {
  return normalizeEventPaymentChannelOverrides(raw)
}

/**
 * ¿El canal queda abierto para este evento?
 * `override[concepto][canal]` si el evento decidió (`false` cierra, `'open'`
 * abre); si no, lo que diga la plataforma.
 *
 * Sin `concept` responde por el evento entero: abierto si lo está en alguno de
 * los dos conceptos. Es lo que necesitan los bloques que configuran el canal
 * (alias de transferencia, perfil de MP), no el checkout.
 */
export function isEventChannelOpen(platformOpen, overrides, channel, concept = null) {
  const forcedOpen = concept
    ? isEventChannelForcedOpen(overrides, concept, channel)
    : EVENT_PAYMENT_CONCEPTS.some((item) => isEventChannelForcedOpen(overrides, item, channel))
  if (!platformOpen && !forcedOpen) return false
  if (concept) return isEventChannelOpenForConcept(overrides, concept, channel)
  return isEventChannelOpenAnywhere(overrides, channel)
}

/**
 * Aplica los CIERRES del evento sobre la availability pública (registration +
 * ticket). Membership no se toca: sigue 100% plataforma.
 *
 * Las aperturas no se resuelven acá: la availability ya viene cruzada con el
 * maestro y el alta del concepto, y desde ahí no se puede saber si una celda
 * en `false` está cerrada por Finanzas o por una pausa general. Se aplican
 * antes, sobre los toggles, con `applyEventChannelOpens`.
 */
export function applyEventPaymentChannelOverrides(availability, overrides) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized || !availability?.paymentChannels) return availability

  const paymentChannels = { ...availability.paymentChannels }
  for (const concept of EVENT_PAYMENT_CONCEPTS) {
    const flags = normalized[concept]
    const base = paymentChannels[concept] ?? {}
    paymentChannels[concept] = Object.fromEntries(
      PAYMENT_CHANNELS.map((channel) => [
        channel,
        Boolean(base[channel]) && flags?.[channel] !== false,
      ]),
    )
  }

  const manual = (concept) =>
    MANUAL_PAYMENT_CHANNELS.some((channel) => paymentChannels[concept]?.[channel])

  // Mismo criterio que la plataforma: si el evento cerró todos los medios de
  // entradas, la venta queda cerrada en vez de mostrar un selector vacío.
  // Inscripción no se toca, porque un cupón puede reabrir un canal manual.
  const ticketChannelOpen = PAYMENT_CHANNELS.some((channel) => paymentChannels.ticket?.[channel])

  return {
    ...availability,
    paymentChannels,
    ticketEnabled: availability.ticketEnabled !== false && ticketChannelOpen,
    registrationManualEnabled: manual('registration'),
    ticketManualEnabled: manual('ticket'),
  }
}

/**
 * Canales manuales de entradas contra el calendario.
 *
 * Una transferencia necesita hasta 72 horas para convertirse en un QR (24 para
 * el comprobante, 48 para la aprobación). Vendida después de ese punto, la
 * entrada no llega: lo que queda es una devolución y alguien en la puerta
 * explicando. Mercado Pago y el efectivo en el lugar no tienen ese problema
 * (se acreditan en el momento) y siguen abiertos hasta que cierra la venta.
 *
 * Es lo mismo que ya hacía el operador a mano, cerrando transferencia unos
 * días antes; acá lo hace el calendario.
 */
export function applyManualTicketDeadline(availability, startsAt, now = new Date()) {
  if (!availability?.paymentChannels?.ticket) return availability
  if (manualTicketChannelsOpen(startsAt, now)) return availability

  const ticket = { ...availability.paymentChannels.ticket }
  for (const channel of MANUAL_TICKET_DEADLINE_CHANNELS) ticket[channel] = false
  const paymentChannels = { ...availability.paymentChannels, ticket }

  return {
    ...availability,
    paymentChannels,
    // El efectivo en el lugar no tiene corte: si sigue abierto, sigue
    // habiendo un medio manual.
    ticketManualEnabled: MANUAL_PAYMENT_CHANNELS.some((channel) => ticket[channel] === true),
    // Si no queda ni Mercado Pago ni efectivo, ya no hay nada que ofrecer.
    ticketEnabled:
      availability.ticketEnabled !== false && PAYMENT_CHANNELS.some((channel) => ticket[channel] === true),
  }
}

/** Corte del lado de la orden: la disponibilidad puede venir de una caché. */
export function assertManualTicketDeadline(channel, startsAt, now = new Date()) {
  if (!MANUAL_TICKET_DEADLINE_CHANNELS.includes(channel)) return
  if (manualTicketChannelsOpen(startsAt, now)) return

  const closeAt = manualTicketChannelsCloseAt(startsAt)
  const label = CHANNEL_LABEL[channel] ?? channel
  throw new HttpError(
    409,
    `El pago con ${label} cierra ${MANUAL_TICKET_LEAD_HOURS} horas antes del evento, porque la acreditación puede demorar hasta 48. Podés pagar con Mercado Pago.`,
    { code: 'TICKET_MANUAL_DEADLINE_PASSED', closesAt: closeAt ? closeAt.toISOString() : null },
  )
}

function trimText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

export function normalizeBankTransferInput(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { alias: '', cbu: '', holder: '', cuit: '', bankName: '' }
  }
  return {
    alias: trimText(raw.alias).slice(0, 120),
    cbu: trimText(raw.cbu).slice(0, 30),
    holder: trimText(raw.holder).slice(0, 160),
    // Viven en la cuenta (perfil), no en columnas del evento.
    cuit: trimText(raw.cuit).slice(0, 20),
    bankName: trimText(raw.bankName).slice(0, 80),
  }
}

function pickBankFields(source) {
  const alias = trimText(source?.alias)
  const cbu = trimText(source?.cbu)
  const holder = trimText(source?.holder)
  if (!alias && !cbu && !holder) return null
  // CUIT y banco solo si están: la forma de siempre no cambia para quien no los cargó.
  const cuit = trimText(source?.cuit)
  const bankName = trimText(source?.bankName)
  return { alias, cbu, holder, ...(cuit ? { cuit } : {}), ...(bankName ? { bankName } : {}) }
}

/**
 * Alias/CBU/titular resueltos para mostrar en checkout.
 * Prioridad: perfil vinculado > columnas del evento > env global.
 * Si el perfil o el evento ya tienen algún dato, no se completa el resto con
 * el env: un alias del meet no puede ir pegado al CBU de la plataforma.
 */
export function resolveBankTransferDetails(eventRow = null, env = process.env, profile = null) {
  const profileConfig =
    profile?.config ??
    eventRow?.bankTransferProfile?.config ??
    eventRow?.payment_profile?.config ??
    null
  const fromProfile = pickBankFields(profileConfig)
  if (fromProfile) return fromProfile

  const fromEvent = pickBankFields({
    alias: eventRow?.bank_transfer_alias ?? eventRow?.bankTransferAlias,
    cbu: eventRow?.bank_transfer_cbu ?? eventRow?.bankTransferCbu,
    holder: eventRow?.bank_transfer_holder ?? eventRow?.bankTransferHolder,
  })
  if (fromEvent) return fromEvent

  return {
    alias: trimText(env.VITE_PAYMENT_TRANSFER_ALIAS ?? env.PAYMENT_TRANSFER_ALIAS),
    cbu: trimText(env.VITE_PAYMENT_TRANSFER_CBU ?? env.PAYMENT_TRANSFER_CBU),
    holder: trimText(env.VITE_PAYMENT_TRANSFER_HOLDER ?? env.PAYMENT_TRANSFER_HOLDER),
  }
}

export function normalizeCashPaymentInput(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { place: '', notes: '', address: '', hours: '', contact: '' }
  }
  return {
    place: trimText(raw.place).slice(0, 160),
    notes: trimText(raw.notes).slice(0, 400),
    address: trimText(raw.address).slice(0, 200),
    hours: trimText(raw.hours).slice(0, 160),
    contact: trimText(raw.contact).slice(0, 120),
  }
}

/**
 * Dónde se paga el efectivo (`cash_pitbull`), para mostrar en checkout.
 * El lugar propio del evento manda; vacío, es la sede del evento. `null` si no
 * hay ninguno de los dos: la pantalla pone su texto genérico.
 */
export function resolveCashPaymentDetails(eventRow = null) {
  const venue = [trimText(eventRow?.venue), trimText(eventRow?.location)]
    .filter(Boolean)
    .join(' · ')
  const ownPlace = trimText(eventRow?.cash_payment_place)
  // Sin dirección propia, la de la sede solo si el lugar ES la sede: un
  // gimnasio distinto con la dirección del estadio mandaría a otro lado.
  const address =
    trimText(eventRow?.cash_payment_address) ||
    (ownPlace ? '' : trimText(eventRow?.venue_address)) ||
    null
  const hours = trimText(eventRow?.cash_payment_hours)
  const contact = trimText(eventRow?.cash_payment_contact)
  return {
    place: ownPlace || venue || null,
    notes: trimText(eventRow?.cash_payment_notes) || null,
    // Solo si existen: la forma de siempre no cambia para quien no los cargó.
    ...(address ? { address } : {}),
    ...(hours ? { hours } : {}),
    ...(contact ? { contact } : {}),
  }
}

export const CASH_PAYMENT_PLACE_REQUIRED_CODE = 'EVENT_CASH_PAYMENT_PLACE_REQUIRED'

export const CASH_PAYMENT_PLACE_REQUIRED_MESSAGE =
  'El efectivo está abierto para este evento pero no tiene dónde cobrarse: el evento no tiene sede cargada ni un lugar propio para el efectivo. Cargá el lugar en Ventas → Cobro, o cerrá el efectivo para este evento.'

/**
 * Si el evento personaliza canales y deja el efectivo abierto, el comprador
 * tiene que saber a dónde ir: un lugar propio o, a falta de uno, la sede del
 * evento. Mismo contrato que `checkEventBankTransferReady`: `null` si está
 * todo bien o `{ code, message, field }`, y la ruta decide si bloquea (evento
 * publicado) o avisa (evento oculto).
 */
export function checkEventCashPaymentReady({ overrides, cashPayment, event } = {}) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized) return null
  if (!isEventChannelOpenAnywhere(normalized, 'cash_pitbull')) return null

  const { place } = resolveCashPaymentDetails({
    venue: event?.venue,
    location: event?.location,
    cash_payment_place: normalizeCashPaymentInput(cashPayment).place,
  })
  if (place) return null
  return {
    code: CASH_PAYMENT_PLACE_REQUIRED_CODE,
    message: CASH_PAYMENT_PLACE_REQUIRED_MESSAGE,
    field: 'cashPayment.place',
  }
}

/** El 400 de un lugar de efectivo faltante, con el campo que hay que completar. */
export function cashPaymentIssueError(issue) {
  return new HttpError(400, issue.message, {
    code: issue.code,
    fields: { [issue.field]: issue.message },
  })
}

export const BANK_TRANSFER_ALIAS_REQUIRED_CODE ='EVENT_BANK_TRANSFER_ALIAS_REQUIRED'

export const BANK_TRANSFER_ALIAS_REQUIRED_MESSAGE =
  'La transferencia está abierta para este evento pero no tiene a dónde cobrar: ni perfil de cobro, ni alias propio, ni un alias global configurado. Elegí un perfil o cargá un alias en Ventas → Cobro, o cerrá la transferencia para este evento.'

/**
 * Si el evento personaliza canales y deja la transferencia abierta, tiene que
 * haber un destino de cobro (perfil, evento o env). Devuelve `null` si está
 * todo bien o `{ code, message, field }` si falta.
 *
 * Es un chequeo y no un `throw` para que la ruta decida qué hacer: un evento
 * oculto se puede guardar incompleto (se avisa), uno publicado no.
 */
export function checkEventBankTransferReady({
  overrides,
  bankTransfer,
  bankTransferProfileId = null,
  profile = null,
  env = process.env,
} = {}) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized) return null
  // Alcanza con que la transferencia siga abierta en alguno de los dos
  // conceptos: el alias es uno solo para todo el evento.
  if (!isEventChannelOpenAnywhere(normalized, 'bank_transfer')) return null

  const details = resolveBankTransferDetails(
    {
      bank_transfer_alias: bankTransfer?.alias,
      bank_transfer_cbu: bankTransfer?.cbu,
      bank_transfer_holder: bankTransfer?.holder,
      bank_transfer_profile_id: bankTransferProfileId,
    },
    env,
    profile,
  )
  if (details.alias) return null
  return {
    code: BANK_TRANSFER_ALIAS_REQUIRED_CODE,
    message: BANK_TRANSFER_ALIAS_REQUIRED_MESSAGE,
    field: 'bankTransferProfileId',
  }
}

/** El 400 de un destino de cobro faltante, con el campo que hay que completar. */
export function bankTransferIssueError(issue) {
  return new HttpError(400, issue.message, {
    code: issue.code,
    fields: { [issue.field]: issue.message },
  })
}

/**
 * Versión que lanza: la que usan los llamadores que no distinguen entre evento
 * oculto y publicado.
 */
export function assertEventBankTransferReady({
  overrides,
  bankTransfer,
  bankTransferProfileId = null,
  profile = null,
  env = process.env,
} = {}) {
  const issue = checkEventBankTransferReady({
    overrides,
    bankTransfer,
    bankTransferProfileId,
    profile,
    env,
  })
  if (issue) throw bankTransferIssueError(issue)
}

/**
 * Destino de cobro Mercado Pago del evento (diagnóstico, no bloquea guardar).
 *
 * - `platform`: sin perfil propio → cuenta global `MERCADO_PAGO_*`.
 * - `profile`: perfil activo (OAuth o manual) con su `connectionStatus`.
 * - `missing`: id apuntando a un perfil inexistente o archivado.
 *
 * @param {{ mercadoPagoProfileId?: string|null, profile?: object|null }} args
 *   `profile` = fila mapeada si se encontró; `null` si se buscó y no existe;
 *   omitir / `undefined` solo cuando no hay `mercadoPagoProfileId`.
 */
export function resolveEventMercadoPagoReadiness({
  mercadoPagoProfileId = null,
  profile = undefined,
} = {}) {
  const profileId = mercadoPagoProfileId ?? null
  if (!profileId) {
    return {
      destination: 'platform',
      profileId: null,
      profileName: null,
      connectionStatus: null,
      active: null,
    }
  }

  if (profile == null || profile.active === false) {
    return {
      destination: 'missing',
      profileId,
      profileName: profile?.name ?? null,
      connectionStatus: null,
      active: false,
    }
  }

  const connectionStatus =
    profile.connectionStatus ?? mercadoPagoConnectionStatus(profile.config ?? {})

  return {
    destination: 'profile',
    profileId,
    profileName: profile.name ?? null,
    connectionStatus,
    active: true,
  }
}

/**
 * Chequeo espejo de transferencia: si MP está abierto por override del evento
 * y el perfil vinculado falta o necesita reconectar, devuelve el issue.
 * Sin override (hereda plataforma) o con destino sano → `null`.
 * No lanza: la ruta decide según publicado / oculto.
 */
export function checkEventMercadoPagoReady({
  overrides,
  mercadoPagoProfileId = null,
  profile = undefined,
} = {}) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized) return null
  if (!isEventChannelOpenAnywhere(normalized, 'mercado_pago')) return null

  const readiness = resolveEventMercadoPagoReadiness({ mercadoPagoProfileId, profile })
  if (readiness.destination === 'missing') {
    return {
      code: 'EVENT_MERCADO_PAGO_PROFILE_MISSING',
      message:
        'Mercado Pago está abierto para este evento pero la cuenta vinculada no existe o está archivada. Elegí otra cuenta en Ventas → Cobro o usá la cuenta general de PLU.',
      field: 'mercadoPagoProfileId',
      readiness,
    }
  }
  if (readiness.connectionStatus === 'needs_reconnect') {
    return {
      code: 'EVENT_MERCADO_PAGO_NEEDS_RECONNECT',
      message:
        'Mercado Pago está abierto para este evento pero la cuenta vinculada necesita reconectarse antes de poder cobrar.',
      field: 'mercadoPagoProfileId',
      readiness,
    }
  }
  return null
}

/**
 * Payload canónico para guardar / devolver en API admin y requirements.
 */
export function mapEventPaymentProfile(row) {
  if (!row) {
    return {
      paymentChannelOverrides: null,
      bankTransfer: { alias: '', cbu: '', holder: '' },
      bankTransferProfileId: null,
      cashPayment: { place: '', notes: '' },
    }
  }
  return {
    paymentChannelOverrides: normalizePaymentChannelOverrides(row.payment_channel_overrides),
    bankTransfer: {
      alias: trimText(row.bank_transfer_alias),
      cbu: trimText(row.bank_transfer_cbu),
      holder: trimText(row.bank_transfer_holder),
    },
    bankTransferProfileId: row.bank_transfer_profile_id ?? null,
    cashPayment: {
      place: trimText(row.cash_payment_place),
      notes: trimText(row.cash_payment_notes),
    },
  }
}

/**
 * Assert de plataforma + decisión del evento (registration/ticket).
 * Los cupones manuales (`override`) siguen saltando solo canales manuales a
 * nivel plataforma; un evento que cerró el canal no se reabre con cupón.
 *
 * Un canal que el evento abre explícitamente (`'open'`) cuenta como abierto
 * para la plataforma, pero no salta el maestro ni el alta del concepto: esos
 * se verifican aparte, antes de llegar acá.
 */
export function assertEventPaymentChannelEnabled(
  toggles,
  concept,
  channel,
  { override = false, eventOverrides = null } = {},
) {
  assertPaymentChannelEnabled(applyEventChannelOpens(toggles, eventOverrides), concept, channel, {
    override,
  })

  if (!EVENT_PAYMENT_CONCEPTS.includes(concept)) return

  // Por concepto: cerrar el efectivo para entradas no puede cerrarlo también
  // para la inscripción de atletas.
  const flags = eventChannelOverridesFor(eventOverrides, concept)
  if (!flags) return

  const remaining = PAYMENT_CHANNELS.filter((item) => flags[item] !== false)
  if (remaining.length === 0) {
    const upper = concept.toUpperCase()
    throw new HttpError(
      409,
      `No hay medios de pago disponibles para ${CONCEPT_LABEL[concept]} en este evento.`,
      { code: `${upper}_NO_PAYMENT_CHANNEL` },
    )
  }

  if (flags[channel] === false) {
    const upper = concept.toUpperCase()
    const openLabels = remaining.map((item) => CHANNEL_LABEL[item])
    const head = `El pago con ${CHANNEL_LABEL[channel]} no está habilitado para este evento.`
    throw new HttpError(
      409,
      openLabels.length ? `${head} Podés pagar con ${openLabels.join(' o ')}.` : head,
      { code: `${upper}_${CHANNEL_CODE[channel]}_DISABLED` },
    )
  }
}
