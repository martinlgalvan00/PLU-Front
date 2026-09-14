import { HttpError } from '../../lib/errors.js'
import {
  assertPaymentChannelEnabled,
  MANUAL_PAYMENT_CHANNELS,
  PAYMENT_CHANNELS,
} from '../../services/platformFeatureToggleService.js'
import {
  EVENT_PAYMENT_CONCEPTS,
  eventChannelOverridesFor,
  isEventChannelOpenAnywhere,
  isEventChannelOpenForConcept,
  normalizeEventPaymentChannelOverrides,
} from '../../../src/lib/eventPaymentChannels.js'

const CHANNEL_LABEL = {
  mercado_pago: 'Mercado Pago',
  bank_transfer: 'transferencia',
  cash_pitbull: 'efectivo en Pitbull',
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
 * `plataforma AND (override[concepto][canal] ?? true)` — el evento solo cierra.
 *
 * Sin `concept` responde por el evento entero: abierto si lo está en alguno de
 * los dos conceptos. Es lo que necesitan los bloques que configuran el canal
 * (alias de transferencia, perfil de MP), no el checkout.
 */
export function isEventChannelOpen(platformOpen, overrides, channel, concept = null) {
  if (!platformOpen) return false
  if (concept) return isEventChannelOpenForConcept(overrides, concept, channel)
  return isEventChannelOpenAnywhere(overrides, channel)
}

/**
 * Aplica el override del evento sobre availability pública (registration + ticket).
 * Membership no se toca: sigue 100% plataforma.
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

  return {
    ...availability,
    paymentChannels,
    registrationManualEnabled: manual('registration'),
    ticketManualEnabled: manual('ticket'),
  }
}

function trimText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

export function normalizeBankTransferInput(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { alias: '', cbu: '', holder: '' }
  }
  return {
    alias: trimText(raw.alias).slice(0, 120),
    cbu: trimText(raw.cbu).slice(0, 30),
    holder: trimText(raw.holder).slice(0, 160),
  }
}

/**
 * Alias/CBU/titular resueltos para mostrar en checkout.
 * Prioridad: perfil vinculado > columnas del evento (Fase A) > env global.
 */
export function resolveBankTransferDetails(eventRow = null, env = process.env, profile = null) {
  const globalAlias = trimText(env.VITE_PAYMENT_TRANSFER_ALIAS ?? env.PAYMENT_TRANSFER_ALIAS)
  const globalCbu = trimText(env.VITE_PAYMENT_TRANSFER_CBU ?? env.PAYMENT_TRANSFER_CBU)
  const globalHolder = trimText(env.VITE_PAYMENT_TRANSFER_HOLDER ?? env.PAYMENT_TRANSFER_HOLDER)

  const profileConfig =
    profile?.config ??
    eventRow?.bankTransferProfile?.config ??
    eventRow?.payment_profile?.config ??
    null

  return {
    alias:
      trimText(profileConfig?.alias) ||
      trimText(eventRow?.bank_transfer_alias ?? eventRow?.bankTransferAlias) ||
      globalAlias,
    cbu:
      trimText(profileConfig?.cbu) ||
      trimText(eventRow?.bank_transfer_cbu ?? eventRow?.bankTransferCbu) ||
      globalCbu,
    holder:
      trimText(profileConfig?.holder) ||
      trimText(eventRow?.bank_transfer_holder ?? eventRow?.bankTransferHolder) ||
      globalHolder,
  }
}

/**
 * Si el perfil personaliza canales y deja transferencia abierta, tiene que
 * haber un alias (perfil, evento o env). Evita publicar un evento que ofrezca
 * transferencia sin destino de cobro.
 */
export function assertEventBankTransferReady({
  overrides,
  bankTransfer,
  bankTransferProfileId = null,
  profile = null,
  env = process.env,
} = {}) {
  const normalized = normalizePaymentChannelOverrides(overrides)
  if (!normalized) return
  // Alcanza con que la transferencia siga abierta en alguno de los dos
  // conceptos: el alias es uno solo para todo el evento.
  if (!isEventChannelOpenAnywhere(normalized, 'bank_transfer')) return

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
  if (!details.alias) {
    throw new HttpError(
      400,
      'Este evento deja abierta la transferencia pero no hay alias configurado (ni perfil, ni evento, ni entorno).',
      { code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED' },
    )
  }
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
  }
}

/**
 * Assert de plataforma + restricción del evento (registration/ticket).
 * Los cupones manuales (`override`) siguen saltando solo canales manuales a
 * nivel plataforma; un evento que cerró el canal no se reabre con cupón.
 */
export function assertEventPaymentChannelEnabled(
  toggles,
  concept,
  channel,
  { override = false, eventOverrides = null } = {},
) {
  assertPaymentChannelEnabled(toggles, concept, channel, { override })

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
